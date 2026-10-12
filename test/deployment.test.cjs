const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'scripts/data-backup.mjs');
function run(args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}

test('backup and restore commands describe the required explicit apply flag', () => {
  for (const action of ['backup', 'verify', 'restore']) {
    const result = run([action, '--help']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Usage:/);
    if (action === 'restore') assert.match(result.stdout, /--apply/);
  }
});

test('restore rejects missing or damaged backups before connecting to a target', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yl-invalid-backup-'));
  try {
    fs.writeFileSync(path.join(tmp, 'data.tar.gz'), 'damaged');
    fs.writeFileSync(path.join(tmp, 'backup.json'), JSON.stringify({
      formatVersion: 1, archive: 'data.tar.gz', sha256: '0'.repeat(64),
    }));
    const result = run(['restore', tmp, '--host', 'unreachable.invalid', '--apply']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /checksum|SHA256/i);
    assert.doesNotMatch(result.stderr, /resolve hostname|ssh:/i);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('verify accepts a complete archive through Node and Bash and rejects changed payloads', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yl valid-backup-'));
  const payload = path.join(tmp, 'payload');
  const crypto = require('node:crypto');
  const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  try {
    fs.mkdirSync(path.join(payload, 'uploads'), { recursive: true });
    fs.writeFileSync(path.join(payload, 'database.sql'), 'CREATE TABLE fixture (id INT);\n');
    fs.writeFileSync(path.join(payload, '.env'), 'DB_NAME=fixture\n');
    fs.writeFileSync(path.join(payload, 'metadata.json'), JSON.stringify({
      formatVersion: 1, database: { characterSet: 'utf8mb4', collation: 'utf8mb4_unicode_ci' },
      files: { 'database.sql': hash(path.join(payload, 'database.sql')), '.env': hash(path.join(payload, '.env')) },
    }));
    const archive = path.join(tmp, 'data.tar.gz');
    function pack() {
      const tar = spawnSync('tar', ['-C', payload, '-czf', archive, 'database.sql', '.env', 'metadata.json', 'uploads'], { encoding: 'utf8' });
      assert.equal(tar.status, 0, tar.stderr);
      fs.writeFileSync(path.join(tmp, 'backup.json'), JSON.stringify({ formatVersion: 1, archive: 'data.tar.gz', sha256: hash(archive) }));
    }
    pack();
    const valid = run(['verify', tmp]);
    assert.equal(valid.status, 0, valid.stderr);
    const bash = process.env.BASH_BIN || (process.platform === 'win32' ? 'D:/Programs/Git/bin/bash.exe' : 'bash');
    const bashValid = spawnSync(bash, [path.join(root, 'verify_backup.sh').replace(/\\/g, '/'), tmp.replace(/\\/g, '/')], { encoding: 'utf8' });
    assert.equal(bashValid.status, 0, bashValid.stderr);
    fs.writeFileSync(path.join(payload, 'database.sql'), 'tampered');
    pack();
    const invalid = run(['verify', tmp]);
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, /checksum/i);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('commands reject target paths and arguments that could address unrelated data', () => {
  for (const args of [
    ['backup', '--base', '/'],
    ['backup', '--host', 'host;echo'],
    ['backup', '--unknown'],
  ]) {
    const result = run(args);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /invalid|unknown/i);
  }
});

test('CLI accepts equals-form target options without weakening target validation', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yl-inline-options-'));
  try {
    const accepted = run(['restore', tmp, '--base=/yl0126', '--host=unreachable.invalid', '--backup-dir=./backups']);
    assert.notEqual(accepted.status, 0);
    assert.match(accepted.stderr, /ENOENT/);
    assert.doesNotMatch(accepted.stderr, /Invalid target|Unknown argument|ssh:/);
    const rejected = run(['backup', '--base=/']);
    assert.match(rejected.stderr, /Invalid target/);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('Bash wrappers preserve remote POSIX paths while converting local Windows paths', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yl-bash-arguments-'));
  const bash = process.env.BASH_BIN || (process.platform === 'win32' ? 'D:/Programs/Git/bin/bash.exe' : 'bash');
  const capture = path.join(tmp, 'capture.cjs');
  try {
    fs.writeFileSync(capture, 'console.log(JSON.stringify(process.argv.slice(1))); process.exit(0);\n');
    const localDirectory = path.join(tmp, 'backup directory');
    const nativeToShell = value => process.platform === 'win32'
      ? value.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`)
      : value;
    for (const [wrapper, action] of [['backup_data.sh', 'backup'], ['restore_data.sh', 'restore'], ['verify_backup.sh', 'verify']]) {
      const args = [path.join(root, wrapper).replace(/\\/g, '/')];
      if (action !== 'backup') args.push(nativeToShell(localDirectory));
      args.push('--base', '/yl0126', '--backup-dir', nativeToShell(localDirectory), '--port', '22');
      const result = spawnSync(bash, args, { encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: `--require="${capture.replace(/\\/g, '/')}"` } });
      assert.equal(result.status, 0, result.stderr);
      const received = JSON.parse(result.stdout);
      const option = name => {
        const inline = received.find(arg => arg.startsWith(`${name}=`));
        return inline ? inline.slice(name.length + 1) : received[received.indexOf(name) + 1];
      };
      assert.equal(option('--base'), '/yl0126', `${wrapper} must not convert the remote path into a Windows path`);
      assert.equal(option('--port'), '22');
      assert.equal(path.resolve(option('--backup-dir')), localDirectory);
      assert.equal(path.resolve(received[0]), cli);
      assert.equal(received[1], action);
      if (action !== 'backup') assert.equal(path.resolve(received[2]), localDirectory);
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('the remote agent executes when delivered through SSH stdin', () => {
  const result = spawnSync(process.execPath, ['--input-type=commonjs', '-', 'backup', '/nonexistent-yl-test'], {
    input: fs.readFileSync(path.join(root, 'scripts/remote-data.cjs')), encoding: 'utf8',
  });
  assert.notEqual(result.status, 0, 'stdin agent must dispatch the requested action');
  assert.match(result.stderr, /Cannot find module|ENOENT/);
});

test('release metadata identifies both committed and uncommitted source', async () => {
  const { writeReleaseMetadata } = await import('../scripts/release-metadata.mjs');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yl-release-metadata-'));
  const git = args => {
    const result = spawnSync('git', args, { cwd: tmp, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  try {
    git(['init']);
    fs.writeFileSync(path.join(tmp, '.gitignore'), 'releases/\n');
    fs.writeFileSync(path.join(tmp, 'app.js'), 'original\n');
    git(['add', '.']);
    git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'fixture']);
    const outputDir = path.join(tmp, 'releases/test');
    fs.mkdirSync(outputDir, { recursive: true });
    const clean = writeReleaseMetadata({ rootDir: tmp, outputDir, releaseName: 'test' });
    assert.equal(clean.gitCommit, git(['rev-parse', 'HEAD']));
    assert.equal(clean.dirty, false);
    assert.ok(Date.parse(clean.builtAt));
    fs.writeFileSync(path.join(tmp, 'app.js'), 'uncommitted change\n');
    const dirty = writeReleaseMetadata({ rootDir: tmp, outputDir, releaseName: 'test' });
    assert.equal(dirty.dirty, true);
    assert.ok(dirty.changedPaths.some(p => p.includes('app.js')));
    assert.equal(JSON.parse(fs.readFileSync(path.join(outputDir, 'release.json'))).dirty, true);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('a failed pre-deploy backup prevents upload and start', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yl-deploy-order-'));
  const bash = process.env.BASH_BIN || (process.platform === 'win32' ? 'D:/Programs/Git/bin/bash.exe' : 'bash');
  try {
    fs.copyFileSync(path.join(root, 'release_deploy.sh'), path.join(tmp, 'release_deploy.sh'));
    fs.writeFileSync(path.join(tmp, 'release.sh'), '#!/usr/bin/env bash\nmkdir -p releases/release-test\nprintf "release-test\\n" > releases/.latest-release\n');
    fs.writeFileSync(path.join(tmp, 'backup_data.sh'), '#!/usr/bin/env bash\necho BACKUP_FAILED >&2\nexit 17\n');
    fs.chmodSync(path.join(tmp, 'release.sh'), 0o755);
    fs.chmodSync(path.join(tmp, 'backup_data.sh'), 0o755);
    const script = path.join(tmp, 'release_deploy.sh').replace(/\\/g, '/');
    const result = spawnSync(bash, [script, '--no-dryrun'], { encoding: 'utf8' });
    assert.equal(result.status, 17, result.stderr);
    assert.match(result.stderr, /BACKUP_FAILED/);
    assert.doesNotMatch(result.stdout, /开始上传|Deploy complete/);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
