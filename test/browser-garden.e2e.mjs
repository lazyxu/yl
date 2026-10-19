// Browser-level smoke test against the real Express + MySQL application.
// Run with: E2E_MYSQL=1 node test/browser-garden.e2e.mjs
// Requires the built dist, server/node_modules and playwright Chromium/WebKit.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import net from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium, webkit } from 'playwright'

const require = createRequire(import.meta.url)
const mysql = require('../server/node_modules/mysql2/promise')
const sharp = require('../server/node_modules/sharp')

if (process.env.E2E_MYSQL !== '1') {
  console.log('Browser E2E requires E2E_MYSQL=1 and a disposable MySQL installation')
  process.exit(0)
}

const env = {
  ...process.env,
  DB_HOST: process.env.BACKUP_TEST_HOST || '127.0.0.1',
  DB_PORT: process.env.BACKUP_TEST_PORT || '3306',
  DB_USER: process.env.BACKUP_TEST_USER || 'root',
  DB_PASSWORD: process.env.BACKUP_TEST_PASSWORD || 'ci-only-password',
  DB_NAME: 'yl_browser_e2e_' + crypto.randomBytes(5).toString('hex'),
  HOST: '127.0.0.1',
}
const db = await mysql.createConnection({
  host: env.DB_HOST,
  port: Number(env.DB_PORT),
  user: env.DB_USER,
  password: env.DB_PASSWORD,
})
const listener = net.createServer()
await new Promise((resolve, reject) => listener.once('error', reject).listen(0, '127.0.0.1', resolve))
env.PORT = String(listener.address().port)
await new Promise(resolve => listener.close(resolve))
const url = 'http://127.0.0.1:' + env.PORT

let server, tail = ''
const failures = []
fs.mkdirSync('test-results', { recursive: true })
function check(condition, message) {
  assert.ok(condition, message)
}
async function waitForServer() {
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    if (server.exitCode != null) throw new Error('Server exited during boot: ' + tail)
    try {
      const response = await fetch(url + '/api/garden/species', { signal: AbortSignal.timeout(1200) })
      if (response.ok) return
    } catch { /* booting */ }
    await delay(300)
  }
  throw new Error('Server did not become ready: ' + tail)
}
async function runBrowser(engine, viewport) {
  const browser = await engine.launch({ headless: true })
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    isMobile: viewport.width < 500,
    hasTouch: viewport.width < 500,
    locale: 'zh-CN',
    timezoneId: 'Asia/Tokyo',
    acceptDownloads: true,
  })
  const page = await context.newPage()
  const tag = engine.name() + '-' + viewport.width
  let error = null
  try {
    const name = 'E2E 月季-' + tag + '-' + crypto.randomBytes(3).toString('hex')
    await page.goto(url + '/?view=花园', { waitUntil: 'domcontentloaded' })
    await page.getByText('我的花园', { exact: true }).waitFor({ timeout: 25000 })
    await page.getByRole('button', { name: '添加花卉' }).click()
    const modal = page.getByRole('dialog')
    await modal.getByLabel('给这株花起个名字').fill(name)
    await modal.getByRole('button', { name: '保存', exact: true }).click()
    await page.getByText(name, { exact: true }).waitFor()
    await page.getByText(name, { exact: true }).click()
    await page.getByRole('button', { name: '记录成长' }).waitFor()
    await page.getByRole('button', { name: '记录成长' }).click()

    const photo = await sharp({ create: { width: 48, height: 32, channels: 3, background: '#a4b38a' } }).png().toBuffer()
    await page.locator('input[type="file"][multiple]').setInputFiles({
      name: 'garden.png',
      mimeType: 'image/png',
      buffer: photo,
    })
    await page.getByText('已选择 1 / 8 张').waitFor()
    await page.getByRole('textbox', { name: '备注（选填）' }).fill('浏览器端到端测试：开花')
    await modal.getByRole('button', { name: '保存记录' }).click()
    await page.getByText('浏览器端到端测试：开花', { exact: true }).waitFor()
    await page.getByRole('button', { name: '查看照片：garden.png' }).click()
    const downloadAnchor = page.locator('[aria-label="下载原图"]')
    await downloadAnchor.waitFor()
    const downloadHref = await downloadAnchor.getAttribute('href')
    // MUI icon button anchors can report as links or buttons depending on version.
    check(downloadHref?.includes('/api/garden/photos/') && downloadHref.endsWith('/original?download=1'), tag + ': original download URL')
    await page.getByRole('button', { name: '关闭', exact: true }).click()

    const record = page.getByText('浏览器端到端测试：开花', { exact: true })
    await record.waitFor()
    page.once('dialog', async dialog => dialog.accept())
    await page.getByRole('button', { name: '删除日记' }).click()
    await record.waitFor({ state: 'detached' })
    await page.getByRole('button', { name: '返回我的花园' }).click()
    await page.getByText(name, { exact: true }).waitFor()
    await page.locator('footer button').filter({ hasText: '日历' }).click()
    await page.locator('section[data-view="日历"]:not([hidden]) .header h2').waitFor()
    await page.locator('footer button').filter({ hasText: '拼豆' }).click()
    await page.getByText('库存总览').waitFor()
    await page.locator('footer button').filter({ hasText: '花园' }).click()
    await page.getByText(name, { exact: true }).waitFor()
    console.log('PASS browser garden: ' + tag)
  } catch (e) {
    error = e
    const suffix = tag.replace(/[^a-zA-Z0-9-]/g, '-')
    const file = 'test-results/garden-' + suffix + '.png'
    try { await page.screenshot({ path: file, fullPage: true }) } catch { /* navigation or browser died */ }
    failures.push({ tag, file, error: String(e.stack || e) })
  } finally {
    await context.close().catch(() => {})
    await browser.close().catch(() => {})
  }
  return !error
}

try {
  server = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stdout.on('data', chunk => { tail = (tail + chunk.toString()).slice(-12_000) })
  server.stderr.on('data', chunk => { tail = (tail + chunk.toString()).slice(-12_000) })
  await waitForServer()
  const scenarios = [
    [chromium, { width: 390, height: 844 }],
    [webkit, { width: 390, height: 844 }],
    [chromium, { width: 1280, height: 800 }],
  ]
  for (const [engine, viewport] of scenarios) await runBrowser(engine, viewport)
  if (failures.length) throw new Error(failures.map(x => x.tag + ': ' + x.error + '\nScreenshot: ' + x.file).join('\n\n'))
} finally {
  if (server && server.exitCode == null) {
    server.kill('SIGTERM')
    await Promise.race([new Promise(resolve => server.once('exit', resolve)), delay(5000)])
    if (server.exitCode == null) server.kill('SIGKILL')
  }
  try {
    await db.query('DROP DATABASE IF EXISTS ' + String.fromCharCode(96) + env.DB_NAME + String.fromCharCode(96))
  } finally { await db.end() }
}
