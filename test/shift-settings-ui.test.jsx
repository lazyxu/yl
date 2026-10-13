/** @jest-environment jsdom */
import React, { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import ShiftSettings from '../src/ShiftSettings'
import Calendar from '../src/Calendar'

jest.mock('../src/Calendar.css', () => ({}))
jest.mock('../src/ShiftSettings.css', () => ({}), { virtual: true })
jest.setTimeout(30000)

const initial = { version: 4, rules: [
  { startDate: '2025-11-20', shifts: ['白班', '夜班', '休息'] },
  { startDate: '2026-01-24', shifts: ['夜班', '休息'] },
  { startDate: '2026-10-05', shifts: ['白班', '夜班', '休息'] },
] }
let root, host, database, writes, failNext, holdNext, releaseWrite, failAfterCommit
const originalFetch = global.fetch
const copy = value => JSON.parse(JSON.stringify(value))

function Harness() {
  const [settings, setSettings] = useState(copy(initial))
  const [open, setOpen] = useState(true)
  return <><button onClick={() => setOpen(true)}>打开设置</button>
    <output aria-label="已生效的设置">{JSON.stringify(settings)}</output>
    <ShiftSettings open={open} settings={settings} onClose={() => setOpen(false)} onSaved={setSettings}
      onReload={async () => { const loaded = await (await fetch('/api/settings/shifts')).json(); setSettings(loaded); return loaded }} />
  </>
}

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true
  database = copy(initial)
  writes = []; failNext = null; holdNext = false; releaseWrite = null; failAfterCommit = false
  global.fetch = jest.fn(async (url, options = {}) => {
    if (options.method !== 'PUT') return { ok: true, status: 200, json: async () => copy(database) }
    const submitted = JSON.parse(options.body)
    writes.push(submitted)
    if (holdNext) { holdNext = false; await new Promise(resolve => { releaseWrite = resolve }) }
    if (failNext) { const status = failNext; failNext = null; return { ok: false, status, json: async () => ({ error: status === 409 ? '其他位置已更新' : '暂时无法保存' }) } }
    if (submitted.version !== database.version) return { ok: false, status: 409, json: async () => ({ error: '其他位置已更新' }) }
    database = { rules: copy(submitted.rules).sort((a, b) => a.startDate.localeCompare(b.startDate)), version: database.version + 1 }
    if (failAfterCommit) { failAfterCommit = false; return { ok: false, status: 503, json: async () => ({ error: '连接中断，无法确认结果' }) } }
    return { ok: true, status: 200, json: async () => copy(database) }
  })
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); global.fetch = originalFetch; jest.restoreAllMocks() })
async function mount(element = <Harness />) { await act(async () => root.render(element)) }
const dialog = () => document.querySelector('[role="dialog"][aria-labelledby="shift-settings-title"]')
const rows = () => [...dialog().querySelectorAll('[data-start-date]')]
const row = date => rows().find(item => item.dataset.startDate === date)
function button(text, scope = document) { return [...scope.querySelectorAll('button')].find(el => el.textContent.trim() === text || el.getAttribute('aria-label') === text) }
async function click(text, scope) { const target = button(text, scope); expect(target).toBeTruthy(); await act(async () => target.dispatchEvent(new MouseEvent('click', { bubbles: true }))) }
async function change(element, value) {
  expect(element).toBeTruthy()
  await act(async () => {
    const prototype = element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value)
    element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
  })
}
async function edit(date) { await click('编辑', row(date)); return row(date) }

test('时间线从新到旧展示生效区间，新增表单位于最上方', async () => {
  await mount()
  expect(rows().map(el => el.dataset.startDate)).toEqual(['2026-10-05', '2026-01-24', '2025-11-20'])
  expect(row('2026-01-24').textContent).toContain('2026.10.04')
  expect(button('保存设置', dialog())).toBeUndefined()
  expect(button('取消', dialog())).toBeUndefined()
  await click('新增排班', dialog())
  expect(rows()[0].querySelector('input[type="date"]').value).toBe('')
  expect(database.rules).toHaveLength(3)
  await change(rows()[0].querySelector('input[type="date"]'), '2026-10-13')
  expect(database.rules.find(rule => rule.startDate === '2026-10-13').shifts).toEqual(['白班', '夜班', '休息'])
  expect(rows()[0].dataset.startDate).toBe('2026-10-13')
  expect(dialog()).not.toBeNull()
})

test('班次修改自动写入并刷新已生效设置，编辑器保持打开', async () => {
  await mount()
  const selected = await edit('2026-10-05')
  await change(selected.querySelector('select'), '休息')
  expect(database.rules[2].shifts).toEqual(['休息', '夜班', '休息'])
  expect(JSON.parse(host.querySelector('output').textContent).version).toBe(5)
  expect(row('2026-10-05').querySelector('select').value).toBe('休息')
})

test('保存进行中继续修改会按版本顺序同步，最终保留全部修改', async () => {
  await mount(); await edit('2026-10-05'); holdNext = true
  await change(row('2026-10-05').querySelectorAll('select')[0], '休息')
  await change(row('2026-10-05').querySelectorAll('select')[1], '白班')
  expect(writes).toHaveLength(1)
  await act(async () => releaseWrite())
  expect(writes.map(request => request.version)).toEqual([4, 5])
  expect(database.rules[2].shifts).toEqual(['休息', '白班', '休息'])
  expect(row('2026-10-05').querySelectorAll('select')[1].value).toBe('白班')
})

