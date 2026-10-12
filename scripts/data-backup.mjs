import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const agent = fileURLToPath(new URL('./remote-data.cjs', import.meta.url));
const { verifyArchive, sha256 } = require(agent);
const root = fileURLToPath(new URL('../', import.meta.url));
const quote = value => `'${String(value).replace(/'/g, `'\\''`)}'`;

function options(args) {
  const result = { host: 't-fluid.com', user: 'root', port: '22', base: '/yl0126', backupDir: path.join(root, 'backups'), apply: false, local: false, restoreEnv: false, noPm2: false };
  const values = { '--host': 'host', '--user': 'user', '--port': 'port', '--base': 'base', '--backup-dir': 'backupDir' };
  for (let i = 0; i < args.length; i++) {
    const value = args[i];
    if (values[value]) {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing value: ${value}`);
      result[values[value]] = args[++i];
    } else if (value === '--apply') result.apply = true;
    else if (value === '--local') result.local = true;
    else if (value === '--restore-env') result.restoreEnv = true;
    else if (value === '--no-pm2') result.noPm2 = true;
    else if (!value.startsWith('-') && !result.backup) result.backup = path.resolve(value);
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(result.host) || !/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(result.user) ||
      !/^\d+$/.test(result.port) || Number(result.port) < 1 || Number(result.port) > 65535 ||
      !path.posix.isAbsolute(result.base) || result.base.includes('..') || result.base.includes('\n') || result.base === '/') throw new Error('Invalid target host, user, port or base');
  result.backupDir = path.resolve(result.backupDir);
  return result;
}

function run(command, args, extra = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...extra });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}): ${result.stderr || ''}`);
  return result.stdout;
}

function sshArgs(opts, command) {
  return ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-o', 'StrictHostKeyChecking=accept-new', '-p', opts.port, `${opts.user}@${opts.host}`, command];
}

function remote(opts, action, args = [], stdout = 'pipe') {
  if (opts.local) return run(process.execPath, [agent, action, opts.base, ...args], { stdio: ['ignore', stdout, 'pipe'] });
  const command = ['node', '--input-type=commonjs', '-', action, opts.base, ...args].map(quote).join(' ');
  return run('ssh', sshArgs(opts, command), { input: fs.readFileSync(agent), stdio: ['pipe', stdout, 'pipe'] });
}

function verify(directory) {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'backup.json'), 'utf8'));
  if (manifest.formatVersion !== 1 || manifest.archive !== 'data.tar.gz' || !/^[a-f0-9]{64}$/.test(manifest.sha256)) throw new Error('Invalid backup manifest');
  const archive = path.join(directory, manifest.archive);
  const checked = verifyArchive(archive, manifest.sha256);
  fs.rmSync(checked.directory, { recursive: true, force: true });
  return { archive, manifest, metadata: checked.metadata };
}

function backup(opts) {
  fs.mkdirSync(opts.backupDir, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const directory = path.join(opts.backupDir, `backup-${opts.local ? 'local' : opts.host}-${stamp}-${crypto.randomBytes(3).toString('hex')}`);
  fs.mkdirSync(directory, { mode: 0o700 });
  const archive = path.join(directory, 'data.tar.gz');
  try {
    const fd = fs.openSync(archive, 'wx', 0o600);
    try { remote(opts, 'backup', [], fd); } finally { fs.closeSync(fd); }
    const checksum = sha256(archive);
    const checked = verifyArchive(archive, checksum);
    fs.rmSync(checked.directory, { recursive: true, force: true });
    const manifest = { formatVersion: 1, archive: 'data.tar.gz', sha256: checksum, bytes: fs.statSync(archive).size, createdAt: checked.metadata.createdAt, source: { host: opts.host, user: opts.user, port: opts.port, base: opts.base } };
    fs.writeFileSync(path.join(directory, 'backup.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
    verify(directory);
    console.log(`Verified backup: ${directory}`);
    return directory;
  } catch (error) {
    fs.rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

function restore(opts) {
  if (!opts.backup) throw new Error('Missing backup directory');
  const { archive, manifest, metadata } = verify(opts.backup);
  console.log(`Verified backup from ${metadata.createdAt}; target ${opts.local ? 'local' : `${opts.user}@${opts.host}`}:${opts.base}`);
  if (!opts.apply) {
    console.log('Preview only. Add --apply to replace the target database and uploads. .env is restored only with --restore-env.');
    return;
  }
  function apply(archivePath) {
    remote(opts, 'preflight', [archivePath, manifest.sha256, opts.restoreEnv ? '1' : '0']);
    const paused = opts.noPm2 ? [] : JSON.parse(remote(opts, 'pause'));
    try {
      const safety = backup(opts);
      console.log(`Pre-restore backup (writers stopped): ${safety}`);
    } catch (error) {
      if (paused.length) remote(opts, 'resume', [JSON.stringify(paused)]);
      throw error;
    }
    try {
      console.log(remote(opts, 'restore', [archivePath, manifest.sha256, opts.restoreEnv ? '1' : '0', opts.noPm2 ? '1' : '0']));
    } catch (error) {
      if (paused.length) console.error('Data restore failed; target yl remains stopped. Use the printed pre-restore backup to recover.');
      throw error;
    }
    if (paused.length) remote(opts, 'resume', [JSON.stringify(paused)]);
  }
  if (opts.local) {
    apply(archive);
    return;
  }
  const stage = run('ssh', sshArgs(opts, 'umask 077; mktemp -d /tmp/yl-restore.XXXXXX')).trim();
  if (!/^\/tmp\/yl-restore\.[a-zA-Z0-9]+$/.test(stage)) throw new Error('Invalid remote staging directory');
  const remoteArchive = `${stage}/data.tar.gz`;
  try {
    const fd = fs.openSync(archive, 'r');
    try { run('ssh', sshArgs(opts, `umask 077; cat > ${quote(remoteArchive)}`), { stdio: [fd, 'pipe', 'pipe'] }); }
    finally { fs.closeSync(fd); }
    apply(remoteArchive);
  } finally {
    run('ssh', sshArgs(opts, `rm -f ${quote(remoteArchive)}; rmdir ${quote(stage)}`));
  }
}

try {
  const [action, ...args] = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log(`Usage: ${action} ${action === 'backup' ? '' : '<backup-directory> '}[--host host] [--user user] [--port port] [--base /path] [--backup-dir path] [--local]${action === 'restore' ? ' [--apply] [--restore-env] [--no-pm2]' : ''}`);
  } else {
    const opts = options(args);
    if (action === 'backup') backup(opts);
    else if (action === 'verify') { if (!opts.backup) throw new Error('Missing backup directory'); verify(opts.backup); console.log('Backup integrity verified'); }
    else if (action === 'restore') restore(opts);
    else throw new Error('Unknown command; use backup, verify or restore');
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
