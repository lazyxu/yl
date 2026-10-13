import React, { useEffect, useRef } from 'react'

export default function CalendarDay({ onSelect, onAdjust, canAdjust, children, ...props }) {
  const press = useRef(null)
  const suppressClick = useRef(false)
  function cancel() { if (press.current) clearTimeout(press.current.timer); press.current = null }
  useEffect(() => cancel, [])
  useEffect(() => { if (!canAdjust) cancel() }, [canAdjust])
  function start(event) {
    cancel(); suppressClick.current = false
    if (!canAdjust || event.button !== 0 || event.isPrimary === false) return
    const current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId }
    current.timer = setTimeout(() => { suppressClick.current = true; press.current = null; onAdjust() }, 550)
    press.current = current
  }
  return <button type="button" {...props} onPointerDown={start} onPointerMove={event => {
    const current = press.current
    if (current && (event.pointerId !== current.pointerId || Math.hypot(event.clientX - current.x, event.clientY - current.y) > 10)) cancel()
  }} onPointerUp={cancel} onPointerCancel={cancel} onPointerLeave={cancel} onContextMenu={event => event.preventDefault()}
    onClick={event => { if (suppressClick.current) { suppressClick.current = false; event.preventDefault() } else onSelect() }}>
    {children}
  </button>
}
