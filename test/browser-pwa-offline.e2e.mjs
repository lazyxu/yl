// True offline PWA integration: Express + disposable MySQL, not mocked fetches.
// E2E_MYSQL=1 node test/browser-pwa-offline.e2e.mjs
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium, webkit } from 'playwright'

if (process.env.E2E_MYSQL !== '1') process.exit(0)
const require = createRequire(import.meta.url)
const mysql = require('../server/node_modules/mysql2/promise')
const sharp = require('../server/node_modules/sharp')
const env = {
  ...process.env,
  DB_HOST: process.env.BACKUP_TEST_HOST || '127.0.0.1',
  DB_PORT: process.env.BACKUP_TEST_PORT || '3306',
  DB_USER: process.env.BACKUP_TEST_USER || 'root',
  DB_PASSWORD: process.env.BACKUP_TEST_PASSWORD || 'ci-only-password',
  DB_NAME: 'yl_offline_e2e_' + crypto.randomBytes(5).toString('hex'),
  HOST: '127.0.0.1',
}
const db = await mysql.createConnection({ host: env.DB_HOST, port: Number(env.DB_PORT),
  user: env.DB_USER, password: env.DB_PASSWORD })
const listener = net.createServer()
await new Promise((resolve, reject) => listener.once('error', reject).listen(0, env.HOST, resolve))
env.PORT = String(listener.address().port)
await new Promise(resolve => listener.close(resolve))
const origin = 'http://127.0.0.1:' + env.PORT
fs.mkdirSync('test-results', { recursive: true })
let server, tail = ''
async function startServer() {
  server = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(), env, stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stdout.on('data', chunk => { tail = (tail + chunk.toString()).slice(-12000) })
  server.stderr.on('data', chunk => { tail = (tail + chunk.toString()).slice(-12000) })
  for (let i = 0; i < 300; i++) {
    if (server.exitCode != null) throw new Error('Server stopped: ' + tail)
    try {
      const result = await fetch(origin + '/api/garden/species', { signal: AbortSignal.timeout(1000) })
      if (result.ok) return
    } catch { /* boot */ }
    await delay(200)
  }
  throw new Error('Server not ready: ' + tail)
}
async function stopServer() {
  if (!server || server.exitCode !== null || server.signalCode) { server = null; return }
  const previous = server
  const exited = new Promise(resolve => previous.once('exit', resolve))
  previous.kill('SIGTERM')
  await Promise.race([exited, delay(5000)])
  if (previous.exitCode == null && !previous.signalCode) {
    previous.kill('SIGKILL')
    await Promise.race([exited, delay(2000)])
  }
  server = null
}
async function disconnect(engine, context) {
  if (engine.name() === 'webkit') {
    // Playwright/WebKit offline emulation can fail SW-served navigations even
    // for a literal cached Response. An actual origin outage verifies the
    // fallback without that emulator bug (microsoft/playwright#42775).
    await stopServer()
  } else await context.setOffline(true)
}
async function reconnect(engine, context) {
  if (engine.name() === 'webkit') await startServer()
  else await context.setOffline(false)
}
async function idbValue(page, key) {
  return page.evaluate(key => new Promise(resolve => {
    const request = indexedDB.open('yl-offline-readonly', 1)
    request.onerror = () => resolve(null)
    request.onsuccess = () => {
      const db = request.result
      const tx = db.transaction('snapshots')
      const get = tx.objectStore('snapshots').get(key)
      get.onsuccess = () => resolve(get.result || null)
      get.onerror = () => resolve(null)
    }
  }), key)
}

