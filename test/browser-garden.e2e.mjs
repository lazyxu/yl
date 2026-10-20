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
async function runBrowser(engine, viewport, colorScheme = 'light') {
  const browser = await engine.launch({ headless: true })
  const touchDevice = viewport.width < 500 || (viewport.height <= 480 && viewport.width < 1000)
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    isMobile: touchDevice,
    hasTouch: touchDevice,
    colorScheme,
    locale: 'zh-CN',
    timezoneId: 'Asia/Tokyo',
    acceptDownloads: true,
  })
  const page = await context.newPage()
  const tag = engine.name() + '-' + viewport.width + 'x' + viewport.height + '-' + colorScheme
  let error = null
  try {
    const name = 'E2E 月季-' + tag + '-' + crypto.randomBytes(3).toString('hex')
    await page.goto(url + '/?view=花园', { waitUntil: 'domcontentloaded' })
    await page.getByText('我的花园', { exact: true }).waitFor({ timeout: 25000 })
    check(await page.locator('.app-shell').getAttribute('data-theme') === colorScheme, tag + ': app follows system appearance')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    check(overflow <= 1, tag + ': no page-level horizontal overflow')
    check(await page.locator('a[href="/api/garden/export"]').count() === 0, tag + ': no garden ZIP export')
    check(await page.getByText('正在生长', { exact: true }).count() === 0, tag + ': no active/archive filter')
    check(await page.getByText('已归档', { exact: true }).count() === 0, tag + ': no archive filter')
    check(await page.getByRole('button', { name: '添加花卉' }).count() === 1, tag + ': single add-plant entry')
    await page.getByRole('button', { name: '添加花卉' }).click()
    const modal = page.getByRole('dialog')
    await modal.getByLabel('给这株花起个名字').fill(name)
    await modal.getByRole('button', { name: '保存', exact: true }).click()
    await page.getByText(name, { exact: true }).waitFor()
    await page.getByText(name, { exact: true }).click()
    await page.getByRole('button', { name: '记录成长' }).waitFor()
    check(await page.getByRole('button', { name: '归档或恢复' }).count() === 0, tag + ': no archive button')
    await page.getByRole('button', { name: '更多花卉操作' }).click()
    await page.getByRole('menuitem', { name: '删除花卉' }).waitFor()
    await page.keyboard.press('Escape')
    await page.getByText('成长时间线', { exact: true }).waitFor()
    check(await page.getByRole('tab', { name: '照片', exact: true }).count() === 0, tag + ': no photo-grid tab')
    check(await page.getByRole('tab', { name: '成长对比', exact: true }).count() === 0, tag + ': no comparison tab')
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
    // A still-closing MUI dialog can retain an editing textarea with the
    // same content as the saved timeline paragraph. Await actual close.
    await modal.waitFor({ state: 'hidden' })
    await page.locator('.garden-timeline-note').getByText('浏览器端到端测试：开花', { exact: true }).waitFor()
    await page.getByRole('button', { name: '查看照片：garden.png' }).click()
    const downloadAnchor = page.locator('[aria-label="下载原图"]')
    await downloadAnchor.waitFor()
    const downloadHref = await downloadAnchor.getAttribute('href')
    // MUI icon button anchors can report as links or buttons depending on version.
    check(downloadHref?.includes('/api/garden/photos/') && downloadHref.endsWith('/original?download=1'), tag + ': original download URL')
    await page.getByRole('button', { name: '关闭', exact: true }).click()

    const record = page.locator('.garden-timeline-note').getByText('浏览器端到端测试：开花', { exact: true })
    await record.waitFor()
    await page.getByRole('button', { name: '日记操作' }).click()
    await page.getByRole('menuitem', { name: '删除日记' }).click()
    await page.getByRole('button', { name: '永久删除' }).click()
    await record.waitFor({ state: 'detached' })
    await page.locator('.garden-detail-back').click()
    await page.getByText(name, { exact: true }).waitFor()
    await page.getByRole('tab', { name: '花卉', exact: true }).focus()
    await page.keyboard.press('ArrowRight')
    check(await page.getByRole('tab', { name: '成长日历' }).getAttribute('aria-selected') === 'true', tag + ': keyboard tabs navigate right')
    await page.keyboard.press('ArrowLeft')
    check(await page.getByRole('tab', { name: '花卉', exact: true }).getAttribute('aria-selected') === 'true', tag + ': keyboard tabs navigate left')
    await page.getByRole('tab', { name: '成长日历' }).click()
    await page.getByRole('button', { name: '今天' }).click()
    const dayCell = await page.locator('.garden-calendar-day:not([disabled])').first().boundingBox()
    check(dayCell && dayCell.width >= 44 && dayCell.height >= 44, tag + ': calendar cell must have 44px touch target')
    await page.getByRole('button', { name: '上个月' }).click()
    await page.getByRole('tab', { name: '花卉', exact: true }).click()
    await page.getByText(name, { exact: true }).waitFor()
    await page.locator('footer button').filter({ hasText: '日历' }).click()
    const calendarRoot = page.locator('section[data-view="日历"]:not([hidden])')
    await calendarRoot.locator('.header h2').waitFor()
    check(await page.locator('.app-shell').getAttribute('data-theme') === colorScheme,
      tag + ': first-level calendar follows the system theme')
    const shiftLabels = calendarRoot.locator('.calendar .day .shift')
    const shiftText = await shiftLabels.allTextContents()
    check(shiftText.length === 42 && shiftText.every(s => ['白班', '夜班', '休息', '备班'].includes(s)),
      tag + ': every date still displays the full original shift label')
    const tagStyles = await shiftLabels.evaluateAll(nodes => nodes.map(node => {
      const css = getComputedStyle(node), box = node.getBoundingClientRect()
      return { text: node.textContent.trim(), font: css.fontSize, visible: css.visibility !== 'hidden',
        display: css.display, width: box.width, height: box.height, scrollWidth: node.scrollWidth }
    }))
    check(tagStyles.every(s => s.visible && s.display !== 'none' && s.font === '10px' &&
      s.width > 0 && s.height > 0 && s.scrollWidth <= s.width + 1),
      tag + ': shift text keeps 10px font, remains visible and is never truncated')
    check((await calendarRoot.locator('.schedule-legend').textContent()).includes('备班'),
      tag + ': standby is in the four-shift legend')
    const scheduleCell = await calendarRoot.locator('.calendar .day').first().boundingBox()
    check(scheduleCell && scheduleCell.width >= 44 && scheduleCell.height >= 44,
      tag + ': calendar date must have a 44x44 CSS-pixel target')
    const oldMonth = await calendarRoot.locator('.header h2').textContent()
    await calendarRoot.getByRole('button', { name: '下个月' }).click()
    check((await calendarRoot.locator('.header h2').textContent()) !== oldMonth, tag + ': month navigation')
    await calendarRoot.getByRole('button', { name: '今天', exact: true }).click()
    await calendarRoot.getByRole('button', { name: '排班设置' }).click()
    const rulesDialog = page.locator('[role="dialog"][aria-labelledby="shift-settings-title"]')
    await rulesDialog.waitFor()
    check((await rulesDialog.locator('.shift-legend').textContent()).includes('备班'), tag + ': settings retain the standby label')
    await rulesDialog.getByRole('button', { name: '新增排班' }).click()
    const ruleEditor = page.locator('[role="dialog"][aria-labelledby="shift-rule-editor-title"]')
    await ruleEditor.waitFor()
    await ruleEditor.getByRole('button', { name: '取消' }).click()
    await rulesDialog.getByRole('button', { name: '关闭排班设置' }).click()
    await calendarRoot.getByRole('button', { name: '调整当天排班' }).click()
    const dayEditor = page.locator('[role="dialog"][aria-labelledby="day-shift-title"]')
    await dayEditor.waitFor()
    await dayEditor.getByLabel('调整类型').selectOption('standby')
    check((await dayEditor.locator('.shift-preview-row').textContent()).includes('备班'),
      tag + ': standby preview remains text-based')
    await dayEditor.getByRole('button', { name: '取消' }).click()
    const discard = page.locator('[role="dialog"][aria-labelledby="shift-discard-title"]')
    await discard.getByRole('button', { name: '放弃更改' }).click()
    await page.locator('footer button').filter({ hasText: '拼豆' }).click()
    check(await page.locator('.app-shell').getAttribute('data-theme') === 'light',
      tag + ': Pindou remains light while Garden/Calendar may be dark')
    await page.getByText('库存总览').waitFor()
    await page.locator('footer button').filter({ hasText: '花园' }).click()
    check(await page.locator('.app-shell').getAttribute('data-theme') === colorScheme, tag + ': garden restores preferred theme')
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
    [chromium, { width: 320, height: 700 }],
    [chromium, { width: 375, height: 812 }],
    [webkit, { width: 390, height: 844 }],
    [chromium, { width: 430, height: 932 }],
    [webkit, { width: 812, height: 375 }],
    [chromium, { width: 1280, height: 800 }],
    [chromium, { width: 390, height: 844 }, 'dark'],
  ]
  for (const [engine, viewport, colorScheme] of scenarios) await runBrowser(engine, viewport, colorScheme)
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
