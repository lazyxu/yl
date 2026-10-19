'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')

test('pindou materialized inventory seeds old rows and stays transactional across edits, deletes and concurrency', { skip: !process.env.BACKUP_TEST_MYSQL }, async () => {
  const database = 'yl_pindou_stock_' + crypto.randomBytes(5).toString('hex')
  Object.assign(process.env, {
    DB_HOST: process.env.BACKUP_TEST_HOST || 'mysql',
    DB_NAME: database,
    DB_USER: process.env.BACKUP_TEST_USER || 'root',
    DB_PASSWORD: process.env.BACKUP_TEST_PASSWORD || 'ci-only-password',
  })
  const mysql = require('../server/node_modules/mysql2/promise')
  const express = require('../server/node_modules/express')
  const admin = await mysql.createConnection({
    host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  })
  let sequelize, server
  try {
    await admin.query('CREATE DATABASE ' + String.fromCharCode(96) + database + String.fromCharCode(96) + ' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci')
    sequelize = require('../server/sequelize')
    const Reminder = require('../server/models/PindouReminder')
    require('../server/models/PindouInventory')
    await sequelize.sync({ alter: true })
    const when = new Date('2026-10-18T12:00:00.000Z')
    await Reminder.bulkCreate([
      { operation: '补豆', items: [{ color: 'A1', count: 100 }, { color: 'A2', count: 50 }], occurred_at: when },
      { operation: '消耗', items: [{ color: 'A1', count: 30 }], occurred_at: when },
      ...Array.from({ length: 505 }, () => ({
        operation: '补豆', items: [{ color: 'A4', count: 1 }], occurred_at: when,
      })),
    ])
    const app = express()
    app.use(express.json())
    app.use('/api/inventory', require('../server/routes/inventory'))
    app.use('/api/reminders', require('../server/routes/reminders'))
    server = await new Promise(resolve => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance))
    })
    const endpoint = 'http://127.0.0.1:' + server.address().port + '/api'
    const send = async (path, options) => {
      const response = await fetch(endpoint + path, options)
      const data = await response.json()
      return { code: response.status, data }
    }
    const json = (body, method = 'POST') => ({
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const stock = async () => {
      const out = await send('/inventory')
      assert.equal(out.code, 200)
      return new Map(out.data.map(item => [item.color, item.count]))
    }
    let quantities = await stock()
    assert.equal(quantities.get('A1'), 70)
    assert.equal(quantities.get('A2'), 50)
    assert.equal(quantities.get('A4'), 505, 'one-time legacy replay must scan past the first 500 records')

    const queried = []
    const before = sequelize.options.logging
    try {
      sequelize.options.logging = sql => queried.push(sql)
      await stock()
    } finally { sequelize.options.logging = before }
    assert.ok(!queried.some(sql => String(sql).includes('pindou_reminders')),
      'ordinary inventory reads must not scan the historical ledger')
    const first = await send('/reminders', json({
      operation: '补豆', items: [{ color: 'A1', count: 20 }, { color: 'A3', count: 10 }],
      occurred_at: when.toISOString(), note: 'new', image_path: null,
    }))
    assert.equal(first.code, 201, JSON.stringify(first.data))
    quantities = await stock()
    assert.equal(quantities.get('A1'), 90)
    assert.equal(quantities.get('A3'), 10)

    const edit = await send('/reminders/' + first.data.id, json({
      operation: '消耗', items: [{ color: 'A1', count: 15 }, { color: 'A2', count: 5 }],
      occurred_at: when.toISOString(), note: 'edited', image_path: null,
    }, 'PUT'))
    assert.equal(edit.code, 200, JSON.stringify(edit.data))
    quantities = await stock()
    assert.equal(quantities.get('A1'), 55)
    assert.equal(quantities.get('A2'), 45)
    assert.equal(quantities.get('A3'), 0)
    assert.equal((await send('/reminders/' + first.data.id, { method: 'DELETE' })).code, 200)
    quantities = await stock()
    assert.equal(quantities.get('A1'), 70)
    assert.equal(quantities.get('A2'), 50)

    const concurrent = await Promise.all(Array.from({ length: 12 }, () => send('/reminders', json({
      operation: '补豆', items: [{ color: 'A1', count: 1 }], occurred_at: when.toISOString(),
    }))))
    assert.ok(concurrent.every(response => response.code === 201),
      'all concurrent ledger and stock writes must commit atomically')
    assert.equal((await stock()).get('A1'), 82)
    assert.equal((await send('/reminders', json({
      operation: '补豆', items: [{ color: 'A1', count: 1.5 }], occurred_at: when.toISOString(),
    }))).code, 400)
    assert.equal((await stock()).get('A1'), 82)

    // Simulate a failure between the ledger insert and stock update.
    const originalQuery = sequelize.query
    sequelize.query = function(query, ...args) {
      if (String(query).startsWith('INSERT INTO pindou_inventory (color, quantity)')) {
        throw new Error('synthetic stock write failure')
      }
      return originalQuery.call(this, query, ...args)
    }
    let broken
    try {
      broken = await send('/reminders', json({
        operation: '补豆', items: [{ color: 'A1', count: 2 }], occurred_at: when.toISOString(),
      }))
    } finally { sequelize.query = originalQuery }
    assert.equal(broken.code, 500)
    assert.equal((await stock()).get('A1'), 82)
    const count = await Reminder.count()
    assert.equal(count, 519, 'failed stock update must roll back reminder creation')

    const servicePath = require.resolve('../server/services/pindou-inventory')
    delete require.cache[servicePath]
    const fresh = require('../server/services/pindou-inventory')
    await fresh.ensureInventory()
    assert.equal((await fresh.listInventory()).find(row => row.color === 'A1').count, 82)
  } finally {
    if (server) await new Promise(resolve => server.close(resolve))
    if (sequelize) await sequelize.close()
    await admin.query('DROP DATABASE IF EXISTS ' + String.fromCharCode(96) + database + String.fromCharCode(96))
    await admin.end()
  }
})