test('网络失败保留修改，关闭再打开仍能重试同步', async () => {
  await mount(); await edit('2026-10-05'); failNext = 503
  await change(row('2026-10-05').querySelector('select'), '休息')
  expect(database.rules[2].shifts[0]).toBe('白班')
  expect(dialog().querySelector('[role="alert"]').textContent).toContain('暂时无法保存')
  await click('关闭排班设置'); await click('打开设置')
  expect(row('2026-10-05').querySelector('select').value).toBe('休息')
  await click('重试同步', dialog())
  expect(database.rules[2].shifts[0]).toBe('休息')
})

test('重复或不完整的日期不会写入，修正后自动保存', async () => {
  await mount(); await edit('2026-10-05')
  await change(row('2026-10-05').querySelector('input'), '2026-01-24')
  expect(writes).toHaveLength(0)
  expect(dialog().querySelector('[role="alert"]').textContent).toContain('不能重复')
  const input = dialog().querySelector('input[type="date"]')
  await change(input, '')
  expect(writes).toHaveLength(0)
  await change(input, '2026-10-06')
  expect(database.rules[2].startDate).toBe('2026-10-06')
})

test('删除规则先确认，再自动保存；最后一条排班不可删除', async () => {
  await mount(); await edit('2026-10-05')
  await click('删除排班', row('2026-10-05'))
  expect(database.rules).toHaveLength(3)
  await click('确认删除')
  expect(database.rules.map(rule => rule.startDate)).toEqual(['2025-11-20', '2026-01-24'])
  await edit('2026-01-24'); await click('删除排班', row('2026-01-24')); await click('确认删除')
  await edit('2025-11-20')
  expect(button('删除排班', row('2025-11-20')).disabled).toBe(true)
})

test('增删循环中的一天立即保存，并且保留至少一天', async () => {
  await mount(); await edit('2026-01-24')
  await click('添加一天', row('2026-01-24'))
  expect(database.rules[1].shifts).toEqual(['夜班', '休息', '休息'])
  await click('移除第3天', row('2026-01-24')); await click('移除第2天', row('2026-01-24'))
  expect(database.rules[1].shifts).toEqual(['夜班'])
  expect(button('移除第1天', row('2026-01-24')).disabled).toBe(true)
})

test('并发冲突不覆盖其他位置的设置，重新加载后使用新版本保存', async () => {
  await mount(); await edit('2026-10-05')
  database.version = 8; database.rules[2].shifts[0] = '夜班'
  await change(row('2026-10-05').querySelector('select'), '休息')
  expect(database.rules[2].shifts[0]).toBe('夜班')
  await click('重新加载', dialog()); await edit('2026-10-05')
  expect(row('2026-10-05').querySelector('select').value).toBe('夜班')
  await change(row('2026-10-05').querySelector('select'), '白班')
  expect(writes[1].version).toBe(8)
  expect(database.rules[2].shifts[0]).toBe('白班')
})

test('日历与时间线对相同班次使用相同背景和文字颜色', async () => {
  await mount(<Calendar />); await click('排班设置')
  for (const shift of ['白班', '夜班', '休息']) {
    const calendarChip = [...host.querySelectorAll('.shift')].find(el => el.textContent === shift)
    const timelineChip = [...dialog().querySelectorAll('[data-shift]')].find(el => el.dataset.shift === shift)
    expect(calendarChip).toBeTruthy(); expect(timelineChip).toBeTruthy()
    expect(calendarChip.style.backgroundColor).not.toBe('')
    expect(timelineChip.style.backgroundColor).toBe(calendarChip.style.backgroundColor)
    expect(timelineChip.style.color).toBe(calendarChip.style.color)
  }
})

test('未同步修改阻止网页直接卸载，重试成功后解除保护', async () => {
  await mount(); await edit('2026-10-05'); failNext = 503
  await change(row('2026-10-05').querySelector('select'), '休息')
  const pendingUnload = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(pendingUnload)
  expect(pendingUnload.defaultPrevented).toBe(true)
  await click('重试同步', dialog())
  const savedUnload = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(savedUnload)
  expect(savedUnload.defaultPrevented).toBe(false)
})

test('未填写日期的新排班及其班次在关闭再打开后保留', async () => {
  await mount(); await click('新增排班', dialog())
  await change(rows()[0].querySelector('select'), '夜班')
  await click('关闭排班设置'); await click('打开设置')
  expect(rows()[0].querySelector('input[type="date"]').value).toBe('')
  expect(rows()[0].querySelector('select').value).toBe('夜班')
  expect(database.rules).toHaveLength(3)
})

test('响应中断后改回原值仍确认服务端版本，不能误认为已同步', async () => {
  await mount(); await edit('2026-10-05'); failAfterCommit = true
  await change(row('2026-10-05').querySelector('select'), '休息')
  expect(database.rules[2].shifts[0]).toBe('休息')
  await change(row('2026-10-05').querySelector('select'), '白班')
  expect(dialog().querySelector('[role="alert"]')?.textContent).toContain('其他位置已更新')
  expect(database.rules[2].shifts[0]).toBe('休息')
  expect(button('重新加载', dialog())).toBeTruthy()
})

test('手机键盘压缩视口时排班弹窗跟随可见高度', async () => {
  const originalViewport = window.visualViewport
  const visual = new EventTarget()
  Object.assign(visual, { height: 844, scale: 1 })
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: visual })
  const originalMatchMedia = window.matchMedia
  window.matchMedia = () => ({ matches: true, addListener() {}, removeListener() {} })
  try {
    await mount(); await edit('2026-10-05')
    await act(async () => {
      row('2026-10-05').querySelector('input').focus()
      visual.height = 430
      visual.dispatchEvent(new Event('resize'))
    })
    expect(dialog().style.height).toBe('430px')
    expect(dialog().style.maxHeight).toBe('430px')
  } finally {
    window.matchMedia = originalMatchMedia
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: originalViewport })
  }
})
