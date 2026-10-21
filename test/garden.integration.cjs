const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')

test('garden MySQL CRUD, photos, calendar and no ZIP export', { skip: !process.env.BACKUP_TEST_MYSQL }, async () => {
  const database = 'yl_garden_ci_' + crypto.randomBytes(5).toString('hex')
  Object.assign(process.env, {
    DB_HOST: process.env.BACKUP_TEST_HOST || 'mysql',
    DB_NAME: database,
    DB_USER: process.env.BACKUP_TEST_USER || 'root',
    DB_PASSWORD: process.env.BACKUP_TEST_PASSWORD || 'ci-only-password',
  })
  const mysql = require('../server/node_modules/mysql2/promise')
  const express = require('../server/node_modules/express')
  const sharp = require('../server/node_modules/sharp')
  const admin = await mysql.createConnection({
    host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  })
  let sequelize, server
  try {
    await admin.query('CREATE DATABASE ' + String.fromCharCode(96) + database + String.fromCharCode(96) + ' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci')
    sequelize = require('../server/sequelize')
    require('../server/models/garden')
    await sequelize.sync({ alter: true })
    const app = express()
    app.use('/api/garden', require('../server/routes/garden'))
    server = await new Promise(resolve => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance))
    })
    const base = 'http://127.0.0.1:' + server.address().port + '/api/garden'
    const request = async (url, init) => {
      const response = await fetch(base + url, init)
      const body = await response.json()
      return { code: response.status, body }
    }
    const json = (payload, method = 'POST') => ({
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    const s = await request('/species', json({ name: '月季' }))
    assert.equal(s.code, 201)
    const plant = await request('/plants', json({
      name: '第一株月季', species_id: s.body.id, planted_on: '2026-05-01',
      location: '窗台', notes: '一起种的', status: 'active',
    }))
    assert.equal(plant.code, 201)
    const id = plant.body.id
    assert.equal((await request('/plants')).body.length, 1)
    assert.equal((await request('/plants/' + id)).body.species_name, '月季')
    const png = await sharp({ create: { width: 16, height: 24, channels: 3, background: '#88aa66' } }).png().toBuffer()
    const data = new FormData()
    data.set('plant_id', String(id))
    // Exercise the same payload builder used by the mobile camera UI.
    const { observedPayload } = await import('../src/gardenApi.js')
    const photoPayload = observedPayload('2026-10-18T21:00', '开花了', '家人')
    assert.match(photoPayload.observed_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
    assert.doesNotMatch(photoPayload.observed_at, /\.\d{3}Z$/)
    for (const [key, value] of Object.entries(photoPayload)) data.set(key, value)
    data.append('photos', new Blob([png], { type: 'image/png' }), 'flower.png')
    const entry = await request('/entries', { method: 'POST', body: data })
    assert.equal(entry.code, 201)
    const diary = await request('/entries?plant_id=' + id)
    assert.equal(diary.body.items.length, 1)
    assert.equal(diary.body.items[0].author_name, '家人')
    assert.equal(diary.body.items[0].photos.length, 1)
    const photoId = diary.body.items[0].photos[0].id

    // Failed validation must not create diary rows or leave uploaded artifacts.
    const { dirs: mediaDirs } = require('../server/services/garden-media')
    const mediaSnapshot = () => Object.entries(mediaDirs).map(([kind, dir]) =>
      [kind, require('node:fs').readdirSync(dir).sort()])
    const snapshotBefore = mediaSnapshot()
    function draftPhotos(buffers, override) {
      const form = new FormData()
      form.set('plant_id', String(id))
      for (const [key, value] of Object.entries(photoPayload)) form.set(key, value)
      if (override) form.set('observed_at', override)
      buffers.forEach((bytes, index) => form.append('photos',
        new Blob([bytes], { type: 'image/jpeg' }), 'camera-' + index + '.jpg'))
      return form
    }
    const beforeFailure = await require('../server/models/garden').GardenEntry.count({ where: { plant_id: id } })
    const invalidJpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x00, 0x00, 0x00])
    const malformedHeic = Buffer.alloc(20)
    malformedHeic.writeUInt32BE(20, 0)
    malformedHeic.write('ftypheic', 4)
    malformedHeic.write('mif1', 16)
    const invalidUploads = [
      { body: draftPhotos([]), expected: 400 },
      { body: draftPhotos([invalidJpeg]), expected: 400 },
      { body: draftPhotos([malformedHeic]), expected: 400 },
      { body: draftPhotos([png, invalidJpeg]), expected: 400 },
      { body: draftPhotos([png], '2026-10-18T21:00:00'), expected: 400 },
      { body: draftPhotos(Array.from({ length: 9 }, () => png)), expected: 413 },
    ]
    for (const invalidCase of invalidUploads) {
      const attempt = await request('/entries', { method: 'POST', body: invalidCase.body })
      assert.equal(attempt.code, invalidCase.expected, JSON.stringify(attempt.body))
      assert.deepEqual(mediaSnapshot(), snapshotBefore,
        'failed uploads must clean temporary, original, thumbnail and preview files')
      assert.equal(await require('../server/models/garden').GardenEntry.count({ where: { plant_id: id } }), beforeFailure)
    }

    const photoRes = await fetch(base + '/photos/' + photoId + '/thumb')
    assert.equal(photoRes.status, 200)
    assert.match(photoRes.headers.get('content-type'), /image\/jpeg/)
    assert.ok((await photoRes.arrayBuffer()).byteLength > 0)
    assert.match(photoRes.headers.get('cache-control'), /private.*max-age=86400.*immutable/)
    const etag = photoRes.headers.get('etag')
    assert.ok(etag, 'derivative thumbnails must expose a stable ETag')
    const conditional = await fetch(base + '/photos/' + photoId + '/thumb', {
      headers: { 'If-None-Match': etag },
    })
    assert.equal(conditional.status, 304, 'cached derivative revalidates without downloading bytes')
    const previewRes = await fetch(base + '/photos/' + photoId + '/preview')
    assert.equal(previewRes.status, 200)
    assert.match(previewRes.headers.get('content-type'), /image\/jpeg/)
    const previewMeta = await sharp(Buffer.from(await previewRes.arrayBuffer())).metadata()
    assert.equal(previewMeta.width, 16)
    assert.equal(previewMeta.height, 24)
    const originalRes = await fetch(base + '/photos/' + photoId + '/original')
    assert.match(originalRes.headers.get('cache-control'), /no-store/)

    const items = await request('/calendar/day?date=2026-10-18')
    assert.equal(items.body[0].plant_name, '第一株月季')
    const month = await request('/calendar')
    assert.equal(month.body[0].day, '2026-10-18')
    const updatedPayload = observedPayload('2026-10-18T22:00', '开花第二天', '另一位家人')
    assert.match(updatedPayload.observed_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
    const update = await request('/entries/' + entry.body.id, json(updatedPayload, 'PATCH'))
    assert.equal(update.code, 200)
    assert.equal((await request('/entries?plant_id=' + id)).body.items[0].note, '开花第二天')
    const removedExport = await fetch(base + '/export')
    assert.equal(removedExport.status, 404, 'garden ZIP export route must no longer exist')
    const archived = await request('/plants/' + id, json({
      name: '第一株月季', species_id: s.body.id, planted_on: '2026-05-01',
      location: '窗台', notes: '', status: 'archived',
    }, 'PATCH'))
    assert.equal(archived.code, 200)
    assert.equal((await request('/plants')).body.length, 0)
    assert.equal((await request('/plants?status=archived')).body.length, 1)
    const withArchived = await request('/plants?status=all&limit=36')
    assert.equal(withArchived.code, 200)
    assert.equal(withArchived.body.total, 1)
    assert.equal(withArchived.body.items[0].id, id)
    assert.equal(withArchived.body.items[0].status, 'archived', 'legacy archived state must be preserved')
    assert.equal((await request('/plants/' + id)).body.status, 'archived')
    const speciesSearch = await request('/plants?status=all&limit=36&q=' + encodeURIComponent('月季'))
    assert.equal(speciesSearch.code, 200)
    assert.equal(speciesSearch.body.total, 1, 'species-name search includes archived plants')
    assert.equal(speciesSearch.body.items[0].id, id)
    // The legacy endpoint stays an array; the paged endpoint must not truncate
    // plants or silently discard calendar-day entries.
    const models = require('../server/models/garden')
    await models.GardenPlant.bulkCreate(Array.from({ length: 42 }, (_, index) => ({
      name: '测试花卉' + index, species_id: s.body.id, status: 'active',
    })))
    const statements = []
    const previousLogger = sequelize.options.logging
    let firstPage
    try {
      sequelize.options.logging = sql => { if (/SELECT/i.test(sql)) statements.push(sql) }
      firstPage = await request('/plants?status=all&limit=36')
    } finally { sequelize.options.logging = previousLogger }
    assert.equal(firstPage.code, 200)
    assert.equal(firstPage.body.items.length, 36)
    assert.equal(Number(firstPage.body.total), 43)
    assert.equal(firstPage.body.has_more, true)
    assert.equal(statements.length, 3, 'one plant query, one count query, one photo aggregation are expected')
    const nextPage = await request('/plants?status=all&limit=36&cursor=' + encodeURIComponent(firstPage.body.next_cursor))
    assert.equal(nextPage.code, 200)
    assert.equal(nextPage.body.items.length, 7)
    assert.equal(nextPage.body.has_more, false)
    assert.equal(new Set([...firstPage.body.items, ...nextPage.body.items].map(p => p.id)).size, 43)
    assert.equal((await request('/plants?status=all')).body.length, 43, 'older clients keep array compatibility')
    assert.equal((await request('/plants?limit=12&cursor=invalid')).code, 400)
    assert.ok([...firstPage.body.items, ...nextPage.body.items].some(plant => plant.id === id && plant.photo_count === 1))

    await models.GardenEntry.bulkCreate(Array.from({ length: 4 }, (_, index) => {
      const ts = Date.UTC(2026, 9, 18, 14, index)
      return { plant_id: id, observed_at: new Date(ts), observed_ts: ts,
        local_date: '2026-10-18', note: '连续观察' + index, author_name: '' }
    }))
    // The timeline reads oldest first while the old API default remains newest first.
    const entryUrl = '/entries?plant_id=' + id
    const ascendingPages = []
    for (let offset = 0; offset < 6; offset += 2) {
      const page = await request(entryUrl + '&limit=2&offset=' + offset + '&order=asc')
      assert.equal(page.code, 200)
      assert.equal(page.body.has_more, offset < 4)
      ascendingPages.push(...page.body.items)
    }
    assert.equal(ascendingPages.length, 5)
    assert.equal(new Set(ascendingPages.map(row => row.id)).size, 5)
    const descending = await request(entryUrl + '&limit=5')
    assert.equal(descending.code, 200)
    assert.deepEqual(ascendingPages.map(row => row.id),
      descending.body.items.map(row => row.id).reverse(), 'ascending pages must reverse legacy DESC order')
    assert.equal((await request(entryUrl + '&order=sideways')).code, 400)

    const dayPage = await request('/calendar/day?date=2026-10-18&limit=2')
    assert.equal(dayPage.code, 200)
    assert.equal(Number(dayPage.body.total), 5)
    assert.equal(dayPage.body.items.length, 2)
    assert.equal(dayPage.body.has_more, true)
    const dayNext = await request('/calendar/day?date=2026-10-18&limit=2&cursor=' + encodeURIComponent(dayPage.body.next_cursor))
    assert.equal(dayNext.code, 200)
    assert.equal(dayNext.body.items.length, 2)
    assert.equal(new Set([...dayPage.body.items, ...dayNext.body.items].map(e => e.id)).size, 4)
    assert.equal((await request('/calendar/day?date=2026-10-18')).body.length, 5)
    assert.equal((await request('/calendar/day?date=2026-10-18&limit=2&cursor=invalid')).code, 400)
    // Regression for formerly silent 500-plant and 200-entry cutoffs.
    await models.GardenPlant.bulkCreate(Array.from({ length: 470 }, (_, index) => ({
      name: '分页边界花卉' + index, species_id: s.body.id, status: 'active',
    })))
    const totalPlants = 513 // original archived plant + 42 + 470
    const firstLarge = await request('/plants?status=all&limit=75')
    assert.equal(firstLarge.code, 200)
    assert.equal(Number(firstLarge.body.total), totalPlants)
    let plantCursor = firstLarge.body.next_cursor
    const plantIds = firstLarge.body.items.map(row => row.id)
    let plantPages = 1
    while (plantCursor) {
      const response = await request('/plants?status=all&limit=75&cursor=' + encodeURIComponent(plantCursor))
      assert.equal(response.code, 200)
      plantIds.push(...response.body.items.map(row => row.id))
      plantCursor = response.body.next_cursor
      plantPages++
      assert.ok(plantPages <= 9, 'plant pagination cursor must eventually terminate')
    }
    assert.equal(plantIds.length, totalPlants)
    assert.equal(new Set(plantIds).size, totalPlants, 'no plants can be lost or repeated across cursor pages')

    await models.GardenEntry.bulkCreate(Array.from({ length: 205 }, (_, index) => {
      // Deliberate timestamp ties exercise the secondary id sort across pages.
      const ts = Date.UTC(2026, 9, 18, 15, Math.floor(index / 2))
      return { plant_id: id, observed_at: new Date(ts), observed_ts: ts,
        local_date: '2026-10-18', note: '分页边界日记' + index, author_name: '' }
    }))
    // More than five pages: verify stable ASC ordering by (observed_ts, id).
    // Offset and the sort direction must remain unchanged between requests.
    const chronological = []
    let diaryPageCount = 0
    let diaryHasMore = true
    while (diaryHasMore) {
      const offset = chronological.length
      const page = await request('/entries?plant_id=' + id + '&limit=40&offset=' + offset + '&order=asc')
      assert.equal(page.code, 200)
      assert.ok(page.body.items.length > 0 && page.body.items.length <= 40)
      chronological.push(...page.body.items)
      diaryHasMore = page.body.has_more
      diaryPageCount++
      assert.ok(diaryPageCount <= 7, 'diary pagination must terminate')
    }
    assert.equal(chronological.length, 210)
    assert.equal(new Set(chronological.map(row => row.id)).size, 210)
    for (let index = 1; index < chronological.length; index++) {
      const previous = chronological[index - 1]
      const current = chronological[index]
      const timestampDelta = Number(current.observed_ts) - Number(previous.observed_ts)
      assert.ok(timestampDelta > 0 || (timestampDelta === 0 && current.id > previous.id),
        'ascending diary pages must be ordered by time then ID')
    }

    const firstLongDay = await request('/calendar/day?date=2026-10-18&limit=40')
    assert.equal(firstLongDay.code, 200)
    assert.equal(Number(firstLongDay.body.total), 210)
    let dayCursor = firstLongDay.body.next_cursor
    const dayIds = firstLongDay.body.items.map(row => row.id)
    let dayPages = 1
    while (dayCursor) {
      const response = await request('/calendar/day?date=2026-10-18&limit=40&cursor=' + encodeURIComponent(dayCursor))
      assert.equal(response.code, 200)
      dayIds.push(...response.body.items.map(row => row.id))
      dayCursor = response.body.next_cursor
      dayPages++
      assert.ok(dayPages <= 7, 'day pagination cursor must eventually terminate')
    }
    assert.equal(dayIds.length, 210)
    assert.equal(new Set(dayIds).size, 210)
    const concurrentDeletes = await Promise.all(Array.from({ length: 6 }, () =>
      request('/entries/' + entry.body.id, { method: 'DELETE' })))
    assert.ok(concurrentDeletes.some(result => result.code === 200))
    assert.ok(concurrentDeletes.every(result => [200, 404].includes(result.code)),
      'concurrent delete operations must be idempotent or report 404, never 500')
    assert.equal(await models.GardenEntry.count({ where: { id: entry.body.id } }), 0)
    assert.equal(await models.GardenPhoto.count({ where: { id: photoId } }), 0)
    assert.equal((await fetch(base + '/photos/' + photoId + '/original')).status, 404)
    const deleted = await request('/plants/' + id, { method: 'DELETE' })
    assert.equal(deleted.code, 200)
    assert.equal((await fetch(base + '/photos/' + photoId + '/original')).status, 404)
    assert.equal((await request('/entries?plant_id=' + id)).body.items.length, 0)
    const invalid = await request('/plants', json({ name: '错误日期', planted_on: '2026-02-30' }))
    assert.equal(invalid.code, 400)
    // Photo summary semantics: count every photo, not just photo-bearing entries.
    // A newer diary without photos must not displace the latest photo. Timestamp
    // ties must choose highest photo ID regardless of entry ID.
    const hotPlant = await models.GardenPlant.create({name:'Photo aggregation regression',status:'active'})
    const hotStart = Date.UTC(2026,9,20,12,0)
    const toEntry = (ts,note) => ({
      plant_id:hotPlant.id, observed_at:new Date(ts), observed_ts:ts,
      local_date:'2026-10-20',note, author_name:'',
    })
    const photoEntries = await models.GardenEntry.bulkCreate([
      toEntry(hotStart,'old'),toEntry(hotStart+60_000,'newer'),
      toEntry(hotStart+60_000,'same timestamp'),
      toEntry(hotStart+120_000,'diary without photos'),
    ])
    const photoFixture = await models.GardenPhoto.bulkCreate([
      { entry_id:photoEntries[0].id, storage_name:'perf-reg-old.jpg',
        original_name:'old.jpg', mime:'image/jpeg', size_bytes:1 },
      { entry_id:photoEntries[1].id, storage_name:'perf-reg-newer.jpg',
        original_name:'newer.jpg', mime:'image/jpeg', size_bytes:1 },
      { entry_id:photoEntries[1].id, storage_name:'perf-reg-newer2.jpg',
        original_name:'newer2.jpg', mime:'image/jpeg', size_bytes:1 },
      { entry_id:photoEntries[2].id, storage_name:'perf-reg-tie.jpg',
        original_name:'tie.jpg', mime:'image/jpeg', size_bytes:1 },
    ])
    const summary = await request('/plants/'+hotPlant.id)
    assert.equal(summary.code,200)
    assert.equal(summary.body.photo_count,4)
    assert.equal(summary.body.latest_photo_id,photoFixture[3].id)
    const photoFree = await models.GardenPlant.create({name:'No photos',status:'active'})
    const empty = await request('/plants/'+photoFree.id)
    assert.equal(empty.code,200)
    assert.equal(empty.body.photo_count,0)
    assert.equal(empty.body.latest_photo_id,0)

  } finally {
    if (server) await new Promise(resolve => server.close(resolve))
    if (sequelize) await sequelize.close()
    await admin.query('DROP DATABASE IF EXISTS ' + String.fromCharCode(96) + database + String.fromCharCode(96))
    await admin.end()
  }
})
