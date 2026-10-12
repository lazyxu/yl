const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');

test('MySQL API seeds defaults, persists edits across restart, rejects invalid and stale writes', { skip: !process.env.BACKUP_TEST_MYSQL }, async () => {
  const database = `yl_settings_test_${crypto.randomBytes(6).toString('hex')}`;
  Object.assign(process.env, {
    DB_HOST: process.env.BACKUP_TEST_HOST || 'mysql', DB_NAME: database,
    DB_USER: process.env.BACKUP_TEST_USER || 'root',
    DB_PASSWORD: process.env.BACKUP_TEST_PASSWORD || 'ci-only-password',
  });
  const mysql = require('../server/node_modules/mysql2/promise');
  const express = require('../server/node_modules/express');
  const admin = await mysql.createConnection({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
  let sequelize, server, freshProcess, fixture;
  try {
    await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    sequelize = require('../server/sequelize');
    const router = require('../server/routes/settings');
    await sequelize.sync();
    const app = express();
    app.use('/api/settings/shifts', router);
    const listen = () => new Promise(resolve => { server = app.listen(0, '0.0.0.0', resolve); });
    await listen();
    const api = () => `http://127.0.0.1:${server.address().port}/api/settings/shifts`;
    const initial = await fetch(api()).then(r => r.json());
    assert.equal(initial.rules.length, 4);
    assert.equal(initial.rules[3].startDate, '2026-10-05');
    const desired = [{ startDate: '2026-10-12', shifts: ['休息', '夜班', '白班'] }];
    const save = (rules, version) => fetch(api(), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules, version }) });
    const updatedResponse = await save(desired, initial.version);
    assert.equal(updatedResponse.status, 200);
    const updated = await updatedResponse.json();
    assert.deepEqual(updated.rules, desired);
    assert.equal(updated.version, initial.version + 1);
    await new Promise(resolve => server.close(resolve));
    await listen();
    assert.deepEqual(await fetch(api()).then(r => r.json()), updated, 'server restart must not reset stored settings');
    assert.equal((await save([], updated.version)).status, 400);
    assert.equal((await save(desired, initial.version)).status, 409);
    assert.deepEqual(await fetch(api()).then(r => r.json()), updated);
    const concurrent = await Promise.all([
      save([{ startDate: '2026-10-12', shifts: ['白班'] }], updated.version),
      save([{ startDate: '2026-10-12', shifts: ['夜班'] }], updated.version),
    ]);
    assert.deepEqual(concurrent.map(r => r.status).sort(), [200, 409], 'only one simultaneous save may succeed');
    const latest = await fetch(api()).then(r => r.json());
    const largeRules = Array.from({ length: 100 }, (_, i) => ({
      startDate: new Date(Date.UTC(2027, 0, i + 1)).toISOString().slice(0, 10),
      shifts: Array(366).fill('白班'),
    }));
    assert.ok(Buffer.byteLength(JSON.stringify({ rules: largeRules, version: latest.version })) > 100 * 1024);
    const largeResponse = await save(largeRules, latest.version);
    assert.equal(largeResponse.status, 200, 'every supported configuration must fit the API request limit');
    const persisted = await largeResponse.json();
    assert.deepEqual(persisted.rules, largeRules);
    fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'yl-settings-startup-'));
    const freshServer = path.join(fixture, 'server');
    fs.cpSync(path.join(__dirname, '../server'), freshServer, { recursive: true, filter: file => !['node_modules', 'uploads', 'dist'].includes(path.basename(file)) && !path.basename(file).startsWith('.env') });
    fs.symlinkSync(path.join(__dirname, '../server/node_modules'), path.join(freshServer, 'node_modules'), 'dir');
    freshProcess = spawn(process.execPath, ['-e', 'require("./index.js").start().then(server => console.log("TEST_PORT="+server.address().port))'], { cwd: freshServer, env: { ...process.env, PORT: '0', HOST: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    const freshPort = await new Promise((resolve, reject) => {
      let stdout = '', stderr = '';
      const deadline = setTimeout(() => reject(new Error('Fresh backend startup timed out')), 30000);
      freshProcess.stderr.on('data', chunk => { stderr += chunk; });
      freshProcess.stdout.on('data', chunk => {
        stdout += chunk;
        const match = stdout.match(/TEST_PORT=(\d+)/);
        if (match) { clearTimeout(deadline); resolve(Number(match[1])); }
      });
      freshProcess.once('exit', code => { clearTimeout(deadline); reject(new Error(`Fresh backend exited (${code}): ${stderr}`)); });
    });
    assert.deepEqual(await fetch(`http://127.0.0.1:${freshPort}/api/settings/shifts`).then(r => r.json()), persisted, 'a fresh index.js process must keep database settings');
    const row = await sequelize.query('SELECT value FROM app_settings WHERE `key` = "shift-rules"', { type: sequelize.QueryTypes.SELECT });
    assert.equal(row.length, 1);
    assert.deepEqual(typeof row[0].value === 'string' ? JSON.parse(row[0].value) : row[0].value, largeRules);
  } finally {
    if (freshProcess && freshProcess.exitCode === null) {
      const closed = new Promise(resolve => freshProcess.once('exit', resolve));
      freshProcess.kill();
      await closed;
    }
    if (fixture) {
      if (!path.resolve(fixture).startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error('Unexpected cleanup directory');
      fs.rmSync(fixture, { recursive: true, force: true });
    }
    if (server) await new Promise(resolve => server.close(resolve));
    if (sequelize) await sequelize.close();
    await admin.query(`DROP DATABASE IF EXISTS \`${database}\``);
    await admin.end();
  }
});
