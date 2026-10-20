import { useEffect, useState } from 'react'

function isEditable(element) {
  return element?.isContentEditable || element?.tagName === 'TEXTAREA' ||
    (element?.tagName === 'INPUT' && !['button', 'checkbox', 'radio', 'file', 'submit', 'reset'].includes(element.type))
}

export default function useKeyboardViewport() {
  const [viewport, setViewport] = useState({ keyboardOpen: false, height: null })
  useEffect(() => {
    const visual = window.visualViewport
    if (!visual) return
    let unfocusedHeight = Math.max(window.innerHeight, visual.height)
    let layoutWidth = window.innerWidth
    let frame
    function measure() {
      const editable = isEditable(document.activeElement)
      if (!editable || layoutWidth !== window.innerWidth) {
        unfocusedHeight = Math.max(window.innerHeight, visual.height, document.documentElement.clientHeight)
        layoutWidth = window.innerWidth
      }
      const offset = visual.offsetTop || 0
      const availableHeight = Math.max(0, Math.min(window.innerHeight, visual.height + offset) - offset)
      const keyboardOpen = editable && visual.scale === 1 && unfocusedHeight - visual.height > 120
      setViewport(previous => previous.keyboardOpen === Boolean(keyboardOpen) &&
        previous.height === availableHeight ? previous : {
          keyboardOpen: Boolean(keyboardOpen), height: availableHeight,
        })
    }
    function onFocusOut() {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    visual.addEventListener('resize', measure)
    visual.addEventListener('scroll', measure)
    window.addEventListener('focusin', measure)
    window.addEventListener('focusout', onFocusOut)
    window.addEventListener('resize', measure)
    measure()
    return () => {
      cancelAnimationFrame(frame)
      visual.removeEventListener('resize', measure)
      visual.removeEventListener('scroll', measure)
      window.removeEventListener('focusin', measure)
      window.removeEventListener('focusout', onFocusOut)
      window.removeEventListener('resize', measure)
    }
  }, [])
  useEffect(() => {
    if (!viewport.keyboardOpen) return
    const frame = requestAnimationFrame(() => document.activeElement?.scrollIntoView?.({ block: 'nearest' }))
    return () => cancelAnimationFrame(frame)
  }, [viewport.keyboardOpen])
  return viewport
}
