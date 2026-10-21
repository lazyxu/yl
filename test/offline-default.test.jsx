/** @jest-environment jsdom */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import OfflineOptions from '../src/garden/OfflineOptions'
import { gardenOfflineEnabled, setGardenOfflineEnabled, clearGardenOffline } from '../src/offline/data'

let originalCaches
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  originalCaches = global.caches
  global.caches = { delete: jest.fn(async () => true) }
})
afterEach(() => {
  if (originalCaches === undefined) delete global.caches
  else global.caches = originalCaches
  jest.restoreAllMocks()
})

test('新设备默认启用只读花园缓存，显式关闭的选择跨次读取仍为关闭', async () => {
  expect(localStorage.getItem('yl-garden-offline-optin-v1')).toBeNull()
  expect(gardenOfflineEnabled()).toBe(true)
  expect(await setGardenOfflineEnabled(false)).toBe(true)
  expect(localStorage.getItem('yl-garden-offline-optin-v1')).toBe('no')
  expect(gardenOfflineEnabled()).toBe(false)
  expect(caches.delete).toHaveBeenCalledWith('yl-garden-thumbs-v1')
})

test('清除缓存等于关闭保留策略，删除业务数据时可只清理不改变用户偏好', async () => {
  await clearGardenOffline(false)
  expect(gardenOfflineEnabled()).toBe(true)
  expect(localStorage.getItem('yl-garden-offline-optin-v1')).toBeNull()
  await clearGardenOffline()
  expect(gardenOfflineEnabled()).toBe(false)
  expect(localStorage.getItem('yl-garden-offline-optin-v1')).toBe('no')
})

test('离线设置界面默认勾选且不再展示隐私、容量和存储统计等长段描述', async () => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  const notify = jest.fn()
  try {
    await act(async () => root.render(<OfflineOptions items={[]} total={0}
      species={[]} query="" notify={notify}/>))
    const checkbox = host.querySelector('input[aria-label="开启花园离线浏览"]')
    expect(checkbox).not.toBeNull()
    expect(checkbox.checked).toBe(true)
    expect(host.textContent).toContain('离线缓存')
    expect(host.textContent).toContain('清除离线数据')
    for (const oldCopy of ['仅限只读：最多', '本地离线内容可能被使用此设备', '浏览器报告的本站点总存储']) {
      expect(host.textContent).not.toContain(oldCopy)
    }
    await act(async () => checkbox.click())
    expect(checkbox.checked).toBe(false)
    expect(localStorage.getItem('yl-garden-offline-optin-v1')).toBe('no')
    expect(gardenOfflineEnabled()).toBe(false)
    expect(notify).toHaveBeenCalledWith('已关闭并清除花园离线缓存')
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})
