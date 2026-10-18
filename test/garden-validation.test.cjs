const test = require('node:test')
const assert = require('node:assert/strict')
const {
  validDay, positiveId, normalizePlant, normalizeEntry,
  identifyPhoto, safeFilename, MAX_PHOTOS, MAX_ENTRY_BYTES,
} = require('../server/services/garden-validation')

test('garden date validation', () => {
  assert.equal(validDay('2026-10-18'), true)
  assert.equal(validDay('2026-02-29'), false)
  assert.equal(validDay('2024-02-29'), true)
  assert.equal(validDay('2026-13-02'), false)
  assert.equal(validDay('../../private'), false)
})
test('plant validation rejects invalid sizes and unsupported status', () => {
  assert.deepEqual(normalizePlant({ name: '月季', planted_on: '2026-10-18', species_id: 0 }), {
    name: '月季', species_id: null, planted_on: '2026-10-18',
    location: '', notes: '', status: 'active',
  })
  assert.throws(() => normalizePlant({ name: '', status: 'active' }), /花卉名称/)
  assert.throws(() => normalizePlant({ name: '花', status: 'deleted' }), /状态/)
  assert.throws(() => normalizePlant({ name: '花', planted_on: '2026-02-30' }), /日期/)
  assert.equal(positiveId('2'), 2)
  assert.equal(positiveId('0'), null)
  assert.equal(positiveId('../2'), null)
})
test('diary timezone and optional author', () => {
  const e = normalizeEntry({ observed_at: '2026-10-18T21:00:00+09:00', local_date: '2026-10-18', note: ' 发芽了 ' })
  assert.equal(e.local_date, '2026-10-18')
  assert.equal(e.note, '发芽了')
  assert.equal(e.author_name, '')
  assert.equal(e.observed_at.toISOString(), '2026-10-18T12:00:00.000Z')
  assert.throws(() => normalizeEntry({ observed_at: '2026-10-18T21:00:00' }), /时区/)
  assert.throws(() => normalizeEntry({ observed_at: '2999-01-01T00:00:00Z' }), /无效/)
})
test('media signature and path normalization', () => {
  assert.deepEqual(identifyPhoto(Buffer.from([255,216,255,224])), { mime: 'image/jpeg', ext: '.jpg' })
  assert.deepEqual(identifyPhoto(Buffer.from([137,80,78,71,13,10,26,10])), { mime: 'image/png', ext: '.png' })
  assert.equal(identifyPhoto(Buffer.from('not an image')), null)
  assert.equal(safeFilename('../../path/photo.jpg'), 'photo.jpg')
  assert.equal(MAX_PHOTOS, 8)
  assert.equal(MAX_ENTRY_BYTES, 90 * 1024 * 1024)
})

test('frontend observedPayload milliseconds are accepted by the API validator', async () => {
  const { observedPayload } = await import('../src/gardenApi.js')
  // This uses the exact payload factory called by the mobile photo editor.
  const payload = observedPayload('2026-10-18T21:00', '开花了', '家人')
  assert.match(payload.observed_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  const saved = normalizeEntry(payload)
  assert.equal(saved.local_date, '2026-10-18')
  assert.equal(saved.author_name, '家人')
  assert.equal(saved.note, '开花了')
  assert.equal(saved.observed_at.toISOString(), payload.observed_at)
  const withOffset = normalizeEntry({
    observed_at: '2026-10-18T21:00:00.125+09:00',
    local_date: '2026-10-18',
  })
  assert.equal(withOffset.observed_at.toISOString(), '2026-10-18T12:00:00.125Z')
  assert.throws(() => normalizeEntry({ observed_at: '2026-10-18T21:00:00.12', local_date: '2026-10-18' }), /时区/)
})
