import React, { useEffect, useRef, useState } from 'react'
import { cachedThumbnail, rememberThumbnail, gardenOfflineEnabled } from './data'

// Only previously viewed /thumb images can be rendered offline; originals
// never enter Cache Storage. Object URLs are revoked on source changes/unmount.
export default function OfflinePhoto({ src, alt, onError, ...props }) {
  const [local, setLocal] = useState('')
  const localRef = useRef('')
  useEffect(() => {
    let alive = true
    setLocal('')
    if (localRef.current) URL.revokeObjectURL(localRef.current)
    localRef.current = ''
    if (gardenOfflineEnabled() && typeof navigator !== 'undefined' && !navigator.onLine) {
      cachedThumbnail(src).then(blob => {
        if (!alive || !blob) return
        const url = URL.createObjectURL(blob)
        localRef.current = url
        setLocal(url)
      })
    }
    return () => {
      alive = false
      if (localRef.current) URL.revokeObjectURL(localRef.current)
      localRef.current = ''
    }
  }, [src])

  async function fail() {
    if (local) { onError?.(); return }
    const blob = await cachedThumbnail(src)
    if (!blob) { onError?.(); return }
    const url = URL.createObjectURL(blob)
    if (localRef.current) URL.revokeObjectURL(localRef.current)
    localRef.current = url
    setLocal(url)
  }
  return <img {...props} src={local || src} alt={alt}
    onLoad={() => { if (!local) rememberThumbnail(src).catch(() => {}) }}
    onError={fail}/>
}
