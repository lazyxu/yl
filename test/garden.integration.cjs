const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')

test('garden MySQL CRUD, photos, calendar and export', { skip: !process.env.BACKUP_TEST_MYSQL }, async () => {
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
    const photoRes = await fetch(base + '/photos/' + photoId + '/thumb')
    assert.equal(photoRes.status, 200)
    assert.match(photoRes.headers.get('content-type'), /image\/jpeg/)
    assert.ok((await photoRes.arrayBuffer()).byteLength > 0)
    const items = await request('/calendar/day?date=2026-10-18')
    assert.equal(items.body[0].plant_name, '第一株月季')
    const month = await request('/calendar')
    assert.equal(month.body[0].day, '2026-10-18')
    const updatedPayload = observedPayload('2026-10-18T22:00', '开花第二天', '另一位家人')
    assert.match(updatedPayload.observed_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
    const update = await request('/entries/' + entry.body.id, json(updatedPayload, 'PATCH'))
    assert.equal(update.code, 200)
    assert.equal((await request('/entries?plant_id=' + id)).body.items[0].note, '开花第二天')
    const exported = await fetch(base + '/export')
    assert.equal(exported.status, 200)
    assert.ok((await exported.arrayBuffer()).byteLength > 100)
    const archived = await request('/plants/' + id, json({
      name: '第一株月季', species_id: s.body.id, planted_on: '2026-05-01',
      location: '窗台', notes: '', status: 'archived',
    }, 'PATCH'))
    assert.equal(archived.code, 200)
    assert.equal((await request('/plants')).body.length, 0)
    assert.equal((await request('/plants?status=archived')).body.length, 1)
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
    assert.ok(statements.length <= 4, 'plant list SQL count must remain constant; got ' + statements.length)
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
      const ts = Date.UTC(2026, 9, 18, 15, index)
      return { plant_id: id, observed_at: new Date(ts), observed_ts: ts,
        local_date: '2026-10-18', note: '分页边界日记' + index, author_name: '' }
    }))
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
    const deleted = await request('/plants/' + id, { method: 'DELETE' })
    assert.equal(deleted.code, 200)
    assert.equal((await fetch(base + '/photos/' + photoId + '/original')).status, 404)
    assert.equal((await request('/entries?plant_id=' + id)).body.items.length, 0)
    const invalid = await request('/plants', json({ name: '错误日期', planted_on: '2026-02-30' }))
    assert.equal(invalid.code, 400)
  } finally {
    if (server) await new Promise(resolve => server.close(resolve))
    if (sequelize) await sequelize.close()
    await admin.query('DROP DATABASE IF EXISTS ' + String.fromCharCode(96) + database + String.fromCharCode(96))
    await admin.end()
  }
})
