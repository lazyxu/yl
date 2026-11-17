/** @jest-environment jsdom */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import History from '../src/History'

jest.setTimeout(30000)

const originalFetch = global.fetch
let host, root
const historyRows = [
  {
    id: 21, operation: '补豆', occurred_at: '2026-11-17T06:00:00.000Z',
    note: '只在详情里看到这条备注', image_path: 'legacy.jpg',
    items: [{ color: 'A1', count: 60 }, { color: 'A2', count: 40 }],
  },
  {
    id: 20, operation: '消耗', occurred_at: '2026-11-16T06:00:00.000Z',
    note: '', image_path: null, items: [{ color: 'A1', count: 20 }],
  },
]

function response(data, ok = true) {
  return { ok, json: async () => data }
}

async function mount() {
  await act(async () => { root.render(<History />) })
}

async function click(element) {
  expect(element).not.toBeNull()
  await act(async () => element.dispatchEvent(new MouseEvent('click', { bubbles: true })))
}

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  global.fetch = jest.fn(async url => {
    if (url === '/api/reminders') return response(historyRows)
    if (url === '/api/reminders/summary') return response({ added: 1250, consumed: 820 })
    return response({})
  })
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  global.fetch = originalFetch
  jest.restoreAllMocks()
})

test('compact history shows all-history totals but hides notes, details and destructive buttons', async () => {
  await mount()
  expect(host.querySelector('.pindou-history-totals').textContent).toContain('1,250')
  expect(host.querySelector('.pindou-history-totals').textContent).toContain('820')
  const cards = host.querySelectorAll('.pindou-history-card')
  expect(cards).toHaveLength(2)
  expect(cards[0].textContent).toContain('补豆 · 100 颗')
  expect(cards[1].textContent).toContain('消耗 · 20 颗')
  expect(cards[0].textContent).not.toContain(historyRows[0].note)
  expect(cards[0].querySelector('.pindou-history-details')).toBeNull()
  expect(cards[0].querySelector('[aria-label="编辑记录"]')).toBeNull()
  expect(cards[0].querySelector('[aria-label="删除记录"]')).toBeNull()
  expect(cards[0].querySelector('.pindou-history-thumbnail img').getAttribute('src'))
    .toBe('/api/upload/legacy.jpg/thumb')
  expect(global.fetch.mock.calls.filter(([url]) => url === '/api/reminders/summary')).toHaveLength(1)

  await click(cards[0].querySelector('[aria-label="查看记录图片"]'))
  const viewer = document.querySelector('[role="dialog"][aria-labelledby="pindou-history-image-title"]')
  expect(viewer.querySelector('img[alt="历史记录原图"]').getAttribute('src'))
    .toBe('/api/upload/legacy.jpg')
  expect(cards[0].querySelector('.pindou-history-details')).toBeNull()
  await click(viewer.querySelector('button'))

  await click(cards[0].querySelector('[aria-label="展开记录 21"]'))
  expect(cards[0].querySelector('[aria-expanded="true"]')).not.toBeNull()
  expect(cards[0].textContent).toContain(historyRows[0].note)
  expect(cards[0].querySelector('[aria-label="A1，60 颗"]')).not.toBeNull()
  expect(cards[0].querySelector('[aria-label="编辑记录"]')).not.toBeNull()
  expect(cards[0].querySelector('[aria-label="删除记录"]')).not.toBeNull()
  await click(cards[0].querySelector('[aria-label="收起记录 21"]'))
  expect(cards[0].textContent).not.toContain(historyRows[0].note)
})

test('successful delete refreshes all-time totals without scanning the list on the client', async () => {
  let summaryRequests = 0
  global.fetch = jest.fn(async (url, options) => {
    if (url === '/api/reminders') return response(historyRows)
    if (url === '/api/reminders/summary') {
      summaryRequests += 1
      return response(summaryRequests === 1 ? { added: 1250, consumed: 820 } : { added: 1150, consumed: 820 })
    }
    if (url === '/api/reminders/21' && options?.method === 'DELETE') return response({ success: true })
    throw new Error('unexpected request ' + url)
  })
  await mount()
  const card = host.querySelector('.pindou-history-card')
  await click(card.querySelector('[aria-label="展开记录 21"]'))
  await click(card.querySelector('[aria-label="删除记录"]'))
  const dialog = document.querySelector('[role="dialog"][aria-labelledby="pindou-delete-title"]')
  expect(dialog).not.toBeNull()
  const confirm = [...dialog.querySelectorAll('button')].find(el => el.textContent.includes('确认删除'))
  await click(confirm)
  expect(host.querySelectorAll('.pindou-history-card')).toHaveLength(1)
  expect(host.querySelector('.pindou-history-totals').textContent).toContain('1,150')
  expect(summaryRequests).toBe(2)
})

test('summary failure never silently substitutes the newest 200 rows for all-history totals', async () => {
  global.fetch = jest.fn(async url => url === '/api/reminders'
    ? response(historyRows) : response({ error: 'unavailable' }, false))
  await mount()
  expect(host.querySelectorAll('.pindou-history-card')).toHaveLength(2)
  expect(host.querySelector('.pindou-history-totals')).toBeNull()
  expect(host.textContent).toContain('历史累计统计暂不可用')
})


test('failed revalidation hides previously successful totals rather than displaying outdated numbers', async () => {
  let summaryRequests = 0
  global.fetch = jest.fn(async url => {
    if (url === '/api/reminders') return response(historyRows)
    if (url === '/api/reminders/summary') {
      summaryRequests += 1
      return summaryRequests === 1 ? response({ added: 1250, consumed: 820 }) :
        response({ error: 'transient failure' }, false)
    }
    throw new Error('unexpected request: ' + url)
  })
  await mount()
  expect(host.querySelector('.pindou-history-totals').textContent).toContain('1,250')
  await act(async () => root.render(<History refreshKey={1} />))
  expect(summaryRequests).toBe(2)
  expect(host.querySelector('.pindou-history-totals')).toBeNull()
  expect(host.textContent).toContain('历史累计统计暂不可用')
  expect(host.querySelectorAll('.pindou-history-card')).toHaveLength(2)
})
