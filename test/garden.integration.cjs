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
