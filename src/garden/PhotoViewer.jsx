import React, { useEffect, useRef, useState } from 'react'
import { Box, Button, CircularProgress, Dialog, IconButton, Stack, Typography } from '@mui/material'
import { ChevronLeft, ChevronRight, Close, DownloadOutlined, IosShareOutlined,
  ZoomInOutlined, ZoomOutOutlined, EyeOutlined } from '@mui/icons-material'
import { gardenPhoto } from '../gardenApi'

const distance = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
const midpoint = (a, b) => ({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 })
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

export default function Viewer({ photos, current, onClose }) {
  const [index, setIndex] = useState(current)
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 })
  const [imageError, setImageError] = useState(false)
  const [imageLoading, setImageLoading] = useState(true)
  const [variant, setVariant] = useState('preview')
  const [retryCount, setRetryCount] = useState(0)
  const [controls, setControls] = useState(true)
  const [shareBusy, setShareBusy] = useState(false)
  const [shareError, setShareError] = useState('')
  const stage = useRef(null)
  const gesture = useRef(null)
  const pendingTransform = useRef({ scale: 1, x: 0, y: 0 })
  const frame = useRef(0)
  const lastTap = useRef(0)
  const selected = photos[index]

  function bounded(view) {
    const bounds = stage.current?.getBoundingClientRect()
    const scale = clamp(view.scale, 1, 4)
    const maxX = Math.max(0, (scale - 1) * (bounds?.width || 0) / 2)
    const maxY = Math.max(0, (scale - 1) * (bounds?.height || 0) / 2)
    return { scale, x: clamp(view.x, -maxX, maxX), y: clamp(view.y, -maxY, maxY) }
  }
  function queueTransform(view) {
    pendingTransform.current = bounded(view)
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      setTransform(pendingTransform.current)
    })
  }
  function zoomTo(scale) {
    const value = bounded({ scale, x: scale <= 1 ? 0 : transform.x, y: scale <= 1 ? 0 : transform.y })
    pendingTransform.current = value
    setTransform(value)
  }
  useEffect(() => () => cancelAnimationFrame(frame.current), [])
  useEffect(() => setIndex(current), [current])
  useEffect(() => {
    const identity = { scale: 1, x: 0, y: 0 }
    pendingTransform.current = identity
    setTransform(identity)
    setImageError(false)
    setVariant('preview')
    setRetryCount(0)
    setImageLoading(true)
    setShareError('')
    setControls(true)
    gesture.current = null
  }, [index])
  useEffect(() => {
    function key(event) {
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        if (transform.scale > 1) zoomTo(1)
        setIndex(value => Math.min(photos.length - 1, value + 1))
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        if (transform.scale > 1) zoomTo(1)
        setIndex(value => Math.max(0, value - 1))
      }
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [photos.length, onClose, transform.scale])

  if (!selected) return null
  function touchStart(event) {
    if (event.touches.length === 2) {
      const center = midpoint(event.touches[0], event.touches[1])
      gesture.current = { mode: 'pinch', distance: distance(event.touches[0], event.touches[1]),
        center, view: { ...pendingTransform.current } }
    } else if (event.touches.length === 1) {
      const touch = event.touches[0]
      gesture.current = {
        mode: pendingTransform.current.scale > 1 ? 'pan' : 'swipe',
        x: touch.clientX, y: touch.clientY, view: { ...pendingTransform.current },
        edge: touch.clientX <= 24 || touch.clientX >= window.innerWidth - 24,
      }
    }
  }
  function touchMove(event) {
    const start = gesture.current
    if (!start) return
    if (start.mode === 'pinch' && event.touches.length === 2) {
      const center = midpoint(event.touches[0], event.touches[1])
      const scale = start.view.scale * distance(event.touches[0], event.touches[1]) / Math.max(1, start.distance)
      queueTransform({
        scale,
        x: start.view.x + center.x - start.center.x,
        y: start.view.y + center.y - start.center.y,
      })
    } else if (start.mode === 'pan' && event.touches.length === 1) {
      const touch = event.touches[0]
      queueTransform({ scale: start.view.scale,
        x: start.view.x + touch.clientX - start.x,
        y: start.view.y + touch.clientY - start.y })
    }
  }
  function touchEnd(event) {
    const start = gesture.current
    gesture.current = null
    if (!start || start.mode === 'pinch' || event.changedTouches.length !== 1) return
    const touch = event.changedTouches[0]
    const dx = touch.clientX - start.x, dy = touch.clientY - start.y
    if (start.mode === 'swipe' && !start.edge && Math.abs(dx) > 55 && Math.abs(dy) < 60) {
      setIndex(value => clamp(value + (dx < 0 ? 1 : -1), 0, photos.length - 1))
      return
    }
    if (start.mode === 'swipe' && Math.abs(dx) < 12 && Math.abs(dy) < 12) {
      const now = Date.now()
      if (now - lastTap.current < 290) zoomTo(transform.scale > 1 ? 1 : 2)
      else setControls(value => !value)
      lastTap.current = now
    }
  }

  async function share() {
    if (!navigator.share || shareBusy) return
    setShareBusy(true)
    setShareError('')
    try {
      // Prefer the actual photograph (as in iOS Photos), never assume a
      // private original URL is an externally usable sharing link.
      const response = await fetch(gardenPhoto(selected.id, 'original'), { cache: 'no-store' })
      if (!response.ok) throw new Error('无法读取原图')
      const blob = await response.blob()
      const type = blob.type || 'image/jpeg'
      const name = selected.name || ('garden-' + selected.id + '.jpg')
      const file = new File([blob], name, { type })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: selected.name || '花园照片', files: [file] })
      } else {
        // The fallback shares a URL, and is explicitly identified as such.
        await navigator.share({ title: selected.name || '花园照片',
          url: new URL(gardenPhoto(selected.id, 'original'), window.location.href).toString() })
        setShareError('设备不支持直接分享图片文件，已分享原图链接。')
      }
    } catch (error) {
      if (error.name !== 'AbortError') setShareError(error.message || '分享失败，请重试')
    } finally { setShareBusy(false) }
  }
  const go = step => setIndex(value => clamp(value + step, 0, photos.length - 1))

  return <Dialog open fullScreen onClose={onClose} PaperProps={{ className: 'garden-viewer', sx: {
    m: 0, width: '100%', maxWidth: 'none', height: '100dvh', borderRadius: '0 !important', color: '#fff',
  } }} aria-label="照片查看器">
    {controls && <Stack className="garden-viewer-toolbar" direction="row" alignItems="center" gap={0.5}>
      <IconButton onClick={onClose} aria-label="关闭" sx={{ color: '#fff' }}><Close/></IconButton>
      <Typography flex={1} textAlign="center" fontSize={14} fontWeight={650}>{index + 1} / {photos.length}</Typography>
      <IconButton aria-label={transform.scale > 1 ? '缩小照片' : '放大照片'} onClick={() => zoomTo(transform.scale > 1 ? 1 : 2)}
        sx={{ color: '#fff' }}>{transform.scale > 1 ? <ZoomOutOutlined/> : <ZoomInOutlined/>}</IconButton>
      {typeof navigator !== 'undefined' && typeof navigator.share === 'function' &&
        <IconButton aria-label="分享照片" disabled={shareBusy} onClick={share} sx={{ color: '#fff' }}>
          {shareBusy ? <CircularProgress size={20} sx={{ color: '#fff' }}/> : <IosShareOutlined/>}
        </IconButton>}
      <IconButton component="a" href={gardenPhoto(selected.id, 'original') + '?download=1'}
        aria-label="下载原图" sx={{ color: '#fff' }}><DownloadOutlined/></IconButton>
    </Stack>}
    {shareError && <Typography color="#f5dcd8" textAlign="center" role="status" fontSize={12} px={2}>{shareError}</Typography>}
    <Box className="garden-viewer-stage" ref={stage} flex={1} minHeight={0}
      sx={{ touchAction: 'none' }}
      onTouchStart={touchStart} onTouchMove={touchMove} onTouchEnd={touchEnd}
      onTouchCancel={() => { gesture.current = null }}
      onDoubleClick={() => zoomTo(transform.scale > 1 ? 1 : 2)}>
      {controls && <IconButton onClick={() => go(-1)}
        aria-label="上一张" disabled={index === 0}
        sx={{ position: 'absolute', left: 4, zIndex: 2, color: '#fff',
          background: '#0008', '&.Mui-disabled': { color: '#999' } }}>
        <ChevronLeft/>
      </IconButton>}
      {imageError ? <Stack gap={1.5} alignItems="center" textAlign="center" px={2}>
        <Typography color="#fff">无法显示照片，可能是图片格式不受当前设备支持。</Typography>
        <Button variant="outlined" sx={{ color: '#fff', borderColor: '#fff' }} onClick={() => {
          setImageError(false); setImageLoading(true); setVariant('preview'); setRetryCount(value => value + 1)
        }}>重试加载</Button>
      </Stack> : <>
        {imageLoading && <Stack gap={1} alignItems="center" sx={{ position: 'absolute', zIndex: 1, pointerEvents: 'none' }} role="status">
          <CircularProgress size={28} sx={{ color: '#fff' }}/>
          <Typography color="#fff" fontSize={12}>{variant === 'preview' ? '正在加载照片…' : '正在加载原图…'}</Typography>
        </Stack>}
        <img className="garden-large-photo"
          src={gardenPhoto(selected.id, variant) + (retryCount ? '?retry=' + retryCount : '')}
          alt={selected.name} draggable="false"
          onLoad={() => setImageLoading(false)}
          onError={() => { if (variant === 'preview') {
            setVariant('original'); setImageLoading(true)
          } else { setImageLoading(false); setImageError(true) } }}
          style={{ transform: 'translate3d(' + transform.x + 'px,' + transform.y + 'px,0) scale(' + transform.scale + ')',
            transformOrigin: 'center center' }}/>
      </>}
      {controls && <IconButton onClick={() => go(1)}
        aria-label="下一张" disabled={index === photos.length - 1}
        sx={{ position: 'absolute', right: 4, zIndex: 2, color: '#fff',
          background: '#0008', '&.Mui-disabled': { color: '#999' } }}>
        <ChevronRight/>
      </IconButton>}
    </Box>
    {controls && <div className="garden-viewer-footer">{selected.name}</div>}
    {!controls && <IconButton aria-label="显示照片工具栏" onClick={() => setControls(true)}
      sx={{ position: 'absolute', top: 'max(14px, env(safe-area-inset-top, 0px))', right: 12, color: '#fff', zIndex: 2 }}>
      <EyeOutlined/>
    </IconButton>}
  </Dialog>
}
