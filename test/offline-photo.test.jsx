/** @jest-environment jsdom */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import OfflinePhoto from '../src/offline/OfflinePhoto'
import { cachedThumbnail, rememberThumbnail, gardenOfflineEnabled } from '../src/offline/data'

jest.mock('../src/offline/data', () => ({
  cachedThumbnail: jest.fn(),
  rememberThumbnail: jest.fn(() => Promise.resolve()),
  gardenOfflineEnabled: jest.fn(() => true),
}))

let root, host, originalCreate, originalRevoke, originalOnline
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true
  originalCreate = URL.createObjectURL
  originalRevoke = URL.revokeObjectURL
  originalOnline = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine')
  let counter = 0
  URL.createObjectURL = jest.fn(() => 'blob:local-photo-' + ++counter)
  URL.revokeObjectURL = jest.fn()
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
  gardenOfflineEnabled.mockReturnValue(true)
  cachedThumbnail.mockReset()
  rememberThumbnail.mockClear()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  if (originalCreate) URL.createObjectURL = originalCreate
  else delete URL.createObjectURL
  if (originalRevoke) URL.revokeObjectURL = originalRevoke
  else delete URL.revokeObjectURL
  if (originalOnline) Object.defineProperty(Navigator.prototype, 'onLine', originalOnline)
  delete navigator.onLine
  jest.restoreAllMocks()
})

test('已失效缩略图请求不可覆盖后来展示的照片，Object URL 均被释放', async () => {
  let resolveOld
  cachedThumbnail.mockImplementation(url =>
    url.endsWith('/1/thumb') ? new Promise(resolve => { resolveOld = resolve }) :
      Promise.resolve(new Blob(['new'], { type: 'image/png' })))
  await act(async () => root.render(<OfflinePhoto src="/api/garden/photos/1/thumb" alt="第一张"/>))
  await act(async () => root.render(<OfflinePhoto src="/api/garden/photos/2/thumb" alt="第二张"/>))
  expect(host.querySelector('img').getAttribute('src')).toBe('blob:local-photo-1')
  await act(async () => resolveOld(new Blob(['old'], { type: 'image/png' })))
  expect(host.querySelector('img').getAttribute('src')).toBe('blob:local-photo-1')
  expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
  await act(async () => root.render(<div/>))
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-photo-1')
})

test('重试查询参数不改变已获许可的离线缩略图缓存键', async () => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
  cachedThumbnail.mockResolvedValue(new Blob(['cached'], { type: 'image/png' }))
  const onError = jest.fn()
  await act(async () => root.render(<OfflinePhoto src="/api/garden/photos/5/thumb?retry=3" alt="图像" onError={onError}/>))
  await act(async () => host.querySelector('img').dispatchEvent(new Event('load')))
  expect(rememberThumbnail).toHaveBeenCalledWith('/api/garden/photos/5/thumb')
  await act(async () => host.querySelector('img').dispatchEvent(new Event('error')))
  expect(cachedThumbnail).toHaveBeenCalledWith('/api/garden/photos/5/thumb')
  expect(host.querySelector('img').getAttribute('src')).toBe('blob:local-photo-1')
  expect(onError).not.toHaveBeenCalled()
})

test('卸载后的异步缓存结果不得产生孤儿 Object URL', async () => {
  let resolveCache
  cachedThumbnail.mockImplementation(() => new Promise(resolve => { resolveCache = resolve }))
  await act(async () => root.render(<OfflinePhoto src="/api/garden/photos/7/thumb" alt="旧图"/>))
  await act(async () => root.render(<div/>))
  await act(async () => resolveCache(new Blob(['stale'], { type: 'image/png' })))
  expect(URL.createObjectURL).not.toHaveBeenCalled()
})
