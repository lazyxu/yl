/** @jest-environment jsdom */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import App from '../src/App'

// Cold lazy imports also compile Material UI in this Windows test environment.
jest.setTimeout(30000)

jest.mock('../src/App.css', () => ({}))
jest.mock('../src/Calendar.css', () => ({}))
jest.mock('../src/ShiftSettings.css', () => ({}))

function HistoryControls() {
  const navigate = useNavigate()
  return <><button onClick={() => navigate(-1)}>测试后退</button><button onClick={() => navigate(1)}>测试前进</button></>
}

let root, host
const originalFetch = global.fetch
const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true
  URL.createObjectURL = jest.fn(() => 'blob:local-draft-preview')
  URL.revokeObjectURL = jest.fn()
  localStorage.clear()
  global.fetch = jest.fn(async url => ({
    ok: true, status: 200, statusText: 'OK',
    json: async () => url === '/api/inventory' || url === '/api/reminders' ? [] : { rules: [{ startDate: '2024-01-01', shifts: ['休息'] }], version: 0 },
  }))
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  global.fetch = originalFetch
  URL.createObjectURL = originalCreateObjectURL
  URL.revokeObjectURL = originalRevokeObjectURL
  jest.restoreAllMocks()
})

async function mount(view = '日历') {
  await act(async () => root.render(
    <MemoryRouter initialEntries={[`/?view=${view}`]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App /><HistoryControls />
    </MemoryRouter>,
  ))
}

function button(name) {
  return [...document.querySelectorAll('button')].find(el => !el.closest('[hidden]') && (el.getAttribute('aria-label') === name || el.textContent.trim() === name))
}

async function click(name) {
  const el = button(name)
  expect(el).toBeDefined()
  await act(async () => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))
}

function input(label) {
  const labelElement = [...document.querySelectorAll('label')].find(el => !el.closest('[hidden]') && el.textContent.trim() === label)
  return labelElement && document.getElementById(labelElement.htmlFor)
}

async function fill(label, value) {
  const el = input(label)
  expect(el).toBeTruthy()
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

test('拼豆子页有明确的主导航归属，浏览器后退后仍保留日历月份', async () => {
  await mount()
  expect(document.querySelector('nav[aria-label="主导航"]')).not.toBeNull()
  expect(button('日历').getAttribute('aria-current')).toBe('page')
  await click('→')
  const chosenMonth = document.querySelector('.header h2').textContent
  await click('拼豆')
  await click('补豆')
  expect(button('拼豆').getAttribute('aria-current')).toBe('page')
  await click('日历')
  expect(document.querySelector('.header h2').textContent).toBe(chosenMonth)
  await click('测试后退')
  expect(button('拼豆').getAttribute('aria-current')).toBe('page')
  expect(input('数量')).toBeTruthy()
  await click('测试前进')
  expect(document.querySelector('.header h2').textContent).toBe(chosenMonth)
})

test('库存筛选和排序在跨模块切换后保留', async () => {
  global.fetch = jest.fn(async url => ({
    ok: true, status: 200, statusText: 'OK',
    json: async () => url === '/api/inventory' ? [{ color: 'A1', count: 12 }, { color: 'A2', count: 500 }] : { rules: [{ startDate: '2024-01-01', shifts: ['休息'] }], version: 0 },
  }))
  await mount('拼豆')
  const lowButton = [...document.querySelectorAll('button')].find(el => el.textContent.startsWith('低于阈值:'))
  await act(async () => lowButton.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  await click('升序')
  await click('日历')
  await click('拼豆')
  expect(button('升序').getAttribute('aria-pressed')).toBe('true')
  expect([...document.querySelectorAll('button')].find(el => !el.closest('[hidden]') && el.textContent.startsWith('低于阈值:')).getAttribute('aria-pressed')).toBe('true')
})

test('重新进入库存时请求失败保留已加载数量', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {})
  let inventoryRequests = 0
  global.fetch = jest.fn(async url => {
    if (url === '/api/inventory') {
      inventoryRequests += 1
      return inventoryRequests === 1
        ? { ok: true, status: 200, statusText: 'OK', json: async () => [{ color: 'A1', count: 12 }] }
        : { ok: false, status: 500, statusText: 'Server error', json: async () => ({ error: 'temporary failure' }) }
    }
    return { ok: true, status: 200, statusText: 'OK', json: async () => ({ rules: [{ startDate: '2024-01-01', shifts: ['休息'] }], version: 0 }) }
  })
  await mount('拼豆')
  expect(document.querySelector('[aria-label="A1，12 颗"]')).not.toBeNull()
  await click('日历')
  await click('拼豆')
  expect(document.querySelector('[aria-label="A1，12 颗"]')).not.toBeNull()
})

