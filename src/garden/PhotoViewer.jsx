
import React, { useEffect, useRef, useState } from 'react'
import { Box, Button, Dialog, IconButton, Stack, Typography } from '@mui/material'
import { ChevronLeft, ChevronRight, Close, DownloadOutlined, IosShareOutlined, ZoomInOutlined, ZoomOutOutlined } from '@mui/icons-material'
import { gardenPhoto } from '../gardenApi'

const distance = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)

export default function Viewer({ photos, current, onClose }) {
  const [index, setIndex] = useState(current)
  const [zoom, setZoom] = useState(1)
  const [imageError, setImageError] = useState(false)
  const [variant, setVariant] = useState('preview')
  const [retryCount, setRetryCount] = useState(0)
  const [controls, setControls] = useState(true)
  const gesture = useRef(null)
  const lastTap = useRef(0)
  const selected = photos[index]
  useEffect(() => setIndex(current), [current])
  useEffect(() => { setZoom(1); setImageError(false); setVariant('preview'); setRetryCount(0); setControls(true) }, [index])
  useEffect(() => {
    function key(event) {
      if (event.key === 'ArrowRight') { event.preventDefault(); setIndex(value => Math.min(photos.length - 1, value + 1)) }
      if (event.key === 'ArrowLeft') { event.preventDefault(); setIndex(value => Math.max(0, value - 1)) }
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [photos.length, onClose])
  if (!selected) return null
  function touchStart(event) {
    if (event.touches.length === 2) {
      gesture.current = { pinch: true, initial: distance(event.touches[0], event.touches[1]), zoom }
    } else if (event.touches.length === 1) {
      const touch = event.touches[0]
      gesture.current = { pinch: false, x: touch.clientX, y: touch.clientY,
        edge: touch.clientX <= 24 || touch.clientX >= window.innerWidth - 24 }
    }
  }
  function touchMove(event) {
    const start = gesture.current
    if (start?.pinch && event.touches.length === 2) {
      const next = start.zoom * distance(event.touches[0], event.touches[1]) / Math.max(1, start.initial)
      setZoom(Math.min(4, Math.max(1, next)))
    }
  }
  function touchEnd(event) {
    const start = gesture.current
    gesture.current = null
    if (!start || start.pinch || event.changedTouches.length !== 1) return
    const touch = event.changedTouches[0]
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (zoom === 1 && !start.edge && Math.abs(dx) > 55 && Math.abs(dy) < 60) {
      setIndex(value => Math.max(0, Math.min(photos.length - 1, value + (dx < 0 ? 1 : -1))))
      return
    }
    if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
      const now = Date.now()
      if (now - lastTap.current < 290) setZoom(value => value > 1 ? 1 : 2)
      else setControls(value => !value)
      lastTap.current = now
    }
  }
  async function share() {
    if (!navigator.share) return
    try {
      await navigator.share({
        title: selected.name,
        url: new URL(gardenPhoto(selected.id, 'original'), window.location.href).toString(),
      })
    } catch (err) {
      if (err.name !== 'AbortError') console.warn('Share failed:', err)
    }
  }
  return <Dialog open fullScreen onClose={onClose} PaperProps={{ className: 'garden-viewer', sx: {
    m: 0, width: '100%', maxWidth: 'none', height: '100dvh', borderRadius: '0 !important', color: '#fff',
  } }} aria-label="照片查看器">
    {controls && <Stack className="garden-viewer-toolbar" direction="row" alignItems="center" gap={1}>
      <IconButton onClick={onClose} aria-label="关闭" sx={{ color: '#fff' }}><Close/></IconButton>
      <Typography flex={1} textAlign="center" fontSize={14} fontWeight={650}>{index + 1} / {photos.length}</Typography>
      <IconButton aria-label={zoom > 1 ? '缩小照片' : '放大照片'} onClick={() => setZoom(value => value > 1 ? 1 : 2)}
        sx={{ color: '#fff' }}>{zoom > 1 ? <ZoomOutOutlined/> : <ZoomInOutlined/>}</IconButton>
      {typeof navigator !== 'undefined' && typeof navigator.share === 'function' &&
        <IconButton aria-label="分享照片" onClick={share} sx={{ color: '#fff' }}><IosShareOutlined/></IconButton>}
      <IconButton component="a" href={gardenPhoto(selected.id, 'original') + '?download=1'}
        aria-label="下载原图" sx={{ color: '#fff' }}><DownloadOutlined/></IconButton>
    </Stack>}
    <Box className="garden-viewer-stage" flex={1} minHeight={0}
      sx={{ touchAction: 'none' }}
      onTouchStart={touchStart} onTouchMove={touchMove} onTouchEnd={touchEnd}
      onTouchCancel={() => { gesture.current = null }}
      onDoubleClick={() => setZoom(value => value > 1 ? 1 : 2)}>
      {controls && <IconButton onClick={() => setIndex(i => Math.max(0, i - 1))}
        aria-label="上一张" disabled={index === 0}
        sx={{ position: 'absolute', left: 4, zIndex: 1, color: '#fff', display: { xs: 'none', sm: 'inline-flex' } }}>
        <ChevronLeft/>
      </IconButton>}
      {imageError ? <Stack gap={1.5} alignItems="center" textAlign="center" px={2}>
        <Typography color="#fff">无法显示照片，可能是图片格式不受当前设备支持。</Typography>
        <Button variant="outlined" sx={{ color: '#fff', borderColor: '#fff' }} onClick={() => {
          setImageError(false); setVariant('preview'); setRetryCount(value => value + 1)
        }}>重试加载</Button>
      </Stack> :
        <img className="garden-large-photo"
          src={gardenPhoto(selected.id, variant) + (retryCount ? '?retry=' + retryCount : '')}
          alt={selected.name} draggable="false"
          onError={() => { if (variant === 'preview') setVariant('original'); else setImageError(true) }}
          style={{ transform: 'scale(' + zoom + ')' }}/>}
      {controls && <IconButton onClick={() => setIndex(i => Math.min(photos.length - 1, i + 1))}
        aria-label="下一张" disabled={index === photos.length - 1}
        sx={{ position: 'absolute', right: 4, zIndex: 1, color: '#fff', display: { xs: 'none', sm: 'inline-flex' } }}>
        <ChevronRight/>
      </IconButton>}
    </Box>
    {controls && <div className="garden-viewer-footer">{selected.name}</div>}
    {!controls && <IconButton aria-label="显示照片工具栏" onClick={() => setControls(true)}
      sx={{ position: 'absolute', top: 'max(14px, env(safe-area-inset-top, 0px))', right: 12, color: '#fff' }}>
      <ZoomInOutlined/>
    </IconButton>}
  </Dialog>
}
