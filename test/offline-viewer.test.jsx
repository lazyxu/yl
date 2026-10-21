/** @jest-environment jsdom */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import Viewer from '../src/garden/PhotoViewer'
import GrowthTimeline from '../src/garden/GrowthTimeline'
import { cachedThumbnail } from '../src/offline/data'

jest.mock('../src/offline/data', () => ({
  cachedThumbnail: jest.fn(),
  rememberThumbnail: jest.fn(async () => {}),
  gardenOfflineEnabled: jest.fn(() => true),
}))

let host, root, priorOnline, makeUrl, revokeUrl
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true
  priorOnline = Object.getOwnPropertyDescriptor(navigator, 'onLine')
  makeUrl = URL.createObjectURL
  revokeUrl = URL.revokeObjectURL
  let counter = 0
  URL.createObjectURL = jest.fn(() => 'blob:offline-viewer-' + ++counter)
  URL.revokeObjectURL = jest.fn()
  cachedThumbnail.mockReset()
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  if (makeUrl) URL.createObjectURL = makeUrl
  else delete URL.createObjectURL
  if (revokeUrl) URL.revokeObjectURL = revokeUrl
  else delete URL.revokeObjectURL
  if (priorOnline) Object.defineProperty(navigator, 'onLine', priorOnline)
  else delete navigator.onLine
})

const one = [{ id: 11, name: '春花.jpg' }]
const click = async element => act(async () => element.dispatchEvent(new MouseEvent('click', { bubbles: true })))

test('离线 Viewer 仅展示获许可的缩略图，不请求/下载原图', async () => {
  cachedThumbnail.mockResolvedValue(new Blob(['thumb'], { type: 'image/png' }))
  await act(async () => root.render(<Viewer photos={one} current={0} onClose={() => {}} />))
  expect(cachedThumbnail).toHaveBeenCalledWith('/api/garden/photos/11/thumb')
  expect(document.querySelector('.garden-large-photo')?.getAttribute('src')).toBe('blob:offline-viewer-1')
  expect(document.body.textContent).toContain('仅显示本机已缓存缩略图')
  expect(document.querySelector('[aria-label="下载原图"]')).toBeNull()
  expect(document.querySelector('[aria-label="分享照片"]')).toBeNull()
  expect(document.querySelector('[aria-label="上一张"]')).not.toBeNull()
  expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
})

test('离线未缓存照片时展示离线原因，不显示不可能成功的重试和原图入口', async () => {
  cachedThumbnail.mockResolvedValue(null)
  await act(async () => root.render(<Viewer photos={one} current={0} onClose={() => {}} />))
  expect(document.body.textContent).toContain('离线且本机未保存这张照片的缩略图')
  expect(document.querySelector('.garden-large-photo')).toBeNull()
  expect(document.querySelector('[aria-label="下载原图"]')).toBeNull()
  expect([...document.querySelectorAll('button')].some(button => button.textContent.includes('重试加载'))).toBe(false)
})

test('离线照片切换后旧缓存结果不能覆盖新图，Object URL 必须释放', async () => {
  let settleFirst
  cachedThumbnail.mockImplementation(url => url.includes('/11/') ?
    new Promise(resolve => { settleFirst = resolve }) :
    Promise.resolve(new Blob(['second'], { type: 'image/png' })))
  await act(async () => root.render(<Viewer photos={[...one, { id: 12, name: '秋花.jpg' }]}
    current={0} onClose={() => {}} />))
  await click(document.querySelector('[aria-label="下一张"]'))
  expect(document.querySelector('.garden-large-photo')?.getAttribute('src')).toBe('blob:offline-viewer-1')
  await act(async () => settleFirst(new Blob(['stale'], { type: 'image/png' })))
  expect(document.querySelector('.garden-large-photo')?.getAttribute('src')).toBe('blob:offline-viewer-1')
  expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
  await act(async () => root.render(<div />))
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:offline-viewer-1')
})

test('联网预览与原图均无法显示时，回退到已缓存缩略图，不伪称格式损坏', async () => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
  cachedThumbnail.mockResolvedValue(new Blob(['thumb'], { type: 'image/png' }))
  await act(async () => root.render(<Viewer photos={one} current={0} onClose={() => {}} />))
  const pic = () => document.querySelector('.garden-large-photo')
  expect(pic().getAttribute('src')).toBe('/api/garden/photos/11/preview')
  await act(async () => pic().dispatchEvent(new Event('error')))
  expect(pic().getAttribute('src')).toBe('/api/garden/photos/11/original')
  await act(async () => pic().dispatchEvent(new Event('error')))
  expect(pic().getAttribute('src')).toBe('blob:offline-viewer-1')
  expect(document.body.textContent).toContain('仅显示本机已缓存缩略图')
  expect(document.querySelector('[aria-label="下载原图"]')).toBeNull()
})

test('只读空时间线不得误报没有成长日记，更不能提示用户离线新增', async () => {
  await act(async () => root.render(<GrowthTimeline entries={[]} photos={[]} readOnly />))
  expect(host.textContent).toContain('本机没有可查看的成长记录')
  expect(host.textContent).toContain('不代表这株花没有成长日记')
  expect(host.textContent).not.toContain('记录第一次发芽')
})