async function verify(engine) {
  const browser = await engine.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true, locale: 'zh-CN', timezoneId: 'Asia/Tokyo' })
  const page = await context.newPage()
  const tag = engine.name()
  try {
    await page.goto(origin + '/?view=日历', { waitUntil: 'domcontentloaded' })
    const day = page.locator('section[data-view="日历"]:not([hidden])')
    await day.getByRole('button', { name: '调整当天排班' }).waitFor({ state: 'visible' })
    await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, { timeout: 45000 })
    await page.waitForFunction(() => new Promise(resolve => {
      const open = indexedDB.open('yl-offline-readonly', 1)
      open.onerror = () => resolve(false)
      open.onsuccess = () => {
        const get = open.result.transaction('snapshots').objectStore('snapshots').get('calendar')
        get.onsuccess = () => resolve(Boolean(get.result?.rules?.length && get.result?.savedAt))
        get.onerror = () => resolve(false)
      }
    }), { timeout: 15000 })
    const snapshot = await idbValue(page, 'calendar')
    assert(snapshot && Number.isInteger(snapshot.rulesVersion), tag + ': confirmed calendar snapshot written')

    const calendarResponse = await page.request.get(origin + '/api/settings/shifts')
    assert.match(calendarResponse.headers()['cache-control'] || '', /no-store/,
      tag + ': authoritative schedule JSON cannot be replayed from HTTP cache')
    const precaches = await page.evaluate(async () => {
      const names = await caches.keys()
      const cache = await caches.open(names.find(n => n.startsWith('yl-shell-')))
      return { names, requests: (await cache.keys()).map(x => new URL(x.url).pathname) }
    })
    assert(precaches.requests.includes('/index.html'), tag + ': app shell precached')
    assert(precaches.requests.some(x => x.startsWith('/assets/') && x.endsWith('.js')),
      tag + ': Vite assets precached')
    assert(precaches.requests.every(x => !x.startsWith('/api/')),
      tag + ': no private API in app precache')
    // Verify real Express responses, not just declarations in source code.
    const bundledJS = precaches.requests.find(x => /^\/assets\/.+\.js$/.test(x))
    const [assetHeaders, htmlHeaders, workerHeaders] = await Promise.all([
      page.request.get(origin + bundledJS), page.request.get(origin + '/index.html'),
      page.request.get(origin + '/sw.js'),
    ])
    assert.match(assetHeaders.headers()['cache-control'] || '', /max-age=31536000.*immutable/,
      tag + ': Vite hashed assets receive long-lived immutable HTTP cache headers')
    assert.match(htmlHeaders.headers()['cache-control'] || '', /no-cache/,
      tag + ': index HTML must be revalidated')
    assert.match(workerHeaders.headers()['cache-control'] || '', /no-store/,
      tag + ': service worker updates must bypass HTTP cache')

    // Real Service Worker fetch contract: an older open tab may request a
    // lazy chunk from the previous deployment. No network fallback may turn
    // that hashed JavaScript path into index.html or a 404.
    const previousChunk = await page.evaluate(async () => {
      const url = '/assets/previous-pWA12345.js'
      const name = 'yl-shell-old-chunk-probe'
      const oldCache = await caches.open(name)
      try {
        await oldCache.put(url, new Response('export const previousChunk = true;', {
          headers: { 'Content-Type': 'text/javascript' },
        }))
        const response = await fetch(url, { cache: 'no-store' })
        return { status: response.status, body: await response.text() }
      } finally {
        await caches.delete(name)
      }
    })
    assert.equal(previousChunk.status, 200, tag + ': previous lazy chunk remains available')
    assert.equal(previousChunk.body, 'export const previousChunk = true;',
      tag + ': older Vite dash-hashed chunk served from previous SW cache')
    // P1 fail closed even when iOS reports navigator.onLine=true but the
    // application's origin cannot be reached. A failed revalidation must
    // revoke edit permission without erasing the last verified snapshot.
    assert.equal(await day.getByRole('button', { name: '调整当天排班' }).isEnabled(), true,
      tag + ': connected confirmed schedule permits editing')
    await stopServer()
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await day.getByText('无法读取排班设置', { exact: false }).waitFor()
    assert.equal(await day.getByRole('button', { name: '调整当天排班' }).isDisabled(), true,
      tag + ': disconnected origin never leaves previously authorized editing enabled')
    assert.equal(await day.getByRole('button', { name: '排班设置' }).isDisabled(), true,
      tag + ': failed revalidation revokes settings mutations')
    await startServer()
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await page.waitForFunction(() => {
      const button = document.querySelector('.selected-date-footer button')
      return Boolean(button && !button.disabled)
    }, { timeout: 15000 })
    await disconnect(engine, context)
    await page.reload({ waitUntil: 'domcontentloaded' })
    // With network emulation Chromium reports offline; a WebKit origin outage
    // still yields the explicitly stale last-confirmed snapshot.
    await day.getByText('上次确认的排班快照', { exact: false }).waitFor()
    assert.equal(await day.getByRole('button', { name: '调整当天排班' }).isDisabled(), true)
    assert.equal(await day.locator('.calendar .day .shift').count(), 42)
    await reconnect(engine, context)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await day.getByRole('button', { name: '调整当天排班' }).waitFor({ state: 'visible' })
    await page.waitForFunction(() => !document.querySelector('.schedule-unverified'))

    await page.locator('footer button').filter({ hasText: '花园' }).click()
    await page.getByRole('button', { name: '添加花卉' }).click()
    const name = '离线验证月季-' + tag
    const editor = page.getByRole('dialog', { name: '添加花卉' })
    await editor.getByLabel('给这株花起个名字').fill(name)
    await editor.getByRole('button', { name: '保存', exact: true }).click()
    await page.getByText(name, { exact: true }).click()
    await page.getByRole('button', { name: '记录成长' }).click()
    const photo = await sharp({ create: { width: 64, height: 42, channels: 3,
      background: '#91b76b' } }).png().toBuffer()
    await page.locator('input[type="file"][multiple]').setInputFiles({
      name: 'offline.png', mimeType: 'image/png', buffer: photo,
    })
    await page.getByRole('textbox', { name: '备注（选填）' }).fill('离线保存的成长日记')
    await page.getByRole('dialog', { name: '记录成长' }).getByRole('button', { name: '保存记录' }).click()
    await page.locator('.garden-timeline-note').filter({ hasText: '离线保存的成长日记' }).waitFor()
    await page.locator('.garden-detail-back').click()
    await page.getByText(name, { exact: true }).waitFor()
    await page.getByText('离线浏览设置', { exact: true }).click()
    await page.getByLabel('开启花园离线浏览').check()
    await page.getByText(name, { exact: true }).click()
    const plantId = await page.evaluate(() => Number(new URLSearchParams(location.search).get('plant')))
    assert(Number.isSafeInteger(plantId) && plantId > 0,
      tag + ': detail URL identifies the actual newly created flower')
    await page.locator('.garden-timeline-note').filter({ hasText: '离线保存的成长日记' }).waitFor()
    assert(await idbValue(page, 'garden:index'), tag + ': opt-in index persisted')
    // Chromium and WebKit use the same disposable MySQL instance, and its
    // auto-increment IDs naturally differ across runs. Never hardcode id=1.
    await page.waitForFunction(id => new Promise(resolve => {
      const dbRequest = indexedDB.open('yl-offline-readonly', 1)
      dbRequest.onerror = () => resolve(false)
      dbRequest.onsuccess = () => {
        const item = dbRequest.result.transaction('snapshots')
          .objectStore('snapshots').get('garden:detail:' + id)
        item.onsuccess = () => resolve(item.result?.plant?.id === id)
        item.onerror = () => resolve(false)
      }
    }), plantId, { timeout: 15000 })
    assert(await idbValue(page, 'garden:detail:' + plantId),
      tag + ': opted-in visited detail persisted under its real plant id')
    await page.waitForFunction(async () => {
      const cache = await caches.open('yl-garden-thumbs-v1')
      return (await cache.keys()).length > 0
    }, { timeout: 10000 })
    await disconnect(engine, context)
    await page.goto(origin + '/?view=花园', { waitUntil: 'domcontentloaded' })
    await page.getByText(name, { exact: true }).waitFor()
    await page.getByText('仅显示上次离线保存的部分花园数据', { exact: false }).waitFor()
    assert.equal(await page.getByRole('button', { name: '添加花卉' }).isDisabled(), true)
    await page.getByText(name, { exact: true }).click()
    await page.locator('.garden-timeline-note').filter({ hasText: '离线保存的成长日记' }).waitFor()
    assert.equal(await page.getByRole('button', { name: '记录成长' }).count(), 0,
      tag + ': offline detail is read-only')
    await reconnect(engine, context)
    await page.goto(origin + '/?view=花园', { waitUntil: 'domcontentloaded' })
    await page.getByText(name, { exact: true }).waitFor()
    await page.getByText('离线浏览设置', { exact: true }).click()
    // Clearing IndexedDB and Cache Storage is async: wait until the switch
    // reports completion rather than treating a still-busy control as failed.
    await page.getByLabel('开启花园离线浏览').click()
    await page.waitForFunction(() =>
      localStorage.getItem('yl-garden-offline-optin-v1') !== 'yes' &&
      document.querySelector('[aria-label="开启花园离线浏览"]')?.checked === false)
    await page.waitForFunction(() => new Promise(resolve => {
      const req = indexedDB.open('yl-offline-readonly', 1)
      req.onerror = () => resolve(false)
      req.onsuccess = () => {
        const value = req.result.transaction('snapshots').objectStore('snapshots').get('garden:index')
        value.onsuccess = () => resolve(value.result == null)
        value.onerror = () => resolve(false)
      }
    }))
    assert.equal(await idbValue(page, 'garden:index'), null, tag + ': revoke consent erases offline index')
    assert(await idbValue(page, 'calendar'), tag + ': garden erasure preserves schedule snapshot')
    assert(!(await page.evaluate(() => caches.keys())).includes('yl-garden-thumbs-v1'),
      tag + ': revoke consent erases offline thumbnails')
    console.log('PASS PWA offline/read-only: ' + tag +
      (tag === 'webkit' ? ' (origin outage, not Playwright setOffline)' : ' (network offline emulation)'))
  } catch (error) {
    const file = 'test-results/offline-' + tag + '.png'
    await page.screenshot({ path: file, fullPage: true }).catch(() => {})
    throw new Error(tag + ': ' + error.stack + '\nScreenshot: ' + file + '\n' + tail)
  } finally {
    await context.close().catch(() => {})
    await browser.close().catch(() => {})
  }
}

try {
  await startServer()
  await verify(chromium)
  await verify(webkit)
} finally {
  await stopServer()
  try { await db.query('DROP DATABASE IF EXISTS `' + env.DB_NAME + '`') }
  finally { await db.end() }
}
