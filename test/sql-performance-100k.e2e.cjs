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
    schema: 2, environment: 'isolated GitHub Actions Ubuntu/MySQL 8.4/Express loopback', dataset: {},
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
    // Deliberately skewed 100k-per-table dataset:
    // 60k diary/photo records on one plant, 50k on the same calendar day.
    // Chunking bounds heap usage and MySQL packet size; seeding is not request latency.
    const SIZE = 100_000
    const CHUNK = 1_000
    const scenario = process.env.SQL_PERF_SCENARIO || 'skew'
    assert(['skew', 'all-hot'].includes(scenario), 'Unknown SQL_PERF_SCENARIO')
    const HOT_ENTRIES = scenario === 'all-hot' ? SIZE : 60_000
    const DAY_ENTRIES = scenario === 'all-hot' ? SIZE : 50_000
    const plantIds = []
    const recordProgress = (table, inserted) => {
      if (inserted % 25_000 === 0) console.log('SQL-PERF-SEED ' + table + ' ' + inserted + '/' + SIZE)
    }
    for (let start = 0; start < SIZE; start += CHUNK) {
      const length = Math.min(CHUNK, SIZE - start)
      const created = await GardenPlant.bulkCreate(Array.from({ length }, (_, j) => {
        const i = start + j
        return {
          name: i % 13 === 0 ? 'Performance Flower Search' + i : 'Flower ' + i,
          species_id: species.id, status: i % 12 === 0 ? 'archived' : 'active',
          location: 'Test Bench ' + (i % 8),
        }
      }))
      plantIds.push(...created.map(row => row.id))
      recordProgress('plants', start + length)
    }
    assert.equal(new Set(plantIds).size, SIZE, 'MySQL bulkCreate IDs must be unique')
    const plantId = plantIds[0]
    const observedBase = Date.UTC(2026, 9, 18, 12, 0, 0)
    const entries = []
    const entryIds = []
    for (let start = 0; start < SIZE; start += CHUNK) {
      const length = Math.min(CHUNK, SIZE - start)
      const created = await GardenEntry.bulkCreate(Array.from({ length }, (_, j) => {
        const i = start + j
        const isPrimary = i < HOT_ENTRIES
        const onSharedDay = i < DAY_ENTRIES
        const observed = observedBase + i * 15_000
        return {
          plant_id: isPrimary ? plantId : plantIds[1 + ((i - HOT_ENTRIES) % (plantIds.length - 1))],
          local_date: onSharedDay ? '2026-10-18' : '2026-09-' + String(i % 26 + 1).padStart(2, '0'),
          observed_at: new Date(observed), observed_ts: observed,
          note: 'E2E query measurement note ' + i, author_name: 'Perf',
        }
      }))
      if (!entries.length) entries.push(created[0])
      entryIds.push(...created.map(row => row.id))
      recordProgress('entries', start + length)
    }
    assert.equal(new Set(entryIds).size, SIZE, 'Garden entry IDs must be unique')
    for (let start = 0; start < SIZE; start += CHUNK) {
      const length = Math.min(CHUNK, SIZE - start)
      await GardenPhoto.bulkCreate(Array.from({ length }, (_,j) => {
        const i = start + j
        return {
          entry_id: entryIds[i], storage_name: 'sample-' + String(i).padStart(6,'0') + '.png',
          original_name: 'sample-' + i + '.png', mime: 'image/png',
          size_bytes: 123, thumb_name: 't-' + i + '.png', preview_name: 'p-' + i + '.png',
        }
      }))
      recordProgress('photos', start + length)
    }
    for (let start = 0; start < SIZE; start += CHUNK) {
      const length = Math.min(CHUNK, SIZE - start)
      await Reminder.bulkCreate(Array.from({ length }, (_,j) => {
        const i = start + j
        return {
          operation: i % 5 === 0 ? '消耗' : '补豆',
          items: [{ color: 'A' + (i % 20 + 1), count: i % 5 === 0 ? 1 : 3 }],
          occurred_at: new Date(observedBase - i * 60_000),
          note: 'Historical item ' + i,
        }
      }))
      recordProgress('reminders', start + length)
    }
    result.setup_ms = Math.round(performance.now() - setupStart)
    result.dataset = { garden_plants: 100000, garden_entries: 100000,
      garden_photos: 100000, reminders: 100000, calendar_day_entries: DAY_ENTRIES,
      primary_plant_entries: HOT_ENTRIES, scenario }
    const app = express()
    app.use(express.json({ limit: '1mb' }))
    app.use('/api/garden', require('../server/routes/garden'))
    app.use('/api/inventory', require('../server/routes/inventory'))
    app.use('/api/reminders', require('../server/routes/reminders'))
    app.use('/api/settings/shifts/overrides', require('../server/routes/day-shifts'))
    app.use('/api/settings/shifts', require('../server/routes/settings'))
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

      const hotDetail = await rawRequest('/api/garden/plants/' + plantId)
      const expectedNewest = await GardenPhoto.findOne({where:{entry_id:entryIds[HOT_ENTRIES-1]}})
      assert.equal(hotDetail.data.photo_count,HOT_ENTRIES)
      assert.equal(hotDetail.data.latest_photo_id,expectedNewest.id)
      const firstPlant = await rawRequest('/api/garden/plants?status=all&limit=36')
      const cursor = firstPlant.data.next_cursor
      assert.equal(firstPlant.data.total,100000)
      const firstDay = await rawRequest('/api/garden/calendar/day?date=2026-10-18&limit=40')
      const dayCursor = firstDay.data.next_cursor
      assert.equal(firstDay.data.total,DAY_ENTRIES)
      // Cursor fixtures are made before probes, not charged to API latency.
      const locatePlantCursor = async offset => {
        const row = await GardenPlant.findOne({
          attributes: ['id', 'createdAt'],
          order: [['createdAt','DESC'],['id','DESC']], offset,
        })
        assert(row)
        return Buffer.from(JSON.stringify(['plants', new Date(row.createdAt).toISOString(), row.id])).toString('base64url')
      }
      const locateDayCursor = async offset => {
        const row = await GardenEntry.findOne({
          attributes: ['id', 'observed_ts'], where: { local_date: '2026-10-18' },
          order: [['observed_ts','DESC'],['id','DESC']], offset,
        })
        assert(row)
        return Buffer.from(JSON.stringify(['day', Number(row.observed_ts), row.id])).toString('base64url')
      }
      const deepPlantCursor = await locatePlantCursor(50_000)
      const tailPlantCursor = await locatePlantCursor(99_965)
      const deepDayCursor = await locateDayCursor(25_000)
      const cases = [
        ['garden.plants.page1', () => rawRequest('/api/garden/plants?status=all&limit=36')],
        ['garden.plants.active', () => rawRequest('/api/garden/plants?status=active&limit=36')],
        ['garden.plants.archived', () => rawRequest('/api/garden/plants?status=archived&limit=36')],
        ['garden.plants.legacy500', () => rawRequest('/api/garden/plants?status=all')],
        ['garden.plants.deepCursor50k', () => rawRequest('/api/garden/plants?status=all&limit=36&cursor='+encodeURIComponent(deepPlantCursor))],
        ['garden.plants.tailCursor99965', () => rawRequest('/api/garden/plants?status=all&limit=36&cursor='+encodeURIComponent(tailPlantCursor))],
        ['garden.plants.cursor2', () => rawRequest('/api/garden/plants?status=all&limit=36&cursor='+encodeURIComponent(cursor))],
        ['garden.plants.search', () => rawRequest('/api/garden/plants?status=all&q=Performance&limit=36')],
        ['garden.plants.species', () => rawRequest('/api/garden/plants?status=all&species_id='+species.id+'&limit=36')],
        ['garden.plants.detail', () => rawRequest('/api/garden/plants/'+plantId)],
        ['garden.entries.first40', () => rawRequest('/api/garden/entries?plant_id='+plantId+'&limit=40&order=asc')],
        ['garden.entries.offset400', () => rawRequest('/api/garden/entries?plant_id='+plantId+'&limit=40&order=asc&offset=400')],
        ['garden.entries.offset50000', () => rawRequest('/api/garden/entries?plant_id='+plantId+'&limit=40&order=asc&offset=50000')],
        ['garden.entries.offset58000', () => rawRequest('/api/garden/entries?plant_id='+plantId+'&limit=40&order=asc&offset=58000')],
        ['garden.calendar.summary', () => rawRequest('/api/garden/calendar')],
        ['garden.calendar.day40', () => rawRequest('/api/garden/calendar/day?date=2026-10-18&limit=40')],
        ['garden.calendar.next40', () => rawRequest('/api/garden/calendar/day?date=2026-10-18&limit=40&cursor='+encodeURIComponent(dayCursor))],
        ['garden.calendar.deepCursor25k', () => rawRequest('/api/garden/calendar/day?date=2026-10-18&limit=40&cursor='+encodeURIComponent(deepDayCursor))],
        ['garden.calendar.legacy200', () => rawRequest('/api/garden/calendar/day?date=2026-10-18')],
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
      // Prepare delete fixtures OUTSIDE the timed requests. Never measure
      // POST+DELETE as one DELETE transaction (the former inflated p95 under
      // concurrent GitHub runner load).
      const deleteIDs = []
      for (let i = 0; i < 12; i++) {
        const row = await rawRequest('/api/reminders', asJSON(newReminder()))
        deleteIDs.push(row.data.id)
      }
      await probe('pindou.reminders.delete', () =>
        rawRequest('/api/reminders/'+deleteIDs.shift(), { method:'DELETE' }), 11)
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

      // Complete the SQL-facing CRUD coverage (without synthetic media I/O).
      // Each mutation samples the actual Express route; direct SQL fixture
      // seeding happens outside the timed request.
      await probe('garden.species.get', () => rawRequest('/api/garden/species'))
      let speciesSerial = 0
      await probe('garden.species.post', () => rawRequest('/api/garden/species',
        asJSON({ name: 'Benchmark Species ' + ++speciesSerial })), 5)
      let speciesRename = 0
      await probe('garden.species.patch', () => rawRequest('/api/garden/species/' + species.id,
        asJSON({ name: 'Perf Roses edit ' + ++speciesRename }, 'PATCH')), 5)
      const speciesToDelete = await GardenSpecies.bulkCreate(
        Array.from({ length: 6 }, (_, i) => ({ name: 'Discardable Species ' + i })))
      let speciesDeleteIndex = 0
      await probe('garden.species.delete', () => rawRequest('/api/garden/species/' +
        speciesToDelete[speciesDeleteIndex++].id, { method: 'DELETE' }), 5)

      let plantSerial = 0
      await probe('garden.plants.post', () => rawRequest('/api/garden/plants',
        asJSON({ name: 'Benchmark Plant ' + ++plantSerial, species_id: species.id,
          status: 'active', location: 'Performance Bench', notes: '' })), 5)
      let plantRename = 0
      await probe('garden.plants.patch', () => rawRequest('/api/garden/plants/' + plantId,
        asJSON({ name: 'Main Perf Plant ' + ++plantRename, species_id: species.id,
          status: 'active', location: 'Performance Bench', notes: '' }, 'PATCH')), 5)
      const plantsToDelete = await GardenPlant.bulkCreate(
        Array.from({ length: 6 }, (_,i) => ({ name:'Discardable Plant '+i, status:'active' })))
      let plantDeleteIndex = 0
      await probe('garden.plants.delete', () => rawRequest('/api/garden/plants/' +
        plantsToDelete[plantDeleteIndex++].id, { method:'DELETE' }), 5)
      await probe('garden.calendar.byPlant', () =>
        rawRequest('/api/garden/calendar?plant_id='+plantId))

      const detailEntry = entries[0]
      let entryNoteSerial = 0
      await probe('garden.entries.patch', () => rawRequest('/api/garden/entries/' + detailEntry.id,
        asJSON({ observed_at: detailEntry.observed_at, local_date: detailEntry.local_date,
          note:'SQL perf diary edit ' + ++entryNoteSerial, author_name:'Perf' },'PATCH')), 5)
      const entriesToDelete = await GardenEntry.bulkCreate(
        Array.from({ length: 6 }, (_,i) => {
          const ms=Date.UTC(2026,10,1,12,0,i)
          return { plant_id:plantId, observed_at:new Date(ms), observed_ts:ms,
            local_date:'2026-11-01', note:'Disposable Entry '+i, author_name:'Perf' }
        }))
      let entryDeleteIndex = 0
      await probe('garden.entries.delete', () => rawRequest('/api/garden/entries/' +
        entriesToDelete[entryDeleteIndex++].id, { method:'DELETE' }), 5)
      await probe('garden.photos.metadata', async () => {
        const photo = await GardenPhoto.findByPk(1)
        assert(photo)
        return { bytes:0 }
      })
      let ruleVersion = stored.data.version
      await probe('shifts.rules.large.put', async () => {
        const response = await rawRequest('/api/settings/shifts',
          asJSON({rules,version:ruleVersion},'PUT'))
        ruleVersion = response.data.version
        return response
      }, 5)
    } finally {
      sequelize.options.logging = formerLogger
      sequelize.options.benchmark = false
      collect = false
    }
    // Inspect planner estimates/index selection at the full 100k cardinality.
    const casesToExplain = [
      ['plants.all.page', "SELECT id FROM garden_plants ORDER BY created_at DESC, id DESC LIMIT 37"],
      ['plants.active.page', "SELECT id FROM garden_plants WHERE status='active' ORDER BY created_at DESC,id DESC LIMIT 37"],
      ['plants.search', "SELECT id FROM garden_plants WHERE name LIKE '%Performance%' OR location LIKE '%Performance%' LIMIT 37"],
      ['plants.count', "SELECT COUNT(*) FROM garden_plants WHERE status='active'"],
      ['entries.first', "SELECT id FROM garden_entries WHERE plant_id=" + plantId + " ORDER BY observed_ts ASC,id ASC LIMIT 41"],
      ['entries.offset50k', "SELECT id FROM garden_entries WHERE plant_id=" + plantId + " ORDER BY observed_ts ASC,id ASC LIMIT 41 OFFSET 50000"],
      ['day.page', "SELECT id FROM garden_entries WHERE local_date='2026-10-18' ORDER BY observed_ts DESC,id DESC LIMIT 41"],
      ['calendar.summary', "SELECT local_date, COUNT(*) FROM garden_entries GROUP BY local_date ORDER BY local_date DESC"],
      ['calendar.byPlant', "SELECT local_date, COUNT(*) FROM garden_entries WHERE plant_id=" + plantId + " GROUP BY local_date ORDER BY local_date DESC"],
      ['reminders.latest200', "SELECT id FROM pindou_reminders ORDER BY occurred_at DESC LIMIT 200"],
      ['reminders.latest200.full', "SELECT id, operation, items, note, image_path, occurred_at, created_at, updated_at FROM pindou_reminders ORDER BY occurred_at DESC LIMIT 200"],
      ['plant.photo.aggregate.hot', "SELECT stats.plant_id, stats.photo_count, MAX(p.id) AS latest_photo_id FROM (SELECT e.plant_id, COUNT(*) AS photo_count, MAX(e.observed_ts) AS latest_observed_ts FROM garden_entries e JOIN garden_photos p ON p.entry_id = e.id WHERE e.plant_id IN (" + plantId + ") GROUP BY e.plant_id) stats JOIN garden_entries e ON e.plant_id = stats.plant_id AND e.observed_ts = stats.latest_observed_ts JOIN garden_photos p ON p.entry_id = e.id GROUP BY stats.plant_id, stats.photo_count"],
    ]
    for (const [name, sql] of casesToExplain) {
      const [rows] = await sequelize.query('EXPLAIN ' + sql)
      result.explain.push({name, rows: rows.map(row=>({
        table: row.table, type: row.type, possible_keys: row.possible_keys,
        key: row.key, rows: row.rows, filtered: row.filtered, Extra: row.Extra,
      }))})
      console.log('SQL-PERF-PLAN ' + JSON.stringify(result.explain[result.explain.length-1]))
    }
    // Measure the production startup schema-sync path with an already-populated
    // 100k database. Fresh CREATE TABLE timing is *not* a substitute for
    // sequelize.sync({ alter: true }) on existing rows/indexes.
    if (process.env.SQL_PERF_SCHEMA_RESTART === '1') {
      const indexSnapshot = async () => {
        const [rows] = await admin.query(
          'SELECT TABLE_NAME, INDEX_NAME, COUNT(*) AS columns_count FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? GROUP BY TABLE_NAME, INDEX_NAME ORDER BY TABLE_NAME, INDEX_NAME',
          [dbName])
        return rows.map(row=>[row.TABLE_NAME, row.INDEX_NAME, Number(row.columns_count)])
      }
      const beforeIndexes = await indexSnapshot()
      const syncRuns = []
      for (let i = 0; i < 2; i++) {
        const start = performance.now()
        await sequelize.sync({ alter: true })
        const ms = Math.round((performance.now()-start)*100)/100
        const count = await Promise.all([
          GardenPlant.count(), GardenEntry.count(), GardenPhoto.count(), Reminder.count(),
        ])
        assert.deepEqual(count, [100_000,100_000,100_000,100_000],
          'Startup schema sync must preserve 100k data rows')
        syncRuns.push({ms,indexes:await indexSnapshot()})
        console.log('SQL-PERF-SCHEMA '+JSON.stringify({run:i+1,ms,indexes:syncRuns[i].indexes.length}))
      }
      assert.deepEqual(syncRuns[0].indexes,beforeIndexes,
        'Startup schema sync unexpectedly altered existing index definitions')
      assert.deepEqual(syncRuns[1].indexes,syncRuns[0].indexes,
        'Repeated startup schema sync must not create duplicate indexes')
      result.cold.schema_sync_existing_100k_ms = syncRuns.map(x=>x.ms)
    }
    // Worst-case destructive paths are single-shot timings, not p95. The
    // photo fixture contains *metadata only*, so unlink failures are expected
    // and cleanup time cannot be presented as real filesystem throughput.
    if (process.env.SQL_PERF_DESTRUCTIVE === '1') {
      const oneShot = async (name, fn) => {
        sqlCalls=0; dbDuration=0; sqlSlowest=[]; collect=true
        sequelize.options.benchmark=true
        const oldLog=sequelize.options.logging
        sequelize.options.logging=(sql, ms)=>{
          if (!collect) return
          sqlCalls++
          if (Number.isFinite(ms)) dbDuration+=ms
        }
        const start=performance.now()
        try {
          const res=await fn()
          const datum={name, http_ms:Math.round((performance.now()-start)*100)/100,
            sql_calls:sqlCalls, sql_total_ms:Math.round(dbDuration*100)/100,
            response_bytes:res.bytes}
          result.cold[name]=datum
          console.log('SQL-PERF-ONE-SHOT '+JSON.stringify(datum))
        } finally {collect=false;sequelize.options.logging=oldLog;sequelize.options.benchmark=false}
      }
      await oneShot('garden.plants.delete.hot', ()=>rawRequest(
        '/api/garden/plants/'+plantId, {method:'DELETE'}))
      assert.equal(await GardenEntry.count({where:{plant_id:plantId}}),0)
      await oneShot('garden.species.delete.100k', ()=>rawRequest(
        '/api/garden/species/'+species.id, {method:'DELETE'}))
      assert.equal(await GardenPlant.count({where:{species_id:species.id}}),0)
    }
    const outfile = process.env.SQL_PERF_OUTPUT ||
      path.join('test-results','sql-performance-100k.json')
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