test('日历切换后继续原补豆草稿，取消后重新打开为空', async () => {
  await mount('补豆')
  await fill('数量', '23')
  await fill('备注（可选）', '保留的补豆草稿')
  await click('日历')
  await click('拼豆')
  expect(input('数量')?.value).toBe('23')
  expect(input('备注（可选）')?.value).toBe('保留的补豆草稿')
  await click('取消')
  await click('补豆')
  expect(input('数量').value).toBe('')
  expect(input('备注（可选）').value).toBe('')
})

test('补豆与消耗草稿互相独立，返回库存后仍可继续编辑', async () => {
  await mount('补豆')
  await fill('数量', '23')
  await fill('备注（可选）', '补豆草稿')
  await click('返回库存')
  await click('消耗')
  expect(input('数量').value).toBe('')
  await fill('数量', '7')
  await fill('备注（可选）', '消耗草稿')
  await click('返回库存')
  await click('补豆')
  expect(input('数量').value).toBe('23')
  expect(input('备注（可选）').value).toBe('补豆草稿')
})

test('每个页面恢复自己的滚动位置', async () => {
  await mount('拼豆')
  const inventoryPage = document.querySelector('[data-view="拼豆"]')
  expect(inventoryPage).not.toBeNull()
  await act(async () => {
    inventoryPage.scrollTop = 320
    inventoryPage.dispatchEvent(new Event('scroll', { bubbles: true }))
  })
  await click('日历')
  expect(document.querySelector('[data-view="日历"]').scrollTop).toBe(0)
  await click('拼豆')
  expect(document.querySelector('[data-view="拼豆"]').scrollTop).toBe(320)
})

test('软键盘压缩视口时收起底部导航，关闭键盘后恢复', async () => {
  const viewport = new EventTarget()
  Object.assign(viewport, { height: 844, scale: 1 })
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport })
  try {
    await mount('补豆')
    await act(async () => {
      input('备注（可选）').focus()
      viewport.height = 480
      viewport.dispatchEvent(new Event('resize'))
    })
    expect(document.querySelector('footer')).not.toBeNull()
    expect(document.querySelector('footer').hidden).toBe(true)
    await act(async () => {
      viewport.height = 844
      viewport.dispatchEvent(new Event('resize'))
      input('备注（可选）').blur()
    })
    expect(document.querySelector('footer').hidden).toBe(false)
  } finally {
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined })
  }
})

test('输入时横竖屏切换后，关闭键盘仍能恢复导航', async () => {
  const viewport = new EventTarget()
  const initialWidth = window.innerWidth, initialHeight = window.innerHeight
  Object.assign(viewport, { height: 844, scale: 1 })
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport })
  window.innerWidth = 390
  window.innerHeight = 844
  try {
    await mount('补豆')
    await act(async () => {
      input('备注（可选）').focus()
      viewport.height = 480
      viewport.dispatchEvent(new Event('resize'))
    })
    expect(document.querySelector('footer').hidden).toBe(true)
    await act(async () => {
      window.innerWidth = 844
      window.innerHeight = 390
      viewport.height = 240
      window.dispatchEvent(new Event('resize'))
    })
    expect(document.querySelector('footer').hidden).toBe(true)
    await act(async () => {
      viewport.height = 390
      viewport.dispatchEvent(new Event('resize'))
    })
    expect(document.querySelector('footer').hidden).toBe(false)
  } finally {
    window.innerWidth = initialWidth
    window.innerHeight = initialHeight
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined })
  }
})

