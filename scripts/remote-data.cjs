// Sent over SSH stdin; no installation on the production machine is required.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}): ${result.stderr || ''}`);
  return result.stdout;
}

function sha256(file) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buffer = Buffer.alloc(1024 * 1024);
  try {
    let size;
    while ((size = fs.readSync(fd, buffer, 0, buffer.length, null))) hash.update(buffer.subarray(0, size));
  } finally { fs.closeSync(fd); }
  return hash.digest('hex');
}

function filesUnder(base, relative = '') {
  const result = [];
  for (const entry of fs.readdirSync(path.join(base, relative), { withFileTypes: true })) {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Symlinks are not supported in backup data: ${name}`);
    if (entry.isDirectory()) result.push(...filesUnder(base, name));
    else if (entry.isFile()) result.push(name);
    else throw new Error(`Unsupported backup file type: ${name}`);
  }
  return result.sort();
}

function verifyArchive(archive, expectedSha) {
  if (expectedSha && sha256(archive) !== expectedSha) throw new Error('Backup SHA256 checksum mismatch');
  // GNU tar treats a drive-letter archive path as a remote host specification.
  // Use the archive's directory as cwd and a local filename for GNU/BSD tar.
  const archivePath = path.resolve(archive);
  const archiveFile = path.basename(archivePath);
  const tarOptions = { cwd: path.dirname(archivePath) };
  const names = run('tar', ['-tzf', archiveFile], tarOptions).trim().split(/\r?\n/);
  for (const raw of names) {
    const name = raw.replace(/^\.\//, '').replace(/\/$/, '');
    if (!name || name.includes('\\') || name.split('/').some(p => p === '..' || p === '.') ||
        !/^(database\.sql|metadata\.json|\.env|release\.json|uploads(?:\/[^\r\n]+)?)$/.test(name)) {
      throw new Error(`Invalid archive member: ${raw}`);
    }
  }
  const listing = run('tar', ['-tvzf', archiveFile], tarOptions);
  if (listing.split(/\r?\n/).filter(Boolean).some(line => !/^[-d]/.test(line))) {
    throw new Error('Archive links and special files are not allowed');
  }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'yl-verify-'));
  fs.chmodSync(directory, 0o700);
  try {
    run('tar', ['-xzf', archiveFile, '-C', directory], tarOptions);
    const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'metadata.json'), 'utf8'));
    if (metadata.formatVersion !== 1 || !metadata.files || !metadata.database ||
        !/^[a-zA-Z0-9_]+$/.test(metadata.database.characterSet) ||
        !/^[a-zA-Z0-9_]+$/.test(metadata.database.collation)) throw new Error('Invalid backup metadata');
    const actual = filesUnder(directory).filter(name => name !== 'metadata.json');
    const expected = Object.keys(metadata.files).sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected) ||
        !actual.includes('database.sql') || !actual.includes('.env') ||
        !fs.statSync(path.join(directory, 'uploads')).isDirectory()) throw new Error('Backup file manifest mismatch');
    for (const name of actual) {
      if (sha256(path.join(directory, name)) !== metadata.files[name]) throw new Error(`File checksum mismatch: ${name}`);
    }
    if (!fs.statSync(path.join(directory, 'database.sql')).size) throw new Error('Empty database dump');
    return { directory, metadata };
  } catch (error) {
    fs.rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

function databaseConfig(base, stage, envFile = path.join(base, '.env'), configName = 'mysql.cnf') {
  const dotenv = require(path.join(base, 'node_modules/dotenv'));
  const env = dotenv.parse(fs.readFileSync(envFile));
  const name = env.DB_NAME;
  if (!name || !/^[a-zA-Z0-9_$-]+$/.test(name) || !env.DB_USER || env.DB_PASSWORD === undefined) {
    throw new Error('Invalid or missing database settings in target .env');
  }
  const escape = value => String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
  const config = path.join(stage, configName);
  const values = { host: env.DB_HOST || 'localhost', user: env.DB_USER, password: env.DB_PASSWORD, port: env.DB_PORT || '3306' };
  fs.writeFileSync(config, '[client]\n' + Object.entries(values).map(([key, value]) => `${key}="${escape(value)}"\n`).join(''), { mode: 0o600 });
  return { name, config, identity: [values.host, values.port, name] };
}

function backup(base) {
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'yl-backup-'));
  fs.chmodSync(stage, 0o700);
  try {
    const { name, config } = databaseConfig(base, stage);
    const query = sql => run('mysql', [`--defaults-file=${config}`, '--batch', '--skip-column-names', '-e', sql]).trim();
    const schema = query(`SELECT DEFAULT_CHARACTER_SET_NAME, DEFAULT_COLLATION_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='${name}'`).split('\t');
    if (schema.length !== 2) throw new Error('Target database does not exist');
    const engines = query(`SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA='${name}' AND TABLE_TYPE='BASE TABLE'`);
    if (engines && engines.split('\n').some(engine => engine !== 'InnoDB')) throw new Error('Consistent backup requires InnoDB tables');
    const args = [`--defaults-file=${config}`, '--single-transaction', '--quick', '--hex-blob', '--routines', '--events', '--triggers', '--no-tablespaces', '--default-character-set=utf8mb4'];
    if (!/mariadb/i.test(run('mysqldump', ['--version']))) args.push('--set-gtid-purged=OFF', '--column-statistics=0');
    args.push(name);
    const fd = fs.openSync(path.join(stage, 'database.sql'), 'wx', 0o600);
    try { run('mysqldump', args, { stdio: ['ignore', fd, 'pipe'] }); }
    finally { fs.closeSync(fd); }
    fs.unlinkSync(config);
    fs.copyFileSync(path.join(base, '.env'), path.join(stage, '.env'));
    // Uploads are append-only in the application; copy them after the DB snapshot.
    if (fs.existsSync(path.join(base, 'uploads'))) fs.cpSync(path.join(base, 'uploads'), path.join(stage, 'uploads'), { recursive: true });
    else fs.mkdirSync(path.join(stage, 'uploads'));
    if (fs.existsSync(path.join(base, 'release.json'))) fs.copyFileSync(path.join(base, 'release.json'), path.join(stage, 'release.json'));
    const metadata = {
      formatVersion: 1, createdAt: new Date().toISOString(), sourceBase: base,
      database: { name, characterSet: schema[0], collation: schema[1] },
      files: Object.fromEntries(filesUnder(stage).map(file => [file, sha256(path.join(stage, file))])),
    };
    fs.writeFileSync(path.join(stage, 'metadata.json'), JSON.stringify(metadata, null, 2), { mode: 0o600 });
    run('tar', ['-C', stage, '-czf', '-', 'database.sql', 'uploads', '.env', 'metadata.json', ...(metadata.files['release.json'] ? ['release.json'] : [])], { stdio: ['ignore', 'inherit', 'pipe'] });
  } finally { fs.rmSync(stage, { recursive: true, force: true }); }
}

function restoreConfiguration(base, directory, metadata, restoreEnv) {
    const target = databaseConfig(base, directory);
    const { name, config } = target;
    if (restoreEnv) {
      const saved = databaseConfig(base, directory, path.join(directory, '.env'), 'restored-mysql.cnf');
      if (JSON.stringify(target.identity) !== JSON.stringify(saved.identity)) throw new Error('Restoring .env would change the target database identity; omit --restore-env for a different target');
      run('mysql', [`--defaults-file=${saved.config}`, name, '-e', 'SELECT 1']);
    }
    const { characterSet, collation } = metadata.database;
    const supported = run('mysql', [`--defaults-file=${config}`, '--batch', '--skip-column-names', '-e', `SELECT COUNT(*) FROM information_schema.COLLATIONS WHERE COLLATION_NAME='${collation}' AND CHARACTER_SET_NAME='${characterSet}'`]).trim();
    if (supported !== '1') throw new Error('Unsupported backup character set/collation on target');
    // Check CREATE privileges and metadata before dropping any existing data.
    run('mysql', [`--defaults-file=${config}`, '-e', `CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET ${characterSet} COLLATE ${collation};`]);
    return { name, config };
}

function targetProcesses(base) {
  const processes = JSON.parse(run('pm2', ['jlist']));
  const apps = processes.filter(p => p.name === 'yl');
  if (!apps.length || apps.some(p => path.resolve(p.pm2_env.pm_cwd) !== path.resolve(base) || !Number.isInteger(p.pm_id))) throw new Error('PM2 yl processes do not all belong to target directory; use --no-pm2 only for an offline target');
  return apps;
}

function pauseTarget(base) {
  const paused = [];
  try {
    for (const app of targetProcesses(base).filter(p => p.pm2_env.status === 'online')) {
      run('pm2', ['stop', String(app.pm_id)]);
      paused.push(app.pm_id);
    }
    return paused;
  } catch (error) {
    for (const id of paused) run('pm2', ['restart', String(id), '--update-env']);
    throw error;
  }
}

function resumeTarget(base, ids) {
  const apps = targetProcesses(base);
  if (!Array.isArray(ids) || ids.some(id => !Number.isInteger(id) || !apps.some(app => app.pm_id === id))) throw new Error('Invalid PM2 process IDs to resume');
  for (const id of ids) run('pm2', ['restart', String(id), '--update-env']);
}

function restore(base, archive, expectedSha, restoreEnv, noPm2) {
  const verified = verifyArchive(archive, expectedSha);
  const { directory, metadata } = verified;
  const paused = [];
  try {
    const { name, config } = restoreConfiguration(base, directory, metadata, restoreEnv);
    const { characterSet, collation } = metadata.database;
    if (!noPm2) {
      paused.push(...pauseTarget(base));
    }
    run('mysql', [`--defaults-file=${config}`, '-e', `DROP DATABASE IF EXISTS \`${name}\`; CREATE DATABASE \`${name}\` CHARACTER SET ${characterSet} COLLATE ${collation};`]);
    const fd = fs.openSync(path.join(directory, 'database.sql'), 'r');
    try { run('mysql', [`--defaults-file=${config}`, '--default-character-set=utf8mb4', name], { stdio: [fd, 'pipe', 'pipe'] }); }
    finally { fs.closeSync(fd); }
    const uploads = path.join(base, 'uploads');
    const previous = path.join(base, `.uploads-before-restore-${crypto.randomUUID()}`);
    const incoming = path.join(base, `.uploads-restored-${crypto.randomUUID()}`);
    fs.cpSync(path.join(directory, 'uploads'), incoming, { recursive: true });
    if (fs.existsSync(uploads)) fs.renameSync(uploads, previous);
    try { fs.renameSync(incoming, uploads); }
    catch (error) { if (fs.existsSync(previous)) fs.renameSync(previous, uploads); throw error; }
    // Keep the previous uploads directory until the data restore has completed.
    if (restoreEnv) { fs.copyFileSync(path.join(directory, '.env'), path.join(base, '.env')); fs.chmodSync(path.join(base, '.env'), 0o600); }
    for (const id of paused) run('pm2', ['restart', String(id), '--update-env']);
    fs.rmSync(previous, { recursive: true, force: true });
    console.log('Data restored successfully');
  } catch (error) {
    if (paused.length) console.error('Restore failed; paused yl processes may remain stopped. Recover with the pre-restore backup before restarting them.');
    throw error;
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

module.exports = { verifyArchive, sha256, filesUnder };
if (require.main === module || process.argv[1] === '-') {
  const [action, base, archive, expectedSha, restoreEnv, noPm2] = process.argv.slice(2);
  try {
    if (!path.isAbsolute(base) || path.resolve(base) === path.parse(base).root) throw new Error('Invalid target base');
    if (action === 'backup') backup(base);
    else if (action === 'restore') restore(base, archive, expectedSha, restoreEnv === '1', noPm2 === '1');
    else if (action === 'pause') console.log(JSON.stringify(pauseTarget(base)));
    else if (action === 'resume') resumeTarget(base, JSON.parse(archive));
    else if (action === 'preflight') {
      const checked = verifyArchive(archive, expectedSha);
      try { restoreConfiguration(base, checked.directory, checked.metadata, restoreEnv === '1'); }
      finally { fs.rmSync(checked.directory, { recursive: true, force: true }); }
    }
    else throw new Error('Unknown remote action');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
