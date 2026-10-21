'use strict'
// Isolated MySQL SQL/API performance baseline. Run with BACKUP_TEST_MYSQL=1.
// Database is randomly named and always dropped. No production credentials.
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { performance } = require('node:perf_hooks')

async function main() {
  assert.equal(process.env.BACKUP_TEST_MYSQL, '1', 'Require disposable test database')
  const dbName = 'yl_sql_perf_' + crypto.randomBytes(6).toString('hex')
  const dbHost = process.env.BACKUP_TEST_HOST || '127.0.0.1'
  const dbUser = process.env.BACKUP_TEST_USER || 'root'
  const dbPassword = process.env.BACKUP_TEST_PASSWORD || 'ci-only-password'
  const mysql = require('../server/node_modules/mysql2/promise')
  const express = require('../server/node_modules/express')
  const admin = await mysql.createConnection({ host: dbHost, user: dbUser, password: dbPassword })
  let sequelize, server
  let cleanup = false
  const result = {
    schema: 1, environment: 'isolated GitHub CI MySQL/Express loopback', dataset: {},
    metrics: [], setup_ms: null, cold: {}, explain: [],
  }
  let sqlCalls = 0, dbDuration = 0, sqlSlowest = [], collect = false
  try {
    await admin.query('CREATE DATABASE \`' + dbName + '\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci')
    cleanup = true
    Object.assign(process.env, { DB_HOST: dbHost, DB_USER: dbUser,
      DB_PASSWORD: dbPassword, DB_NAME: dbName })
    sequelize = require('../server/sequelize')
    const { GardenSpecies, GardenPlant, GardenEntry, GardenPhoto } =
      require('../server/models/garden')
    const Reminder = require('../server/models/PindouReminder')
    require('../server/models/PindouInventory')
    require('../server/models/AppSetting')
    const setupStart = performance.now()
    await sequelize.sync({ alter: true })
    const species = await GardenSpecies.create({ name: 'Perf Roses' })
    const plants = await GardenPlant.bulkCreate(Array.from({ length: 720 }, (_, i) => ({
      name: i % 13 === 0 ? 'Performance Flower Search' + i : 'Flower ' + i,
      species_id: species.id, status: i % 12 === 0 ? 'archived' : 'active',
      location: 'Test Bench ' + (i % 8),
    })), { returning: true })
    const plantId = plants[0].id
    const observedBase = Date.UTC(2026, 9, 18, 12, 0, 0)
    const entries = await GardenEntry.bulkCreate(Array.from({ length: 1500 }, (_, i) => {
      const isPrimary = i < 530
      const onSharedDay = i < 580
      const observed = observedBase + i * 15_000
      return {
        plant_id: isPrimary ? plantId : plants[1 + ((i - 530 + plants.length - 1) % (plants.length - 1))].id,
        local_date: onSharedDay ? '2026-10-18' : '2026-09-' + String(i % 26 + 1).padStart(2, '0'),
        observed_at: new Date(observed), observed_ts: observed,
        note: 'E2E query measurement note ' + i, author_name: 'Perf',
      }
    }), { returning: true })
    await GardenPhoto.bulkCreate(entries.slice(0, 1100).map((entry,i) => ({
      entry_id: entry.id, storage_name: 'sample-' + String(i).padStart(6,'0') + '.png',
      original_name: 'sample-' + i + '.png', mime: 'image/png',
      size_bytes: 123, thumb_name: 't-' + i + '.png', preview_name: 'p-' + i + '.png',
    })))
    await Reminder.bulkCreate(Array.from({ length: 1250 }, (_, i) => ({
      operation: i % 5 === 0 ? '消耗' : '补豆',
      items: [{ color: 'A' + (i % 20 + 1), count: i % 5 === 0 ? 1 : 3 }],
      occurred_at: new Date(observedBase - i * 60_000),
      note: 'Historical item ' + i,
    })))
    result.setup_ms = Math.round(performance.now() - setupStart)
    result.dataset = { garden_plants: 720, garden_entries: 1500,
      garden_photos: 1100, reminders: 1250, calendar_day_entries: 580,
      primary_plant_entries: 530 }
    const app = express()
    app.use('/api/garden', require('../server/routes/garden'))
    app.use('/api/inventory', require('../server/routes/inventory'))
    app.use('/api/reminders', require('../server/routes/reminders'))
    app.use('/api/settings/shifts/overrides', require('../server/routes/day-shifts'))
    app.use('/api/settings/shifts', require('../server/routes/settings'))
    app.use(express.json({ limit: '1mb' }))
    server = await new Promise(resolve => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening))
    })
    const origin = 'http://127.0.0.1:' + server.address().port
    const rawRequest = async (pathname, init) => {
      const response = await fetch(origin + pathname, init)
      const raw = await response.text()
      let data
      try { data = raw ? JSON.parse(raw) : null } catch { data = raw }
      if (!response.ok) throw new Error(pathname + ' failed: ' + response.status + ' ' + raw.slice(0, 150))
      return { status: response.status, data, bytes: Buffer.byteLength(raw) }
    }
    const asJSON = (body, method='POST') => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    sequelize.options.benchmark = true
    const formerLogger = sequelize.options.logging
    sequelize.options.logging = (sql, ms) => {
      if (!collect) return
      sqlCalls++
      if (Number.isFinite(ms)) dbDuration += ms
      if (Number.isFinite(ms)) {
        sqlSlowest.push({ ms: Math.round(ms * 100)/100,
          query: String(sql).replace(/\s+/g, ' ').slice(0, 140) })
      }
    }
    async function probe(name, makeRequest, repetitions=9) {
      const all = []
      for (let i=-1;i<repetitions;i++) {
        sqlCalls = 0; dbDuration = 0; sqlSlowest = []; collect = true
        const start = performance.now()
        const response = await makeRequest()
        const elapsed = performance.now() - start
        collect = false
        if (i !== -1) all.push({ ms: elapsed, sqlCalls, db_ms: dbDuration,
          bytes: response.bytes, slow: sqlSlowest.sort((a,b)=>b.ms-a.ms)[0] || null })
      }
      const sorted = all.map(x=>x.ms).sort((a,b)=>a-b)
      const sortedDB = all.map(x=>x.db_ms).sort((a,b)=>a-b)
      const median = arr => Math.round(arr[Math.floor(arr.length/2)] * 100)/100
      const p95 = arr => Math.round(arr[Math.ceil(arr.length*.95)-1] * 100)/100
      const metric = {
        name, iterations: all.length, p50_ms: median(sorted),
        p95_ms: p95(sorted), db_p50_ms: median(sortedDB),
        db_p95_ms: p95(sortedDB),
        sql_calls_min: Math.min(...all.map(x=>x.sqlCalls)),
        sql_calls_max: Math.max(...all.map(x=>x.sqlCalls)),
        response_bytes: Math.round(all.reduce((sum,x)=>sum+x.bytes,0)/all.length),
        slowest_sql: all.map(x=>x.slow).filter(Boolean).sort((a,b)=>b.ms-a.ms)[0] || null,
      }
      result.metrics.push(metric)
      console.log('SQL-PERF-ROW ' + JSON.stringify(metric))
      return metric
    }
    try {
      // The first legacy inventory replay is intentionally measured separately;
      // it must never run again on warm GETs.
      collect = true; sqlCalls=0; dbDuration=0
      const start = performance.now()
      const first = await rawRequest('/api/inventory')
      collect = false
      result.cold.inventory_migration_ms = Math.round((performance.now()-start)*100)/100
      result.cold.inventory_migration_sql_calls = sqlCalls
      assert(first.data.length > 0)

      const firstPlant = await rawRequest('/api/garden/plants?status=all&limit=36')
      const cursor = firstPlant.data.next_cursor
      assert.equal(firstPlant.data.total,720)
      const firstDay = await rawRequest('/api/garden/calendar/day?date=2026-10-18&limit=40')
      const dayCursor = firstDay.data.next_cursor
      assert.equal(firstDay.data.total,580)
      const cases = [
        ['garden.plants.page1', () => rawRequest('/api/garden/plants?status=all&limit=36')],
        ['garden.plants.cursor2', () => rawRequest('/api/garden/plants?status=all&limit=36&cursor='+encodeURIComponent(cursor))],
        ['garden.plants.search', () => rawRequest('/api/garden/plants?status=all&q=Performance&limit=36')],
        ['garden.plants.species', () => rawRequest('/api/garden/plants?status=all&species_id='+species.id+'&limit=36')],
        ['garden.plants.detail', () => rawRequest('/api/garden/plants/'+plantId)],
        ['garden.entries.first40', () => rawRequest('/api/garden/entries?plant_id='+plantId+'&limit=40&order=asc')],
        ['garden.entries.offset400', () => rawRequest('/api/garden/entries?plant_id='+plantId+'&limit=40&order=asc&offset=400')],
        ['garden.calendar.summary', () => rawRequest('/api/garden/calendar')],
        ['garden.calendar.day40', () => rawRequest('/api/garden/calendar/day?date=2026-10-18&limit=40')],
        ['garden.calendar.next40', () => rawRequest('/api/garden/calendar/day?date=2026-10-18&limit=40&cursor='+encodeURIComponent(dayCursor))],
        ['pindou.inventory.warm', () => rawRequest('/api/inventory')],
        ['pindou.reminders.latest200', () => rawRequest('/api/reminders')],
        ['shifts.rules.get', () => rawRequest('/api/settings/shifts')],
        ['shifts.overrides.get', () => rawRequest('/api/settings/shifts/overrides')],
      ]
      for (const [name, callback] of cases) {
        const m = await probe(name, callback)
        if (name.startsWith('garden.plants.') && m.sql_calls_max > 5) throw new Error(name + ' SQL N+1 detected')
        if (name.startsWith('garden.calendar.day') && m.sql_calls_max > 3) throw new Error(name + ' SQL N+1 detected')
        if (name === 'pindou.inventory.warm' && m.sql_calls_max > 2) throw new Error('Replaying ledger on each inventory GET')
      }
      const newReminder = () => ({
        operation: '补豆', items: [{ color: 'A1', count: 2 }],
        occurred_at: new Date().toISOString(), note: 'Performance API write',
      })
      const created = await probe('pindou.reminders.post', () => rawRequest('/api/reminders', asJSON(newReminder())), 5)
      assert(created.sql_calls_max >= 2)
      const newest = await rawRequest('/api/reminders')
      const reminderId = newest.data.find(item => item.note === 'Performance API write')?.id
      assert(reminderId)
      await probe('pindou.reminders.update', () => rawRequest('/api/reminders/'+reminderId,
        asJSON(newReminder(), 'PUT')), 5)
      // For deletion, create one disposable reminder per iteration.
      await probe('pindou.reminders.delete', async () => {
        const row = await rawRequest('/api/reminders', asJSON(newReminder()))
        return rawRequest('/api/reminders/'+row.data.id, { method:'DELETE' })
      }, 5)
      const rules = Array.from({ length: 100 }, (_,i) => ({
        startDate: new Date(Date.UTC(2027,0,i+1)).toISOString().slice(0,10),
        shifts: Array(366).fill(i%2 ? '夜班' : '白班'),
      }))
      const original = await rawRequest('/api/settings/shifts')
      const stored = await rawRequest('/api/settings/shifts',
        asJSON({ rules, version: original.data.version }, 'PUT'))
      assert.equal(stored.data.rules.length, 100)
      await probe('shifts.rules.large.get', () => rawRequest('/api/settings/shifts'))
      let overrideVersion = (await rawRequest('/api/settings/shifts/overrides')).data.version
      await probe('shifts.overrides.update', async () => {
        const response = await rawRequest('/api/settings/shifts/overrides/2026-10-18',
          asJSON({version:overrideVersion, override: { kind:'standby', note:'perf' }}, 'PUT'))
        overrideVersion = response.data.version
        return response
      },5)
    } finally {
      sequelize.options.logging = formerLogger
      sequelize.options.benchmark = false
      collect = false
    }
    const outfile = process.env.SQL_PERF_OUTPUT ||
      path.join('test-results','sql-performance-baseline.json')
    fs.mkdirSync(path.dirname(outfile), { recursive: true })
    fs.writeFileSync(outfile, JSON.stringify(result,null,2)+'\n')
    console.log('SQL-PERF-BASELINE ' + JSON.stringify({ data:result.dataset,
      setup_ms:result.setup_ms, cold:result.cold, tests:result.metrics.length,
      slow:result.metrics.filter(m=>m.p95_ms>200).map(m=>m.name) }))
  } finally {
    if (server) await new Promise(resolve => server.close(resolve))
    if (sequelize) await sequelize.close()
    if (cleanup) await admin.query('DROP DATABASE IF EXISTS \`' + dbName + '\`')
    await admin.end()
  }
}
main().catch(err => { console.error('SQL-PERF-ERROR', err); process.exitCode=1 })