test('所选图片随草稿保留，取消草稿后移除', async () => {
  await mount('补豆')
  const fileInput = document.querySelector('input[type="file"]')
  Object.defineProperty(fileInput, 'files', { configurable: true, value: [new File(['image bytes'], 'draft.png', { type: 'image/png' })] })
  await act(async () => fileInput.dispatchEvent(new Event('change', { bubbles: true })))
  await click('日历')
  await click('拼豆')
  expect(document.querySelector('[data-view="补豆"]').textContent).toContain('图片：draft.png')
  expect(document.querySelector('img[alt="preview"]')).not.toBeNull()
  await click('取消')
  await click('补豆')
  expect(document.querySelector('[data-view="补豆"]').textContent).not.toContain('图片：draft.png')
  expect(document.querySelector('img[alt="preview"]')).toBeNull()
})

test('保存成功刷新库存并清空已提交草稿', async () => {
  jest.spyOn(window, 'alert').mockImplementation(() => {})
  let inventoryCount = 12
  global.fetch = jest.fn(async (url, options) => {
    if (url === '/api/reminders' && options?.method === 'POST') {
      const body = JSON.parse(options.body)
      if (body.operation === '补豆') inventoryCount += body.items.find(item => item.color === 'A1')?.count || 0
      return { ok: true, status: 200, statusText: 'OK', json: async () => ({ id: 1, ...body }) }
    }
    return { ok: true, status: 200, statusText: 'OK', json: async () => url === '/api/inventory' ? [{ color: 'A1', count: inventoryCount }] : { rules: [{ startDate: '2024-01-01', shifts: ['休息'] }], version: 0 } }
  })
  await mount('拼豆')
  await click('补豆')
  await fill('选择色号', 'A1')
  const option = [...document.querySelectorAll('[role="option"]')].find(el => el.textContent.endsWith('A1'))
  expect(option).toBeTruthy()
  await act(async () => option.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  await fill('数量', '23')
  await fill('备注（可选）', '已提交的补豆')
  await click('补豆')
  expect(document.querySelector('[data-view="拼豆"]').hidden).toBe(false)
  expect(document.querySelector('[aria-label="A1，35 颗"]')).not.toBeNull()
  await click('补豆')
  expect(input('数量').value).toBe('')
  expect(input('备注（可选）').value).toBe('')
})

test('保存中浏览器返回并重开表单仍禁用输入，避免重复提交', async () => {
  jest.spyOn(window, 'alert').mockImplementation(() => {})
  let finishSave
  global.fetch = jest.fn(async (url, options) => {
    if (url === '/api/reminders' && options?.method === 'POST') {
      return new Promise(resolve => { finishSave = () => resolve({ ok: true, status: 200, statusText: 'OK', json: async () => ({ id: 1, ...JSON.parse(options.body) }) }) })
    }
    return { ok: true, status: 200, statusText: 'OK', json: async () => url === '/api/inventory' ? [] : { rules: [{ startDate: '2024-01-01', shifts: ['休息'] }], version: 0 } }
  })
  await mount('拼豆')
  await click('补豆')
  await fill('选择色号', 'A1')
  const option = [...document.querySelectorAll('[role="option"]')].find(el => el.textContent.endsWith('A1'))
  await act(async () => option.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  await fill('数量', '23')
  await click('补豆')
  expect(input('数量').disabled).toBe(true)
  await click('测试后退')
  await click('补豆')
  try {
    expect(input('数量').disabled).toBe(true)
  } finally {
    await act(async () => finishSave())
  }
})
