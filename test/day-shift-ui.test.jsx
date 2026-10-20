/** @jest-environment jsdom */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import Calendar from '../src/Calendar'
jest.mock('../src/Calendar.css', () => ({}))
jest.mock('../src/ShiftSettings.css', () => ({}))
const originalFetch = global.fetch
const rules = [{ startDate: '2026-10-05', shifts: ['白班', '夜班', '休息'] }]
let root, host, database, writes, failNext
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true
  jest.useFakeTimers({ now: new Date('2026-10-13T00:00:00+08:00') })
  database = { overrides: {}, version: 2 }; writes = []; failNext = null
  global.fetch = jest.fn(async (url, options = {}) => {
    if (!url.includes('/overrides')) return { ok: true, status: 200, json: async () => ({ rules, version: 1 }) }
    if (options.method === 'PUT') {
      const body = JSON.parse(options.body); writes.push({ url, body })
      if (failNext || body.version !== database.version) { const status = failNext || 409; failNext = null; return { ok: false, status, json: async () => ({ error: status === 409 ? '其他位置已更新' : '暂时无法保存' }) } }
      const date = url.split('/').pop()
      if (body.override === null) delete database.overrides[date]
      else database.overrides[date] = body.override
      database.version++
    }
    return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(database)) }
  })
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); global.fetch = originalFetch; jest.useRealTimers(); jest.restoreAllMocks() })
async function mount() { await act(async () => root.render(<Calendar />)) }
const editor = () => document.querySelector('[role="dialog"][aria-labelledby="day-shift-title"]')
const day = date => host.querySelector(`[data-date="${date}"]`) || [...host.querySelectorAll('.day')].find(el => el.querySelector('.date').textContent === String(Number(date.slice(-2))))
function pointer(type, target, x = 10, y = 10) { const event = new Event(type, { bubbles: true, cancelable: true }); Object.assign(event, { pointerId: 1, button: 0, isPrimary: true, clientX: x, clientY: y }); target.dispatchEvent(event) }
async function longPress(date) { await act(async () => { pointer('pointerdown', day(date)); jest.advanceTimersByTime(650); pointer('pointerup', day(date)); day(date).dispatchEvent(new MouseEvent('click', { bubbles: true })) }) }
const field = label => editor()?.querySelector(`[aria-label="${label}"]`)
async function change(element, value) { expect(element).toBeTruthy(); await act(async () => { const type = element.tagName === 'SELECT' ? HTMLSelectElement : element.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement; Object.getOwnPropertyDescriptor(type.prototype, 'value').set.call(element, value); element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })) }) }
async function click(text) {
  const button = [...editor().querySelectorAll('button')].find(el => el.textContent.trim() === text)
  expect(button).toBeTruthy()
  await act(async () => button.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  // Existing cancellation tests intentionally discard drafts. A separate test
  // verifies that the new confirmation is shown before discarding anything.
  if (text === '取消') {
    const dialog = document.querySelector('[role="dialog"][aria-labelledby="shift-discard-title"]')
    const discard = [...(dialog?.querySelectorAll('button') || [])].find(el => el.textContent.trim() === '放弃更改')
    if (discard) await act(async () => discard.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  }
}

test('长按日期打开弹窗，普通点击或滚动不触发改单日排班', async () => {
  await mount()
  await act(async () => { pointer('pointerdown', day('2026-10-13')); jest.advanceTimersByTime(100); pointer('pointerup', day('2026-10-13')) })
  expect(editor()).toBeNull()
  await act(async () => { pointer('pointerdown', day('2026-10-13')); pointer('pointermove', day('2026-10-13'), 10, 40); jest.advanceTimersByTime(650); pointer('pointerup', day('2026-10-13')) })
  expect(editor()).toBeNull()
  await longPress('2026-10-13'); expect(editor()).not.toBeNull()
  expect(editor().textContent).toContain('2026年10月13日')
})

test('备班和备注只在确认后生效，取消不写入，次日循环保持不变', async () => {
  await mount(); await longPress('2026-10-13')
  await change(field('调整类型'), 'standby'); await change(field('备注（可选）'), '临时值备班')
  await click('取消'); expect(writes).toHaveLength(0)
  await longPress('2026-10-13'); await change(field('调整类型'), 'standby'); await change(field('备注（可选）'), '临时值备班'); await click('确认')
  expect(database.overrides['2026-10-13']).toEqual({ kind: 'standby', shift: '备班', partner: '', note: '临时值备班' })
  expect(day('2026-10-13').querySelector('.shift').textContent).toBe('备班')
  expect(day('2026-10-14').querySelector('.shift').textContent).toBe('白班')
  expect(host.querySelector('.selected-date-info').textContent).toContain('临时值备班')
})

test('不填换班对象也能确认，重新加载后保留换后班次和备注', async () => {
  await mount(); await longPress('2026-10-13'); await change(field('调整类型'), 'swap')
  expect(field('换班对象')).not.toBeNull()
  await change(field('换后的班次'), '夜班'); await change(field('备注（可选）'), '临时调整'); await click('确认')
  expect(editor()).toBeNull()
  expect(writes).toHaveLength(1)
  expect(writes[0].body.override).toEqual({ kind: 'swap', shift: '夜班', partner: '', note: '临时调整' })
  await act(async () => root.render(<Calendar active={false} />))
  await act(async () => root.render(<Calendar active />))
  expect(day('2026-10-13').querySelector('.shift').textContent).toBe('夜班')
  expect(day('2026-10-13').querySelector('.day-adjustment-mark')).not.toBeNull()
  expect(host.querySelector('.selected-date-info').textContent).toContain('已换班')
  expect(host.querySelector('.selected-date-info').textContent).toContain('临时调整')
  await longPress('2026-10-13')
  expect(field('换班对象').value).toBe('')
  expect(field('换后的班次').value).toBe('夜班')
})

test('换班对象可填写或清空，再次编辑或还原不影响其他日期', async () => {
  database.overrides['2026-10-12'] = { kind: 'standby', shift: '备班', partner: '', note: '' }
  await mount(); await longPress('2026-10-13'); await change(field('调整类型'), 'swap')
  await change(field('换班对象'), ' 同事甲 '); await change(field('换后的班次'), '夜班'); await click('确认')
  expect(day('2026-10-13').querySelector('.shift').textContent).toBe('夜班')
  expect(host.querySelector('.selected-date-info').textContent).toContain('同事甲')
  await longPress('2026-10-13'); expect(field('换班对象').value).toBe('同事甲')
  await change(field('换班对象'), '   '); await click('确认')
  expect(writes[1].body.override).toEqual({ kind: 'swap', shift: '夜班', partner: '', note: '' })
  expect(host.querySelector('.selected-date-info').textContent).toContain('已换班')
  await longPress('2026-10-13')
  await change(field('调整类型'), 'normal'); await click('确认')
  expect(database.overrides['2026-10-13']).toBeUndefined()
  expect(database.overrides['2026-10-12'].kind).toBe('standby')
  expect(day('2026-10-13').querySelector('.shift').textContent).toBe('休息')
})

test('保存失败保留单日草稿，版本冲突不覆盖其他设备', async () => {
  await mount(); await longPress('2026-10-13'); await change(field('调整类型'), 'standby'); failNext = 503
  await click('确认'); expect(editor().querySelector('[role="alert"]').textContent).toContain('暂时无法保存')
  expect(field('调整类型').value).toBe('standby'); expect(database.overrides['2026-10-13']).toBeUndefined()
  database.version = 8
  await click('确认'); expect(editor().querySelector('[role="alert"]').textContent).toContain('其他位置已更新')
  await click('重新加载'); expect(editor()).toBeNull()
})

test('长按识别后继续横移不会在弹窗后面切换月份', async () => {
  await mount()
  const month = host.querySelector('.header h2').textContent
  const grid = host.querySelector('.calendar')
  const touch = (type, x) => { const event = new Event(type, { bubbles: true }); Object.assign(event, { touches: [{ clientX: x, clientY: 10 }], changedTouches: [{ clientX: x, clientY: 10 }] }); grid.dispatchEvent(event) }
  await act(async () => touch('touchstart', 200))
  await longPress('2026-10-13')
  await act(async () => { touch('touchmove', 100); touch('touchend', 100) })
  expect(host.querySelector('.header h2').textContent).toBe(month)
  expect(editor()).not.toBeNull()
})

test('切换到其他模块再回来保留单日弹窗未确认草稿', async () => {
  await mount(); await longPress('2026-10-13'); await change(field('调整类型'), 'swap'); await change(field('换班对象'), '同事甲'); await change(field('备注（可选）'), '待确认的备注')
  await act(async () => { root.render(<Calendar active={false} />) })
  await act(async () => jest.advanceTimersByTime(300))
  await act(async () => root.render(<Calendar active />))
  expect(field('换班对象')?.value).toBe('同事甲')
  expect(field('备注（可选）')?.value).toBe('待确认的备注')
  expect(writes).toHaveLength(0)
})


test('日历横向拖动用单个 rAF 更新 transform，不在 touchmove 时重渲染月份', async () => {
  const oldFrame = window.requestAnimationFrame
  const oldCancel = window.cancelAnimationFrame
  const frames = []
  window.requestAnimationFrame = jest.fn(callback => { frames.push(callback); return frames.length })
  window.cancelAnimationFrame = jest.fn()
  function swipeEvent(grid, type, x, y = 70) {
    const event = new Event(type, { bubbles: true, cancelable: true })
    Object.assign(event, {
      touches: type === 'touchend' || type === 'touchcancel' ? [] : [{ clientX: x, clientY: y }],
      changedTouches: [{ clientX: x, clientY: y }],
    })
    grid.dispatchEvent(event)
  }
  try {
    await mount()
    const grid = host.querySelector('.calendar')
    const firstDay = day('2026-10-13')
    const initialMonth = host.querySelector('.header h2').textContent
    await act(async () => {
      swipeEvent(grid, 'touchstart', 230)
      for (const x of [205, 180, 150, 120, 100]) swipeEvent(grid, 'touchmove', x)
    })
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1)
    expect(host.querySelector('.calendar')).toBe(grid)
    expect(day('2026-10-13')).toBe(firstDay)
    expect(host.querySelector('.header h2').textContent).toBe(initialMonth)
    await act(async () => frames[0]())
    expect(grid.style.transform).toBe('translate3d(-58.5px, 0, 0)')
    await act(async () => swipeEvent(grid, 'touchend', 100))
    expect(host.querySelector('.header h2').textContent).not.toBe(initialMonth)
    expect(grid.style.transform).toBe('')
  } finally {
    window.requestAnimationFrame = oldFrame
    window.cancelAnimationFrame = oldCancel
  }
})

test('日历纵向滚动、Safari 边缘手势以及取消不会误切月份', async () => {
  await mount()
  const grid = host.querySelector('.calendar')
  const initialMonth = host.querySelector('.header h2').textContent
  function touch(type, x, y) {
    const event = new Event(type, { bubbles: true, cancelable: true })
    Object.assign(event, {
      touches: type === 'touchend' || type === 'touchcancel' ? [] : [{ clientX: x, clientY: y }],
      changedTouches: [{ clientX: x, clientY: y }],
    })
    grid.dispatchEvent(event)
  }
  await act(async () => {
    touch('touchstart', 230, 20)
    touch('touchmove', 210, 150)
    touch('touchend', 80, 180)
    touch('touchstart', 12, 70)
    touch('touchmove', 190, 70)
    touch('touchend', 190, 70)
    touch('touchstart', 230, 70)
    touch('touchmove', 100, 70)
    touch('touchcancel', 100, 70)
  })
  expect(host.querySelector('.header h2').textContent).toBe(initialMonth)
  expect(grid.style.transform).toBe('')
})

test('日历重设计保留每天的完整班次文字标签、固定六周和今天入口', async () => {
  database.overrides['2026-10-13'] = { kind: 'standby', shift: '备班', partner: '', note: '' }
  await mount()
  expect(host.querySelectorAll('.calendar .day')).toHaveLength(42)
  expect(day('2026-10-13').querySelector('.shift').textContent).toBe('备班')
  expect([...host.querySelectorAll('.calendar .shift')].map(el => el.textContent)).toEqual(
    expect.arrayContaining(['白班', '夜班', '休息', '备班']))
  expect(host.querySelector('.schedule-legend').textContent).toContain('备班')
  expect(host.querySelector('.selected-date-info').textContent).toContain('在一起第')
  expect([...host.querySelectorAll('button')].some(el => el.textContent.trim() === '今天')).toBe(true)
  const month = host.querySelector('.header h2')
  await act(async () => host.querySelector('[aria-label="下个月"]').dispatchEvent(new MouseEvent('click', { bubbles: true })))
  expect(month.textContent).not.toContain('2026年10月')
  await act(async () => [...host.querySelectorAll('button')].find(el => el.textContent.trim() === '今天')
    .dispatchEvent(new MouseEvent('click', { bubbles: true })))
  expect(host.querySelector('.header h2').textContent).toBe('2026年10月')
  expect(day('2026-10-13').getAttribute('aria-current')).toBe('date')
})

test('日期支持键盘方向键并保持选中态，不修改后端排班', async () => {
  await mount()
  const start = day('2026-10-13')
  await act(async () => start.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })))
  expect(day('2026-10-14').getAttribute('aria-pressed')).toBe('true')
  expect(day('2026-10-14').querySelector('.shift').textContent).toBe('白班')
  expect(writes).toHaveLength(0)
})

test('单日编辑器退出有未保存确认，保留草稿直到明确放弃', async () => {
  await mount(); await longPress('2026-10-13')
  await change(field('调整类型'), 'swap')
  await change(field('换班对象'), '同事乙')
  const cancel = [...editor().querySelectorAll('button')].find(el => el.textContent.trim() === '取消')
  await act(async () => cancel.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  expect(editor()).not.toBeNull()
  expect(document.querySelector('[role="dialog"][aria-labelledby="shift-discard-title"]').textContent).toContain('放弃未保存')
  expect(writes).toHaveLength(0)
  const continueEdit = [...document.querySelectorAll('button')].find(el => el.textContent.trim() === '继续编辑')
  await act(async () => continueEdit.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  expect(field('换班对象').value).toBe('同事乙')
  await act(async () => cancel.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  const discard = [...document.querySelectorAll('button')].find(el => el.textContent.trim() === '放弃更改')
  await act(async () => discard.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  expect(editor()).toBeNull()
  expect(writes).toHaveLength(0)
})
