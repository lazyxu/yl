/** @jest-environment jsdom */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import PhotoViewer from '../src/garden/PhotoViewer'
import GrowthTimeline from '../src/garden/GrowthTimeline'

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
