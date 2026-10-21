/** @jest-environment jsdom */
import React, { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import ShiftSettings from '../src/ShiftSettings'
import Calendar from '../src/Calendar'
jest.mock('../src/Calendar.css', () => ({}))
jest.mock('../src/ShiftSettings.css', () => ({}))
jest.setTimeout(30000)
const initial = { version: 4, rules: [
  { startDate: '2025-11-20', shifts: ['白班', '夜班', '休息'] },
  { startDate: '2026-01-24', shifts: ['夜班', '休息'] },
  { startDate: '2026-10-05', shifts: ['白班', '夜班', '休息'] },
] }
const copy = value => JSON.parse(JSON.stringify(value))
let root, host, database, writes, failNext, holdNext, releaseWrite
const originalFetch = global.fetch
function Harness() {
  const [settings, setSettings] = useState(copy(initial))
  return <ShiftSettings open settings={settings} onClose={() => {}} onSaved={setSettings}
    onReload={async () => { const loaded = await (await fetch('/api/settings/shifts')).json(); setSettings(loaded); return loaded }} />
}
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true
  database = copy(initial); writes = []; failNext = null; holdNext = false; releaseWrite = null
  global.fetch = jest.fn(async (url, options = {}) => {
    if (options.method !== 'PUT') return { ok: true, status: 200, json: async () => copy(database) }
    const submitted = JSON.parse(options.body); writes.push(submitted)
    if (holdNext) { holdNext = false; await new Promise(resolve => { releaseWrite = resolve }) }
    if (failNext) { const status = failNext; failNext = null; return { ok: false, status, json: async () => ({ error: '暂时无法保存' }) } }
    if (submitted.version !== database.version) return { ok: false, status: 409, json: async () => ({ error: '其他位置已更新' }) }
    database = { rules: copy(submitted.rules).sort((a, b) => a.startDate.localeCompare(b.startDate)), version: database.version + 1 }
    return { ok: true, status: 200, json: async () => copy(database) }
  })
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); global.fetch = originalFetch; jest.restoreAllMocks() })
async function mount(element = <Harness />) { await act(async () => root.render(element)) }
const timeline = () => document.querySelector('[role="dialog"][aria-labelledby="shift-settings-title"]')
const editor = () => document.querySelector('[role="dialog"][aria-labelledby="shift-rule-editor-title"]')
const rows = () => [...timeline().querySelectorAll('[data-start-date]')]
const row = date => rows().find(item => item.dataset.startDate === date)
function button(text, scope = document) { return [...scope.querySelectorAll('button')].find(el => el.textContent.trim() === text || el.getAttribute('aria-label') === text) }
async function click(text, scope) {
  const target = button(text, scope)
  expect(target).toBeTruthy()
  await act(async () => target.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  if (text === '取消') {
    const prompt = document.querySelector('[role="dialog"][aria-labelledby="shift-discard-title"]')
    const discard = prompt && button('放弃更改', prompt)
    if (discard) await act(async () => discard.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  }
}
async function change(element, value) {
  expect(element).toBeTruthy()
  await act(async () => {
    const prototype = element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value)
    element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
  })
}
async function edit(date) { await click('编辑', row(date)); expect(editor()).not.toBeNull() }

test('时间线倒序，新增与编辑在独立弹窗，取消不创建排班', async () => {
  await mount()
  expect(rows().map(el => el.dataset.startDate)).toEqual(['2026-10-05', '2026-01-24', '2025-11-20'])
  expect(row('2026-01-24').textContent).toContain('2026.10.04')
  await click('新增排班', timeline())
  expect(editor()).not.toBeNull()
  await change(editor().querySelector('input'), '2026-10-13')
  await click('取消', editor())
  expect(writes).toHaveLength(0); expect(database.rules).toHaveLength(3)
  await click('新增排班', timeline())
  expect(editor().querySelector('input').value).toBe('')
  await change(editor().querySelector('input'), '2026-10-13')
  await click('确认', editor())
  expect(database.rules[3]).toEqual({ startDate: '2026-10-13', shifts: ['白班', '夜班', '休息'] })
})

test('弹窗修改仅确认后保存，取消后再次打开恢复已生效班次', async () => {
  await mount(); await edit('2026-10-05')
  await change(editor().querySelector('select'), '休息')
  expect(writes).toHaveLength(0); expect(database.rules[2].shifts[0]).toBe('白班')
  await click('取消', editor()); await edit('2026-10-05')
  expect(editor().querySelector('select').value).toBe('白班')
  await change(editor().querySelector('select'), '休息'); await click('确认', editor())
  expect(database.rules[2].shifts).toEqual(['休息', '夜班', '休息'])
  expect(editor()).toBeNull()
})

test('循环天顺序可自由调整，确认保存新的完整顺序', async () => {
  await mount(); await edit('2026-10-05')
  jest.useFakeTimers()
  try {
    const dayRows = [...editor().querySelectorAll('[data-sort-id]')]
    dayRows.forEach((el, index) => { el.getBoundingClientRect = () => ({ top: index * 60, bottom: (index + 1) * 60, height: 60, width: 300, left: 0, right: 300 }) })
    const handle = button('长按拖动第3天', editor())
    const pointer = (type, target, y) => { const event = new Event(type, { bubbles: true, cancelable: true }); Object.assign(event, { pointerId: 1, button: 0, clientX: 10, clientY: y }); target.dispatchEvent(event) }
    await act(async () => { pointer('pointerdown', handle, 150); jest.advanceTimersByTime(450); pointer('pointermove', window, 20); pointer('pointerup', window, 20) })
  } finally { jest.useRealTimers() }
  expect([...editor().querySelectorAll('select')].map(el => el.value)).toEqual(['休息', '白班', '夜班'])
  expect(writes).toHaveLength(0)
  await click('确认', editor())
  expect(database.rules[2].shifts).toEqual(['休息', '白班', '夜班'])
})

test('日期重复被阻断，网络失败保留弹窗草稿供再次确认', async () => {
  await mount(); await edit('2026-10-05')
  await change(editor().querySelector('input'), '2026-01-24'); await click('确认', editor())
  expect(writes).toHaveLength(0)
  expect(editor().querySelector('[role="alert"]').textContent).toContain('不能重复')
  await change(editor().querySelector('input'), '2026-10-06'); failNext = 503
  await click('确认', editor())
  expect(editor().querySelector('input').value).toBe('2026-10-06')
  expect(database.rules[2].startDate).toBe('2026-10-05')
  await click('确认', editor()); expect(database.rules[2].startDate).toBe('2026-10-06')
})

test('确认中的重复点击不会重复写入，并发冲突要求重新加载', async () => {
  await mount(); await edit('2026-10-05'); await change(editor().querySelector('select'), '休息'); holdNext = true
  const confirmButton = button('确认', editor())
  await act(async () => { confirmButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); confirmButton.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
  expect(writes).toHaveLength(1)
  await act(async () => releaseWrite()); await edit('2026-10-05')
  database.version = 9
  await change(editor().querySelector('select'), '夜班'); await click('确认', editor())
  expect(database.rules[2].shifts[0]).toBe('休息')
  await click('重新加载', editor()); await edit('2026-10-05')
  await change(editor().querySelector('select'), '白班'); await click('确认', editor())
  expect(writes[2].version).toBe(9)
})

test('添加和移除一天先修改草稿，删除排班确认后生效', async () => {
  await mount(); await edit('2026-01-24'); await click('添加一天', editor())
  await click('移除第1天', editor())
  expect(writes).toHaveLength(0)
  await click('确认', editor()); expect(database.rules[1].shifts).toEqual(['休息', '休息'])
  await edit('2026-01-24'); await click('删除排班', editor()); expect(database.rules).toHaveLength(3)
  await click('确认删除'); expect(database.rules).toHaveLength(2)
})

test('日历与时间线相同班次共用颜色', async () => {
  await mount(<Calendar />); await click('排班设置')
  for (const shift of ['白班', '夜班', '休息']) {
    const day = [...host.querySelectorAll('.shift')].find(el => el.textContent === shift)
    const chip = [...timeline().querySelectorAll('[data-shift]')].find(el => el.dataset.shift === shift)
    expect(chip.style.backgroundColor).toBe(day.style.backgroundColor)
    expect(chip.style.color).toBe(day.style.color)
  }
})

test('编辑弹窗在键盘压缩视口时跟随可见高度', async () => {
  const originalViewport = window.visualViewport; const originalMatch = window.matchMedia
  const visual = new EventTarget(); Object.assign(visual, { height: 844, scale: 1 })
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: visual })
  window.matchMedia = () => ({ matches: true, addListener() {}, removeListener() {} })
  try {
    await mount(); await edit('2026-10-05')
    await act(async () => { editor().querySelector('input').focus(); visual.height = 430; visual.dispatchEvent(new Event('resize')) })
    expect(editor().style.height).toBe('430px')
  } finally { window.matchMedia = originalMatch; Object.defineProperty(window, 'visualViewport', { configurable: true, value: originalViewport }) }
})

test('排班规则页保留班次文字和排序入口，不重复展示颜色图例与提示', async () => {
  await mount()
  expect(timeline().querySelector('.shift-current-summary').textContent).toContain('当前生效')
  expect(timeline().querySelector('.shift-legend')).toBeNull()
  expect(timeline().querySelector('.shift-settings-toolbar').textContent).not.toContain('更改只有确认保存后才会生效')
  expect([...timeline().querySelectorAll('.shift-current-summary .shift-cycle-chip')].map(el => el.textContent))
    .toEqual(['白班', '夜班', '休息'])
  await edit('2026-10-05')
  expect(button('下移第1天', editor())).toBeTruthy()
  expect(button('上移第2天', editor())).toBeTruthy()
  await click('下移第1天', editor())
  expect([...editor().querySelectorAll('select')].map(el => el.value)).toEqual(['夜班','白班','休息'])
  expect(writes).toHaveLength(0)
  await click('取消', editor())
  expect(writes).toHaveLength(0)
})
