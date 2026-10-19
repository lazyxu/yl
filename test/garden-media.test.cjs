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


test('HEIC fallback rejects truncated or non-HEIC ISO-BMFF containers', async () => {
  const fs = require('node:fs')
  const os = require('node:os')
  const path = require('node:path')
  const { hasHeicStructure } = require('../server/services/garden-media')
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'yl-heic-negative-'))
  try {
    const file = path.join(directory, 'broken.heic')
    const incomplete = Buffer.alloc(20)
    incomplete.writeUInt32BE(20, 0)
    incomplete.write('ftyp', 4)
    incomplete.write('heic', 8)
    incomplete.write('mif1', 16)
    fs.writeFileSync(file, incomplete)
    assert.equal(await hasHeicStructure(file), false, 'ftyp without metadata/image data must be rejected')

    const overrun = Buffer.from(incomplete)
    overrun.writeUInt32BE(4096, 0)
    fs.writeFileSync(file, overrun)
    assert.equal(await hasHeicStructure(file), false, 'box size must not exceed actual file length')

    const nonHeic = Buffer.alloc(56)
    nonHeic.writeUInt32BE(24, 0)
    nonHeic.write('ftyp', 4)
    nonHeic.write('avif', 8)
    nonHeic.write('mif1', 16)
    nonHeic.write('avif', 20)
    nonHeic.writeUInt32BE(16, 24)
    nonHeic.write('meta', 28)
    nonHeic.writeUInt32BE(16, 40)
    nonHeic.write('mdat', 44)
    fs.writeFileSync(file, nonHeic)
    assert.equal(await hasHeicStructure(file), false, 'AVIF must not be mislabeled HEIC')
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('real HEIC image can pass structural validation when HEVC encoder is installed', async t => {
  const fs = require('node:fs')
  const os = require('node:os')
  const path = require('node:path')
  const sharp = require('../server/node_modules/sharp')
  let heic
  try {
    heic = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#44aa66' } })
      .heif({ compression: 'hevc' }).toBuffer()
  } catch {
    t.skip('libvips HEVC encoder unavailable on this runner; physical iPhone HEIC still requires manual validation')
    return
  }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'yl-heic-fixture-'))
  try {
    const file = path.join(directory, 'real.heic')
    fs.writeFileSync(file, heic)
    const { hasHeicStructure } = require('../server/services/garden-media')
    assert.equal(await hasHeicStructure(file), true)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
