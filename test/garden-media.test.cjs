const test = require('node:test')
const assert = require('node:assert/strict')

test('Sharp photo worker pool caps CPU-intensive decoding and bounds queued uploads', async () => {
  const { withMediaSlot } = require('../server/services/garden-media')
  let active = 0
  let peak = 0
  const runs = []
  for (let i = 0; i < 10; i++) {
    runs.push(withMediaSlot(async () => {
      active++
      peak = Math.max(peak, active)
      await new Promise(resolve => setImmediate(resolve))
      active--
    }))
  }
  await assert.rejects(withMediaSlot(() => Promise.resolve()), error => error.status === 503)
  await Promise.all(runs)
  assert.equal(peak, 2, 'at most two concurrent Sharp tasks')
  assert.equal(active, 0)
  await withMediaSlot(async () => { peak = Math.max(peak, ++active); active-- })
  assert.equal(active, 0, 'rejected queue must not leak work slots')
})
