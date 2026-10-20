/** @jest-environment jsdom */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import PhotoViewer from '../src/garden/PhotoViewer'
import GrowthTimeline from '../src/garden/GrowthTimeline'
import FlowerDetail from '../src/garden/FlowerDetail'
import EntryEditor from '../src/garden/EntryEditor'

test('拆分后的 PhotoViewer 保留多照片切换、原图下载和关闭', async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  const close = jest.fn()
  const photos = [{ id: 11, name: '第一张.jpg' }, { id: 12, name: '第二张.jpg' }]
  try {
    await act(async () => root.render(<PhotoViewer photos={photos} current={0} onClose={close} />))
    const current = () => document.querySelector('.garden-large-photo')
    expect(current()).not.toBeNull()
    expect(current().getAttribute('src')).toBe('/api/garden/photos/11/preview')
    const next = document.querySelector('[aria-label="下一张"]')
    await act(async () => next.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(current().getAttribute('src')).toBe('/api/garden/photos/12/preview')
    const download = document.querySelector('[aria-label="下载原图"]')
    expect(download.getAttribute('href')).toBe('/api/garden/photos/12/original?download=1')
    await act(async () => document.querySelector('[aria-label="关闭"]').dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(close).toHaveBeenCalledTimes(1)
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})

test('拆分后的成长时间线仍能编辑、删除和打开选中的照片', async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  const onEdit = jest.fn(), onDelete = jest.fn(), onOpenPhoto = jest.fn()
  const entry = {
    id: 1, observed_at: '2026-10-18T10:20:00Z', author_name: '家人',
    note: '第一朵开花', photos: [{ id: 11, name: '花.jpg' }],
  }
  try {
    await act(async () => root.render(<GrowthTimeline entries={[entry]} photos={entry.photos}
      onEdit={onEdit} onDelete={onDelete} onOpenPhoto={onOpenPhoto} />))
    expect(host.textContent).toContain('第一朵开花')
    expect(host.textContent).toContain('家人')
    await act(async () => host.querySelector('[aria-label="编辑日记"]').dispatchEvent(new MouseEvent('click', { bubbles: true })))
    await act(async () => host.querySelector('[aria-label="删除日记"]').dispatchEvent(new MouseEvent('click', { bubbles: true })))
    await act(async () => host.querySelector('[aria-label="查看照片：花.jpg"]').dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(onEdit).toHaveBeenCalledWith(entry)
    expect(onDelete).toHaveBeenCalledWith(entry)
    expect(onOpenPhoto).toHaveBeenCalledWith(0)
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})


test('日记照片预览在已提交布局效果中创建，移除或关闭时释放 Object URL', async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true
  const oldCreate = URL.createObjectURL
  const oldRevoke = URL.revokeObjectURL
  URL.createObjectURL = jest.fn(() => 'blob:test-preview')
  URL.revokeObjectURL = jest.fn()
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(<EntryEditor open plantId={1} editing={null}
      onClose={() => {}} onSaved={() => {}} notify={() => {}} />))
    const input = document.querySelector('input[type="file"][multiple]')
    expect(input).not.toBeNull()
    Object.defineProperty(input, 'files', {
      configurable: true, value: [new File(['safe photo'], 'flower.jpg', { type: 'image/jpeg' })],
    })
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    expect(document.querySelector('.garden-draft-image')?.getAttribute('src')).toBe('blob:test-preview')
    await act(async () => document.querySelector('[aria-label="移除照片"]').dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-preview')
    expect(document.querySelector('.garden-draft-image')).toBeNull()
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
  } finally {
    await act(async () => root.unmount())
    host.remove()
    if (oldCreate === undefined) delete URL.createObjectURL
    else URL.createObjectURL = oldCreate
    if (oldRevoke === undefined) delete URL.revokeObjectURL
    else URL.revokeObjectURL = oldRevoke
    jest.restoreAllMocks()
  }
})


test('花卉详情仅展示正序成长时间线，跨页照片仍能查看和下载', async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  const oldFetch = global.fetch
  const firstPage = Array.from({ length: 40 }, (_, index) => ({
    id: index + 1,
    observed_at: new Date(Date.UTC(2026, 8, 1 + index, 12)).toISOString(),
    note: index === 0 ? '最早的记录' : index === 39 ? '第40条记录' : '成长记录' + (index + 1),
    photos: [{ id: 1001 + index, name: 'image-' + (index + 1) + '.jpg' }],
  }))
  const lastPage = [{
    id: 41, observed_at: '2026-10-15T12:00:00Z', note: '最新的记录',
    photos: [{ id: 1041, name: 'image-41.jpg' }],
  }]
  const urls = []
  global.fetch = jest.fn(async url => {
    urls.push(url)
    if (url === '/api/garden/plants/7') {
      return { ok: true, json: async () => ({
        id: 7, name: '月季', status: 'active', photo_count: 41, latest_photo_id: 1041,
      }) }
    }
    if (url.startsWith('/api/garden/entries?')) {
      const params = new URL(url, 'http://localhost').searchParams
      expect(params.get('order')).toBe('asc')
      expect(params.get('limit')).toBe('40')
      expect(params.get('plant_id')).toBe('7')
      const offset = Number(params.get('offset') || 0)
      expect([0, 40]).toContain(offset)
      return { ok: true, json: async () => ({
        items: offset === 0 ? firstPage : lastPage, has_more: offset === 0,
      }) }
    }
    throw new Error('Unexpected request: ' + url)
  })
  try {
    await act(async () => root.render(<FlowerDetail id={7} active species={[]}
      onBack={() => {}} onChange={() => {}} onSpecies={() => {}} notify={() => {}} />))
    expect(host.textContent).toContain('成长时间线')
    expect(host.textContent).not.toContain('成长对比')
    expect(host.querySelector('[aria-label="归档或恢复"]')).toBeNull()
    expect(host.querySelector('[aria-label="删除花卉"]')).not.toBeNull()
    expect(host.querySelectorAll('[role="tab"]')).toHaveLength(0)
    expect(host.textContent.indexOf('最早的记录')).toBeLessThan(host.textContent.indexOf('第40条记录'))
    expect(host.querySelector('[aria-label="查看照片：image-1.jpg"]')).not.toBeNull()
    const more = Array.from(host.querySelectorAll('button')).find(button => button.textContent.includes('加载更多后续记录'))
    expect(more).toBeDefined()
    await act(async () => more.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(urls.some(url => url.includes('&order=asc&offset=40'))).toBe(true)
    expect(host.textContent.indexOf('第40条记录')).toBeLessThan(host.textContent.indexOf('最新的记录'))
    expect(host.textContent).not.toContain('加载更多后续记录')
    await act(async () => host.querySelector('[aria-label="查看照片：image-41.jpg"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(document.querySelector('.garden-large-photo')?.getAttribute('src')).toBe('/api/garden/photos/1041/preview')
    expect(document.querySelector('[aria-label="下载原图"]')?.getAttribute('href'))
      .toBe('/api/garden/photos/1041/original?download=1')
    await act(async () => document.querySelector('[aria-label="关闭"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true })))
  } finally {
    await act(async () => root.unmount())
    host.remove()
    global.fetch = oldFetch
  }
})
