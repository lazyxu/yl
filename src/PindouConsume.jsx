import React, { useMemo, useState, useEffect, useRef } from 'react'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import ColorCodeSelect from './ColorCodeSelect'
 
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
// use dynamic import for tesseract to handle different bundler export shapes
import MARD from './colorPalettes/mard.json'
import { findPalette } from './palette'
import InventoryGrid from './InventoryGrid'
 


export default function PindouConsume({ initialOperation = '消耗', draft, loading = false, onDraftChange, onBusyChange, onClose = ()=>{}, onAdded = ()=>{} }){
  const { itemsMap, selectedCodes, applyCount, note, imgFile } = draft
  function updateField(field, value) {
    onDraftChange(current => ({ ...current, [field]: typeof value === 'function' ? value(current[field]) : value }))
  }
  const setItemsMap = value => updateField('itemsMap', value)
  const setSelectedCodes = value => updateField('selectedCodes', value)
  const setApplyCount = value => updateField('applyCount', value)
  const setNote = value => updateField('note', value)
  const setImgFile = value => updateField('imgFile', value)
  const setLoading = onBusyChange
  const submitting = useRef(false)
  const [imgPreview, setImgPreview] = useState(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [viewerSrc, setViewerSrc] = useState(null)
  const [formMessage, setFormMessage] = useState('')
  const filePicker = useRef(null)
  const [serverReachable, setServerReachable] = useState(() => navigator.onLine ? null : false)
  const [checkKey, setCheckKey] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    const recheck = async () => {
      if (!navigator.onLine) { setServerReachable(false); return }
      setServerReachable(null)
      try {
        const response = await fetch('/api/inventory', { signal: controller.signal, cache: 'no-store' })
        if (!controller.signal.aborted) setServerReachable(response.ok)
      } catch {
        if (!controller.signal.aborted) setServerReachable(false)
      }
    }
    const offline = () => { controller.abort(); setServerReachable(false) }
    const online = () => setCheckKey(value => value + 1)
    window.addEventListener('offline', offline)
    window.addEventListener('online', online)
    recheck()
    return () => {
      controller.abort()
      window.removeEventListener('offline', offline)
      window.removeEventListener('online', online)
    }
  }, [checkKey])
  const hasDraft = selectedCodes.length > 0 || applyCount !== '' || note !== '' || imgFile || Object.values(itemsMap).some(count => count > 0)

  const allCodes = useMemo(()=>{
    const set = new Set(MARD.map(p=>p.code))
    Object.keys(itemsMap).forEach(k=>set.add(k))
    return Array.from(set)
  }, [itemsMap])

  const handleSelectChange = (e, value) => {
    setSelectedCodes(value)
    setItemsMap(prev => {
      const next = { ...prev }
      value.forEach(code => { if (!(code in next)) next[code] = 0 })
      return next
    })
  }

  const canApplyToSelected = useMemo(() => {
    if (!selectedCodes || selectedCodes.length === 0) return false
    if (applyCount === '' || applyCount == null) return false
    const n = Number(applyCount)
    return Number.isInteger(n) && n > 0
  }, [selectedCodes, applyCount])

  // A manually entered per-color count is enough to submit, even when the
  // optional bulk count field has not been filled in.
  const canSubmit = canApplyToSelected || Object.values(itemsMap).some(value =>
    Number.isSafeInteger(Number(value)) && Number(value) > 0)
  const grouped = useMemo(() => {
    const map = new Map()
    allCodes.forEach(code => {
      const key = (code || '').charAt(0).toUpperCase() || '#'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push({ color: code, count: Number(itemsMap[code] || 0) })
    })
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [allCodes, itemsMap])

  function applyToSelected(){
    const n = Number(applyCount)
    if (!Number.isInteger(n) || n <= 0) { setFormMessage('请输入正整数数量'); return }
    setItemsMap(prev => {
      const next = { ...prev }
      selectedCodes.forEach(code => { next[code] = n })
      return next
    })
  }

  async function handleSubmit(){
    if (loading || submitting.current || !canSubmit || serverReachable !== true) return
    // 如果有填写“应用到所选”的数量，则先在提交数据中应用该数量（但不依赖 setState 异步）
    let submitMap = { ...itemsMap }
    if (canApplyToSelected) {
      const n = Number(applyCount)
      selectedCodes.forEach(code => { submitMap[code] = n })
      // 也同步更新组件状态以反映 UI
      setItemsMap(prev => {
        const next = { ...prev }
        selectedCodes.forEach(code => { next[code] = n })
        return next
      })
    }

    const items = Object.entries(submitMap).filter(([, cnt]) => Number.isSafeInteger(Number(cnt)) && Number(cnt) > 0).map(([color, cnt]) => ({ color, count: Number(cnt) }))
    if (items.length === 0) { setFormMessage('请先输入要' + initialOperation + '的数量'); return }
    submitting.current = true
    setFormMessage('')
    setLoading(true)
    try{
      // 优先使用用户选择的文件上传为提交图片
      let imagePath = null
      if (imgFile) {
        const form = new FormData()
        form.append('image', imgFile)
        const up = await fetch('/api/upload', { method: 'POST', body: form })
        const uj = await up.json().catch(() => ({}))
        if (!up.ok || !uj.ok || !uj.filename) {
          throw new Error(uj.error || '图片上传失败，请重试；已保留本次草稿')
        }
        imagePath = uj.filename
      }

      const body = { operation: initialOperation, items, occurred_at: new Date().toISOString(), note, image_path: imagePath }
      const res = await fetch('/api/reminders', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error((await res.json()).error || res.statusText)
      const data = await res.json()
      onAdded(data)
    }catch(err){
      console.error(err)
      setFormMessage('保存失败：' + (err.message || '网络暂不可用，请重试'))
    }finally{
      submitting.current = false
      setLoading(false)
    }
  }

  

  // 选择文件时：本地预览并上传到后端（FormData）
  function handleFileChange(file){
    if (!file) return
    setPreviewOpen(false)
    setImgFile(file)
  }

  // The form displays a real, bounded thumbnail rather than decoding an
  // original blob as a small <img>. Keep the original URL only while the
  // explicit full-image dialog is open, and release both URLs on cleanup.
  useEffect(() => {
    setImgPreview(null)
    if (!imgFile) return
    let cancelled = false
    let thumbnailUrl = null
    const originalUrl = URL.createObjectURL(imgFile)
    let releasedOriginal = false
    const releaseOriginal = () => {
      if (releasedOriginal) return
      releasedOriginal = true
      URL.revokeObjectURL(originalUrl)
    }
    const image = new Image()
    image.onload = () => {
      try {
        const width = image.naturalWidth || image.width
        const height = image.naturalHeight || image.height
        if (!width || !height) { releaseOriginal(); return }
        const scale = Math.min(1, 192 / Math.max(width, height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(width * scale))
        canvas.height = Math.max(1, Math.round(height * scale))
        const context = canvas.getContext('2d')
        if (!context || typeof canvas.toBlob !== 'function') { releaseOriginal(); return }
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        canvas.toBlob(blob => {
          releaseOriginal()
          if (cancelled || !blob) return
          thumbnailUrl = URL.createObjectURL(blob)
          setImgPreview(thumbnailUrl)
        }, 'image/webp', 0.76)
      } catch {
        releaseOriginal()
      }
    }
    image.onerror = releaseOriginal
    image.src = originalUrl
    return () => {
      cancelled = true
      image.onload = null
      image.onerror = null
      releaseOriginal()
      if (thumbnailUrl) URL.revokeObjectURL(thumbnailUrl)
    }
  }, [imgFile])

  useEffect(() => {
    if (!previewOpen || !imgFile) { setViewerSrc(null); return }
    const url = URL.createObjectURL(imgFile)
    setViewerSrc(url)
    return () => URL.revokeObjectURL(url)
  }, [previewOpen, imgFile])

  return (
    <>
      <Box className="pindou-page pindou-form">
        {serverReachable === false && <Alert severity="warning" role="status"
          action={navigator.onLine ? <Button color="inherit" onClick={() => setCheckKey(value => value + 1)}>重试</Button> : undefined}>
          离线或服务器暂不可用：可以继续填写本页草稿，但联网确认前不能提交；刷新网页会丢失草稿。
        </Alert>}
        {formMessage && <Alert severity="error" role="alert"
          action={<Button color="inherit" onClick={() => setFormMessage('')}>关闭</Button>}>
          {formMessage}
        </Alert>}

        <Box className="pindou-form-field pindou-form-color">
          <ColorCodeSelect options={allCodes} value={selectedCodes}
            disabled={loading} onChange={handleSelectChange} sx={{ width: '100%', minWidth: 0 }} />
        </Box>

        <Box className="pindou-form-field pindou-form-quantity">
          <TextField size="small" label="数量" type="number" value={applyCount}
            disabled={loading} onChange={event => setApplyCount(event.target.value)}
            inputProps={{ inputMode: 'numeric', min: 1, step: 1 }} />
          <Button variant="contained" size="small" onClick={applyToSelected}
            disabled={!canApplyToSelected || loading}>应用到所选</Button>
        </Box>

        <Box className="pindou-form-field pindou-file-row">
          <Button variant="outlined" onClick={() => filePicker.current?.click()}
            disabled={loading} aria-label="选择图片">选择图片</Button>
          <input ref={filePicker} className="pindou-hidden-input" type="file"
            accept="image/*" aria-label="本次记录图片"
            onChange={event => {
              handleFileChange(event.target.files?.[0])
              event.target.value = ''
            }} />
          {imgFile && <Typography variant="caption" className="pindou-file-name">
            图片：{imgFile.name}
          </Typography>}
          {imgFile && <button type="button" className="pindou-draft-photo-button"
            aria-label="查看图片" disabled={loading} onClick={() => setPreviewOpen(true)}>
            {imgPreview ? <img className="pindou-draft-photo"
              src={imgPreview} alt="preview" /> :
              <span className="pindou-draft-thumbnail-fallback">缩略图生成中或不可用，点击查看</span>}
          </button>}
        </Box>

        <Box className="pindou-form-field">
          <TextField fullWidth label="备注（可选）" size="small" value={note}
            disabled={loading} onChange={event => setNote(event.target.value)}
            inputProps={{ maxLength: 1000 }} />
        </Box>

        <Box className="pindou-form-actions">
          <Button variant="contained" onClick={handleSubmit}
            disabled={!canSubmit || loading || serverReachable !== true}>
            {loading ? '正在保存…' : initialOperation}
          </Button>
          <Button variant="outlined" onClick={onClose} disabled={loading}>取消</Button>
        </Box>
        {hasDraft && <Typography variant="caption" color="text.secondary"
          sx={{ display: 'block', mt: 1, mb: 1 }}>
          切换页面会保留填写内容；刷新或关闭网页会清空。
        </Typography>}
        <Box className="pindou-inventory-sections" mt={2}>
          <InventoryGrid groupedInventory={grouped} findPalette={findPalette} showZero={false} />
        </Box>
      </Box>

      <Dialog open={previewOpen && !!imgFile} onClose={() => setPreviewOpen(false)}
        fullWidth maxWidth="sm" aria-labelledby="pindou-preview-title"
        PaperProps={{ className: 'pindou-image-preview', sx: { m: 1, maxWidth: 'calc(100% - 16px)' } }}>
        <DialogTitle id="pindou-preview-title">图片预览</DialogTitle>
        <DialogContent>
          {viewerSrc ? <img src={viewerSrc} alt={imgFile?.name || '本次记录图片'} /> :
            <Typography variant="body2">正在打开图片…</Typography>}
          <Button fullWidth sx={{ mt: 2 }} onClick={() => setPreviewOpen(false)}>关闭</Button>
        </DialogContent>
      </Dialog>
    </>
  )
}
