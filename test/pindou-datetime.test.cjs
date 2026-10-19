const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

test('pindou history form preserves wall-clock times in Asia/Tokyo and America/New_York', () => {
  const root = path.resolve(__dirname, '..')
  const script = [
    "import { toDatetimeLocal, fromDatetimeLocal } from './src/dateTime.js'",
    "const timestamp = '2026-10-18T12:30:00.000Z'",
    "const shown = toDatetimeLocal(timestamp)",
    "console.log(JSON.stringify({ shown, saved: fromDatetimeLocal(shown) }))",
  ].join('\n')
  for (const [timezone, expected] of [
    ['Asia/Tokyo', '2026-10-18T21:30'],
    ['America/New_York', '2026-10-18T08:30'],
  ]) {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: root, env: { ...process.env, TZ: timezone }, encoding: 'utf8',
    })
    assert.equal(result.status, 0, result.stderr)
    const data = JSON.parse(result.stdout.trim())
    assert.equal(data.shown, expected)
    assert.equal(data.saved, '2026-10-18T12:30:00.000Z')
  }
})
test('pindou history rejects impossible local dates', async () => {
  const { fromDatetimeLocal, toDatetimeLocal } = await import('../src/dateTime.js')
  assert.throws(() => fromDatetimeLocal('2026-02-30T12:00'), /有效/)
  assert.throws(() => fromDatetimeLocal('2026-10-18T25:00'), /有效/)
  assert.throws(() => fromDatetimeLocal(''), /有效/)
  assert.equal(toDatetimeLocal('not-a-date'), '')
})
