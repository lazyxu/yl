const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');

test('real MySQL backup restores rows, binary uploads, and optional configuration', { skip: !process.env.BACKUP_TEST_MYSQL }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yl-roundtrip-'));
  const base = path.join(tmp, 'app');
  const backups = path.join(tmp, 'backups');
  const database = `yl_backup_test_${crypto.randomBytes(6).toString('hex')}`;
  const host = process.env.BACKUP_TEST_HOST || 'mysql';
  const user = process.env.BACKUP_TEST_USER || 'root';
  const password = process.env.BACKUP_TEST_PASSWORD || 'ci-only-password';
  const port = process.env.BACKUP_TEST_PORT || '3306';
  const config = path.join(tmp, 'test.cnf');
  const mysql = sql => {
    const result = spawnSync('mysql', [`--defaults-file=${config}`, '--batch', '--skip-column-names', '-e', sql], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const cli = args => {
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/data-backup.mjs'), ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  try {
    fs.mkdirSync(path.join(base, 'uploads'), { recursive: true });
    fs.symlinkSync(path.join(root, 'server/node_modules'), path.join(base, 'node_modules'), 'dir');
    const env = `DB_HOST=${host}\nDB_PORT=${port}\nDB_NAME=${database}\nDB_USER=${user}\nDB_PASSWORD=${password}\nRESTORE_SENTINEL=original\n`;
    fs.writeFileSync(path.join(base, '.env'), env);
    fs.writeFileSync(config, `[client]\nhost=${host}\nport=${port}\nuser=${user}\npassword=${password}\n`);
    const photo = Buffer.from([0, 1, 2, 255, 128, 0, 90]);
    fs.writeFileSync(path.join(base, 'uploads/photo.bin'), photo);
    mysql(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; CREATE TABLE \`${database}\`.reminders (id INT PRIMARY KEY, note TEXT, image_path TEXT) ENGINE=InnoDB; INSERT INTO \`${database}\`.reminders VALUES (1,'备份恢复验证','photo.bin');`);
    cli(['backup', '--local', '--base', base, '--backup-dir', backups]);
    const saved = path.join(backups, fs.readdirSync(backups)[0]);
    cli(['verify', saved]);
    mysql(`UPDATE \`${database}\`.reminders SET note='changed'; CREATE TABLE \`${database}\`.extra_table (id INT) ENGINE=InnoDB;`);
    fs.writeFileSync(path.join(base, 'uploads/photo.bin'), 'changed');
    fs.writeFileSync(path.join(base, 'uploads/extra.bin'), 'extra');
    fs.writeFileSync(path.join(base, '.env'), env.replace('original', 'changed'));
    // A local target must explicitly opt out of PM2, just like an SSH target.
    const pm2Required = spawnSync(process.execPath, [path.join(root, 'scripts/data-backup.mjs'), 'restore', saved, '--local', '--base', base, '--backup-dir', backups, '--apply'], { encoding: 'utf8' });
    assert.notEqual(pm2Required.status, 0);
    assert.match(pm2Required.stderr, /pm2/);
    assert.equal(mysql(`SELECT note FROM \`${database}\`.reminders`), 'changed');
    // Restoring source configuration must never repoint a different target DB.
    const otherDatabase = `${database}_other`;
    mysql(`CREATE DATABASE \`${otherDatabase}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; CREATE TABLE \`${otherDatabase}\`.sentinel (id INT) ENGINE=InnoDB; INSERT INTO \`${otherDatabase}\`.sentinel VALUES (7);`);
    fs.writeFileSync(path.join(base, '.env'), env.replace(database, otherDatabase));
    try {
      const identityRejected = spawnSync(process.execPath, [path.join(root, 'scripts/data-backup.mjs'), 'restore', saved, '--local', '--base', base, '--backup-dir', backups, '--apply', '--restore-env', '--no-pm2'], { encoding: 'utf8' });
      assert.notEqual(identityRejected.status, 0);
      assert.match(identityRejected.stderr, /database identity/);
      assert.equal(mysql(`SELECT id FROM \`${otherDatabase}\`.sentinel`), '7');
    } finally {
      mysql(`DROP DATABASE \`${otherDatabase}\``);
      fs.writeFileSync(path.join(base, '.env'), env.replace('original', 'changed'));
    }
    cli(['restore', saved, '--local', '--base', base, '--backup-dir', backups]);
    assert.equal(mysql(`SELECT note FROM \`${database}\`.reminders`), 'changed', 'preview must leave the target unchanged');
    const backupsBeforeApply = fs.readdirSync(backups).length;
    cli(['restore', saved, '--local', '--base', base, '--backup-dir', backups, '--apply', '--no-pm2']);
    assert.equal(mysql(`SELECT note FROM \`${database}\`.reminders`), '备份恢复验证');
    assert.equal(mysql(`SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='${database}' AND TABLE_NAME='extra_table'`), '0');
    assert.deepEqual(fs.readFileSync(path.join(base, 'uploads/photo.bin')), photo);
    assert.equal(fs.existsSync(path.join(base, 'uploads/extra.bin')), false);
    assert.match(fs.readFileSync(path.join(base, '.env'), 'utf8'), /RESTORE_SENTINEL=changed/);
    assert.equal(fs.readdirSync(backups).length, backupsBeforeApply + 1, 'apply must create a pre-restore backup');
    cli(['restore', saved, '--local', '--base', base, '--backup-dir', backups, '--apply', '--restore-env', '--no-pm2']);
    assert.equal(fs.readFileSync(path.join(base, '.env'), 'utf8'), env);
    // PM2 is an external boundary; snapshots and the MySQL data remain real.
    const bin = path.join(tmp, 'bin');
    fs.mkdirSync(bin);
    const state = path.join(tmp, 'pm2-state');
    const log = path.join(tmp, 'pm2-log');
    fs.writeFileSync(state, 'online');
    fs.writeFileSync(path.join(bin, 'pm2'), `#!/usr/bin/env node
const fs=require('fs'); const {spawnSync}=require('child_process');
const [action,id]=process.argv.slice(2);
if(action==='jlist') console.log(JSON.stringify([{name:'yl',pm_id:91,pm2_env:{pm_cwd:${JSON.stringify(base)},status:fs.readFileSync(${JSON.stringify(state)},'utf8')}}]));
else {
  if(id!=='91') process.exit(19);
  fs.appendFileSync(${JSON.stringify(log)},action+' '+id+'\\n');
  if(action==='stop') {
    const r=spawnSync('mysql',[${JSON.stringify(`--defaults-file=${config}`)},'-e',${JSON.stringify(`INSERT INTO \`${database}\`.reminders VALUES (2,'last-before-stop',NULL);`)}]);
    if(r.status!==0) process.exit(20);
    fs.writeFileSync(${JSON.stringify(state)},'stopped');
  } else if(action==='restart') fs.writeFileSync(${JSON.stringify(state)},'online');
  else process.exit(21);
}
`);
    fs.chmodSync(path.join(bin, 'pm2'), 0o755);
    const beforePauseRestore = new Set(fs.readdirSync(backups));
    const pm2Restore = spawnSync(process.execPath, [path.join(root, 'scripts/data-backup.mjs'), 'restore', saved, '--local', '--base', base, '--backup-dir', backups, '--apply'], { encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
    assert.equal(pm2Restore.status, 0, pm2Restore.stderr);
    assert.equal(fs.readFileSync(log, 'utf8'), 'stop 91\nrestart 91\n');
    assert.equal(fs.readFileSync(state, 'utf8'), 'online');
    assert.equal(mysql(`SELECT COUNT(*) FROM \`${database}\`.reminders`), '1');
    const safetyName = fs.readdirSync(backups).find(name => !beforePauseRestore.has(name));
    const { verifyArchive } = require('../scripts/remote-data.cjs');
    const safety = verifyArchive(path.join(backups, safetyName, 'data.tar.gz'));
    try { assert.match(fs.readFileSync(path.join(safety.directory, 'database.sql'), 'utf8'), /last-before-stop/, 'final safety snapshot must include the last write before PM2 stopped'); }
    finally { fs.rmSync(safety.directory, { recursive: true, force: true }); }
    const archive = path.join(saved, 'data.tar.gz');
    fs.appendFileSync(archive, 'corruption');
    const rejected = spawnSync(process.execPath, [path.join(root, 'scripts/data-backup.mjs'), 'restore', saved, '--local', '--base', base, '--apply'], { encoding: 'utf8' });
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /checksum/i);
    assert.equal(mysql(`SELECT note FROM \`${database}\`.reminders`), '备份恢复验证');
  } finally {
    try { mysql(`DROP DATABASE IF EXISTS \`${database}\``); }
    finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
});
