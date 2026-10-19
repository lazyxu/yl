'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const script = path.join(root, 'scripts/activate-staged-release.sh')
const posixOnly = { skip: process.platform === 'win32' }

function prepare() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yl-release-rollback-'))
  const base = path.join(tmp, 'app')
  const stage = path.join(base, '.yl-releases', 'release-test-20261019')
  const bin = path.join(tmp, 'bin')
  const state = path.join(tmp, 'pm2-state')
  fs.mkdirSync(path.join(base, 'uploads'), { recursive: true })
  fs.mkdirSync(path.join(stage, 'dist'), { recursive: true })
  fs.mkdirSync(path.join(stage, 'node_modules', 'dotenv'), { recursive: true })
  fs.mkdirSync(bin)
  fs.writeFileSync(path.join(base, '.env'), 'PORT=3000\nDB_NAME=fixture\n')
  fs.writeFileSync(path.join(base, 'uploads', 'old.jpg'), 'old-photo-unchanged')
  fs.writeFileSync(path.join(base, 'index.js'), 'console.log("old release")\n')
  fs.writeFileSync(path.join(stage, 'index.js'), 'console.log("new release")\n')
  fs.writeFileSync(path.join(stage, 'package.json'), '{"name":"test-release","version":"1.0.0"}')
  fs.writeFileSync(path.join(stage, 'dist', 'index.html'), '<html>new release</html>')
  fs.writeFileSync(path.join(stage, 'node_modules', 'dotenv', 'index.js'),
    'module.exports.parse = (buffer) => Object.fromEntries(String(buffer).trim().split(/\\r?\\n/).map(line => line.split("=")));')
  fs.writeFileSync(state, base + '\n')

  const pm2 = [
    '#!/usr/bin/env bash', 'set -euo pipefail',
    'case "$1" in',
    '  jlist)',
    '    current="$(cat "$FAKE_PM2_STATE")"',
    '    if [[ "$current" == NONE ]]; then echo "[]"; else',
    "      node -e 'console.log(JSON.stringify([{name:\"yl\",pm2_env:{pm_cwd:process.argv[1],status:\"online\"}}]))' \"$current\"",
    '    fi',
    '    ;;',
    '  delete) echo NONE > "$FAKE_PM2_STATE" ;;',
    '  start)',
    '    if [[ "$FAIL_NEW_PM2" == 1 && "$PWD" == "$TARGET_STAGE" ]]; then exit 19; fi',
    '    pwd > "$FAKE_PM2_STATE"',
    '    ;;',
    '  *) echo "Unexpected pm2 action $1" >&2; exit 50 ;;',
    'esac',
  ].join('\n') + '\n'
  const npm = [
    '#!/usr/bin/env bash',
    'if [[ "$FAIL_INSTALL" == 1 ]]; then echo "Synthetic npm install failure" >&2; exit 23; fi',
    'exit 0',
  ].join('\n') + '\n'
  const curl = [
    '#!/usr/bin/env bash',
    'if [[ "$FAIL_NEW_HEALTH" == 1 && "$(cat "$FAKE_PM2_STATE")" == "$TARGET_STAGE" ]]; then exit 22; fi',
    'exit 0',
  ].join('\n') + '\n'
  for (const [name, data] of [['pm2', pm2], ['npm', npm], ['curl', curl]]) {
    const dest = path.join(bin, name)
    fs.writeFileSync(dest, data, { mode: 0o755 })
  }
  return {
    tmp, base, stage, state,
    env: {
      ...process.env,
      PATH: bin + ':' + process.env.PATH,
      FAKE_PM2_STATE: state,
      TARGET_STAGE: stage,
      FAIL_INSTALL: '0',
      FAIL_NEW_PM2: '0',
      FAIL_NEW_HEALTH: '0',
      YL_DEPLOY_HEALTH_ATTEMPTS: '1',
    },
  }
}

function run(fixture, overrides = {}) {
  const processResult = spawnSync('bash', [script, fixture.base, fixture.stage, '0'], {
    cwd: fixture.tmp,
    encoding: 'utf8',
    timeout: 30000,
    env: { ...fixture.env, ...overrides },
  })
  if (processResult.error) throw processResult.error
  return processResult
}

test('bad staging prerequisites do not stop an existing PM2 application', posixOnly, () => {
  const f = prepare()
  try {
    fs.unlinkSync(path.join(f.stage, 'dist', 'index.html'))
    const result = run(f)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /Missing runtime data/)
    assert.equal(fs.readFileSync(f.state, 'utf8').trim(), f.base)
  } finally { fs.rmSync(f.tmp, { recursive: true, force: true }) }
})

test('dependency install failure leaves the previous release running and uploads intact', posixOnly, () => {
  const f = prepare()
  try {
    const result = run(f, { FAIL_INSTALL: '1' })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /Synthetic npm install failure/)
    assert.equal(fs.readFileSync(f.state, 'utf8').trim(), f.base)
    assert.equal(fs.readFileSync(path.join(f.base, 'index.js'), 'utf8'), 'console.log("old release")\n')
    assert.equal(fs.readFileSync(path.join(f.base, 'uploads', 'old.jpg'), 'utf8'), 'old-photo-unchanged')
  } finally { fs.rmSync(f.tmp, { recursive: true, force: true }) }
})

test('PM2 launch failure restores the old application automatically', posixOnly, () => {
  const f = prepare()
  try {
    const result = run(f, { FAIL_NEW_PM2: '1' })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /rolling back application/)
    assert.equal(fs.readFileSync(f.state, 'utf8').trim(), f.base)
    assert.equal(fs.readFileSync(path.join(f.base, 'index.js'), 'utf8'), 'console.log("old release")\n')
  } finally { fs.rmSync(f.tmp, { recursive: true, force: true }) }
})

test('HTTP health check failure restores the previous running PM2 app', posixOnly, () => {
  const f = prepare()
  try {
    const result = run(f, { FAIL_NEW_HEALTH: '1' })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /health check|rolling back/i)
    assert.equal(fs.readFileSync(f.state, 'utf8').trim(), f.base)
  } finally { fs.rmSync(f.tmp, { recursive: true, force: true }) }
})

test('successful release switches PM2 cwd, retaining old code, credentials and uploads', posixOnly, () => {
  const f = prepare()
  try {
    const result = run(f)
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /Release activated/)
    assert.equal(fs.readFileSync(f.state, 'utf8').trim(), f.stage)
    assert.equal(fs.realpathSync(path.join(f.stage, '.env')), path.join(f.base, '.env'))
    assert.equal(fs.realpathSync(path.join(f.stage, 'uploads')), path.join(f.base, 'uploads'))
    assert.equal(fs.readFileSync(path.join(f.base, 'index.js'), 'utf8'), 'console.log("old release")\n')
    assert.equal(fs.readFileSync(path.join(f.base, 'uploads', 'old.jpg'), 'utf8'), 'old-photo-unchanged')
  } finally { fs.rmSync(f.tmp, { recursive: true, force: true }) }
})


test('SSH deployment stages code instead of extracting into the live application directory', () => {
  const deploy = fs.readFileSync(path.join(root, 'release_deploy.sh'), 'utf8')
  assert.match(deploy, /remote_stage="\$REMOTE_BASE\/\.yl-releases\/\$latest"/)
  assert.match(deploy, /tar -xzf - -C '\$remote_stage'/)
  assert.doesNotMatch(deploy, /cd '\$REMOTE_BASE' && tar -xzf -/)
  assert.match(deploy, /activate-staged-release\.sh/)
  assert.match(deploy, /backup_data\.sh/)
})
