import React, { useCallback, useEffect, useRef, useState } from 'react'
import { cachedThumbnail, rememberThumbnail, gardenOfflineEnabled } from './data'

// A retry query changes the network request, not the identity of a consented
// thumbnail in Cache Storage. Other API responses must never be cached here.
const cacheKey = source => /^\/api\/garden\/photos\/\d+\/thumb(?:\?.*)?$/.test(source || '')
  ? source.split('?')[0] : source

export default function OfflinePhoto({ src, alt, onError, ...props }) {
  const [local, setLocal] = useState('')
  const localRef = useRef('')
  const generation = useRef(0)
  const pendingFailure = useRef(0)

  const replaceObjectURL = useCallback(blob => {
    const next = URL.createObjectURL(blob)
    if (localRef.current) URL.revokeObjectURL(localRef.current)
    localRef.current = next
    setLocal(next)
  }, [])

  useEffect(() => {
    const current = ++generation.current
    pendingFailure.current = 0
    setLocal('')
    if (localRef.current) URL.revokeObjectURL(localRef.current)
    localRef.current = ''
    if (gardenOfflineEnabled() && typeof navigator !== 'undefined' && !navigator.onLine) {
      cachedThumbnail(cacheKey(src)).then(blob => {
        if (generation.current !== current || !blob) return
        replaceObjectURL(blob)
      }).catch(() => {})
    }
    return () => {
      generation.current++
      if (localRef.current) URL.revokeObjectURL(localRef.current)
      localRef.current = ''
    }
  }, [src, replaceObjectURL])

  async function fail() {
    if (local) { onError?.(); return }
    const current = generation.current
    if (pendingFailure.current === current) return
    pendingFailure.current = current
    let blob = null
    try { blob = await cachedThumbnail(cacheKey(src)) } catch { /* no consented cache */ }
    if (generation.current !== current) return
    pendingFailure.current = 0
    if (!blob) { onError?.(); return }
    replaceObjectURL(blob)
  }

  return <img {...props} src={local || src} alt={alt}
    onLoad={() => { if (!local) rememberThumbnail(cacheKey(src)).catch(() => {}) }}
    onError={fail}/>
}
