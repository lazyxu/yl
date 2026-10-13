import React, { useEffect, useRef, useState } from 'react'
import { IconButton } from '@mui/material'
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { shiftNames, shiftStyle } from './shifts'

export default function SortableShiftDays({ days, onChange, disabled }) {
  const list = useRef(null)
  const latest = useRef({ days, onChange })
  latest.current = { days, onChange }
  const drag = useRef(null)
  const startDrag = useRef(null)
  const [dragging, setDragging] = useState(null)

  useEffect(() => {
    function moveTo(targetId) {
      const current = drag.current
      const { days: items, onChange: change } = latest.current
      const source = items.findIndex(item => item.id === current.id)
      const target = items.findIndex(item => item.id === targetId)
      if (source < 0 || target < 0 || source === target) return
      const next = [...items]
      next.splice(target, 0, next.splice(source, 1)[0])
      change(next)
    }
    function reorderAtPointer() {
      const current = drag.current
      if (!current?.active || !list.current) return
      const rows = [...list.current.querySelectorAll('[data-sort-id]')]
      const nearest = rows.reduce((best, row) => {
        const rect = row.getBoundingClientRect()
        const distance = Math.abs(current.y - (rect.top + rect.height / 2))
        return !best || distance < best.distance ? { id: Number(row.dataset.sortId), distance } : best
      }, null)
      if (nearest) moveTo(nearest.id)
    }
    function stop(event, cancelled = false) {
      const current = drag.current
      if (!current || (event && event.pointerId !== current.pointerId)) return
      clearTimeout(current.timer); cancelAnimationFrame(current.frame)
      if (cancelled && current.active) {
        const { days: items, onChange: change } = latest.current
        change([...items].sort((a, b) => current.order.indexOf(a.id) - current.order.indexOf(b.id)))
      }
      drag.current = null; setDragging(null)
    }
    function move(event) {
      const current = drag.current
      if (!current || event.pointerId !== current.pointerId) return
      if (!current.active) {
        if (Math.hypot(event.clientX - current.x, event.clientY - current.y) > 8) stop(event)
        return
      }
      event.preventDefault(); current.y = event.clientY
      reorderAtPointer()
    }
    function scrollFrame() {
      const current = drag.current
      if (!current?.active) return
      const scroll = list.current?.closest('.MuiDialogContent-root')
      if (scroll) {
        const rect = scroll.getBoundingClientRect()
        const delta = current.y < rect.top + 48 ? -12 : current.y > rect.bottom - 48 ? 12 : 0
        if (delta) { scroll.scrollTop += delta; reorderAtPointer() }
      }
      current.frame = requestAnimationFrame(scrollFrame)
    }
    startDrag.current = (event, id) => {
      if (event.button !== 0 || event.isPrimary === false) return
      stop()
      event.preventDefault()
      event.currentTarget.setPointerCapture?.(event.pointerId)
      const current = { id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, active: false, order: latest.current.days.map(item => item.id) }
      drag.current = current
      current.timer = setTimeout(() => {
        if (drag.current !== current) return
        current.active = true; setDragging(id)
        current.frame = requestAnimationFrame(scrollFrame)
      }, 400)
    }
    const up = event => stop(event)
    const cancel = event => stop(event, true)
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    return () => {
      const current = drag.current
      if (current) { clearTimeout(current.timer); cancelAnimationFrame(current.frame) }
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel)
      drag.current = null
    }
  }, [])

  function keyboardMove(event, index) {
    if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key) || disabled) return
    event.preventDefault()
    const target = index + (event.key === 'ArrowUp' ? -1 : 1)
    if (target < 0 || target >= days.length) return
    const next = [...days]; next.splice(target, 0, next.splice(index, 1)[0]); onChange(next)
  }

  return <div ref={list} className="shift-sort-days" role="list" aria-label="循环班次顺序">
    {days.map((day, index) => <div className={`shift-sort-day ${dragging === day.id ? 'shift-day-dragging' : ''}`} role="listitem" key={day.id} data-sort-id={day.id}>
      <IconButton className="shift-drag-handle" aria-label={`长按拖动第${index + 1}天`} disabled={disabled} onPointerDown={event => { if (!disabled) startDrag.current?.(event, day.id) }} onKeyDown={event => keyboardMove(event, index)} onContextMenu={event => event.preventDefault()}><DragIndicatorIcon /></IconButton>
      <label><span>第 {index + 1} 天</span><select aria-label={`第${index + 1}天班次`} value={day.shift} style={shiftStyle(day.shift)} disabled={disabled || dragging !== null} onChange={event => onChange(days.map(item => item.id === day.id ? { ...item, shift: event.target.value } : item))}>{shiftNames.map(shift => <option key={shift}>{shift}</option>)}</select></label>
      <IconButton aria-label={`移除第${index + 1}天`} disabled={disabled || dragging !== null || days.length === 1} onClick={() => onChange(days.filter(item => item.id !== day.id))}><DeleteOutlineIcon fontSize="small" /></IconButton>
    </div>)}
  </div>
}
