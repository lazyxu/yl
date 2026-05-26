import React, { useMemo, useState, useEffect, useRef } from 'react'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import IconButton from '@mui/material/IconButton'
import CloseIcon from '@mui/icons-material/Close'
import LinearProgress from '@mui/material/LinearProgress'
import Input from '@mui/material/Input'
// use dynamic import for tesseract to handle different bundler export shapes
import ColorSwatch from './ColorSwatch'
import MARD from './colorPalettes/mard.json'

function findPalette(code){
  return MARD.find(p => p.code === code)
}

export default function PindouConsume({ initialRows = null, onClose = ()=>{}, onAdded = ()=>{} }){
  const initialOperation = '消耗'
  const [itemsMap, setItemsMap] = useState(() => {
    const map = {}
    MARD.forEach(p => { map[p.code] = 0 })
    return map
  })
  const [selectedCodes, setSelectedCodes] = useState([])
  const [applyCount, setApplyCount] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [imgFile, setImgFile] = useState(null)
  const [imgPreview, setImgPreview] = useState(null)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrProgress, setOcrProgress] = useState(0)
  const workerRef = useRef(null)
  const [ocrResult, setOcrResult] = useState(null)
  const [ocrDialogOpen, setOcrDialogOpen] = useState(false)

  useEffect(()=>{
    if (Array.isArray(initialRows) && initialRows.length>0){
      setItemsMap(prev => {
        const next = { ...prev }
        initialRows.forEach(r => { next[r.color] = Number(r.count) || 0 })
        return next
      })
      setSelectedCodes(initialRows.map(r => r.color))
    }
  }, [initialRows])

  const allCodes = useMemo(()=>{
    const set = new Set(MARD.map(p=>p.code))
    Object.keys(itemsMap).forEach(k=>set.add(k))
    return Array.from(set)
  }, [itemsMap])

  function updateCount(code, v){
    const n = Number(v) || 0
    if (!Number.isInteger(n) || n < 0) return
    setItemsMap(prev => ({ ...prev, [code]: n }))
  }

  function applyToSelected(){
    const n = Number(applyCount)
    if (!Number.isInteger(n) || n <= 0) return alert('请输入正整数数量')
    setItemsMap(prev => {
      const next = { ...prev }
      selectedCodes.forEach(code => { next[code] = n })
      return next
    })
  }

  async function handleSubmit(){
    const items = Object.entries(itemsMap).filter(([,cnt]) => Number(cnt) > 0).map(([color,cnt]) => ({ color, count: Number(cnt) }))
    if (items.length === 0) return alert('请先输入要' + initialOperation + '的数量')
    const body = { operation: initialOperation, items, occurred_at: new Date().toISOString(), note }
    setLoading(true)
    try{
      const ctx = canvas.getContext('2d')
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.9))
      if (blob){
        setImgFile(new File([blob], 'capture.jpg', { type: 'image/jpeg' }))
        const url = URL.createObjectURL(blob)
        setImgPreview(url)
        await processImage()
      }
    }catch(err){
      console.error(err)
      alert('拍照识别失败：' + err.message)
    }finally{
      stopCamera()
    }
  }

  useEffect(() => {
    let mounted = true
    async function initWorker(){
      try{
        const mod = await import('tesseract.js')
        const creator = mod.createWorker || (mod.default && mod.default.createWorker) || mod.default
        if (typeof creator !== 'function') throw new Error('createWorker not found')
        const w = creator({ logger: m => { if (m.status==='recognizing text' && m.progress) setOcrProgress(Math.round(m.progress*100)) } })
        await w.load()
        await w.loadLanguage('eng')
        await w.initialize('eng')
        try{ await w.setParameters({ tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789' }) }catch(e){}
        if (mounted) workerRef.current = w
        else await w.terminate()
      }catch(err){ console.error('预热 OCR worker 失败', err) }
    }
    initWorker()
    return () => { mounted = false; if (workerRef.current){ workerRef.current.terminate().catch(()=>{}); workerRef.current = null } }
  }, [])

  function hexToRgb(hex){
    const c = (hex||'#000000').replace('#','')
    return { r: parseInt(c.substr(0,2),16), g: parseInt(c.substr(2,2),16), b: parseInt(c.substr(4,2),16) }
  }

  function colorDistance(a,b){
    return Math.sqrt((a.r-b.r)**2 + (a.g-b.g)**2 + (a.b-b.b)**2)
  }

  function findNearestCodeByRgb(rgb){
    let best = null, bestDist = Infinity
    MARD.forEach(p => {
      const r = hexToRgb(p.hex)
      const d = colorDistance(rgb, r)
      if (d < bestDist){ bestDist = d; best = p.code }
    })
    return best
  }

  async function processImage(){
    if (!imgFile) return alert('请先选择图片')
    setOcrLoading(true)
    setOcrProgress(0)
    try{
      const img = await createImageBitmap(imgFile)
      const canvas = document.createElement('canvas')
      const MAX_SIDE = 400
      canvas.width = Math.min(img.width, MAX_SIDE)
      canvas.height = Math.min(img.height, Math.round(MAX_SIDE * (img.height/img.width)))
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      const w = canvas.width, h = canvas.height
      const sx = Math.max(0, Math.floor(w*0.25)), sy = Math.max(0, Math.floor(h*0.25))
      const sw = Math.floor(w*0.5), sh = Math.floor(h*0.5)
      const data = ctx.getImageData(sx, sy, sw, sh).data
      let r=0,g=0,b=0,count=0
      for(let i=0;i<data.length;i+=4){ r += data[i]; g += data[i+1]; b += data[i+2]; count++ }
      const avg = { r: Math.round(r/count), g: Math.round(g/count), b: Math.round(b/count) }
      const nearest = findNearestCodeByRgb(avg)
      let worker = workerRef.current
      let createdLocal = false
      if (!worker){
        const mod = await import('tesseract.js')
        const creator = mod.createWorker || (mod.default && mod.default.createWorker) || mod.default
        if (typeof creator !== 'function') throw new Error('createWorker not found')
        worker = creator({ logger: m => { if (m.status==='recognizing text' && m.progress) setOcrProgress(Math.round(m.progress*100)) } })
        await worker.load()
        await worker.loadLanguage('eng')
        await worker.initialize('eng')
        try{ await worker.setParameters({ tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789' }) }catch(e){}
        createdLocal = true
      }
      const { data: { text } } = await worker.recognize(canvas)
      if (createdLocal){ try{ await worker.terminate() }catch(e){} }
      const nums = text.match(/\d+/g)
      const foundNum = nums ? Number(nums[0]) : null
      const textUpper = text.toUpperCase()
      let foundCode = null
      for(const p of MARD){ if (textUpper.indexOf(p.code.toUpperCase()) > -1){ foundCode = p.code; break } }
      const targetCode = foundCode || nearest
      setOcrResult({ code: targetCode, count: foundNum || 0, hex: (findPalette(targetCode)||{}).hex || '#ffffff' })
      setOcrDialogOpen(true)
      setOcrProgress(100)
    }catch(err){
      console.error(err)
      alert('识别失败：' + err.message)
    }finally{ setOcrLoading(false); setOcrProgress(0) }
  }

  function confirmOcrApply(){
    if (!ocrResult) return setOcrDialogOpen(false)
    const { code, count } = ocrResult
    setItemsMap(prev => ({ ...prev, [code]: Number(count) || 0 }))
    setSelectedCodes(s => s.includes(code) ? s : [...s, code])
    setOcrDialogOpen(false)
    alert(`已应用：色号 ${code}，数量 ${count}`)
    setOcrResult(null)
  }

  function cancelOcr(){ setOcrDialogOpen(false); setOcrResult(null) }

  return (
    <>
    <Box sx={{ p:1 }}>
      <Box sx={{ display:'flex', alignItems:'center', justifyContent:'space-between', mb:1 }}>
        <Typography variant="h6">{initialOperation}</Typography>
        <IconButton onClick={onClose}><CloseIcon /></IconButton>
      </Box>

      <Box sx={{ display:'flex', gap:1, alignItems:'center', mb:1, flexWrap:'wrap' }}>
        <Box sx={{ minWidth:240, display:'flex', gap:0.5, flexWrap:'wrap', alignItems:'center' }}>
          {selectedCodes.length === 0 ? <Typography variant="body2" sx={{ color: '#666' }}>未选择色号</Typography> : selectedCodes.map(code => (
            <Chip key={code} size="small" label={code} onDelete={() => setSelectedCodes(s => s.filter(c => c !== code))} />
          ))}
        </Box>

        <TextField size="small" label="数量" type="number" value={applyCount} onChange={e=>setApplyCount(e.target.value)} sx={{ width:120 }} />
        <Button variant="contained" size="small" onClick={applyToSelected}>应用到所选</Button>
        <Button size="small" variant="outlined" onClick={() => { setSelectedCodes(allCodes); setItemsMap(prev => { const next = { ...prev }; allCodes.forEach(c => { if (!(c in next)) next[c] = 0 }); return next }) }} disabled={selectedCodes.length === allCodes.length}>全选</Button>
      </Box>

      <Box sx={{ mb:1 }}>
        <TextField fullWidth label="备注（可选）" size="small" value={note} onChange={e=>setNote(e.target.value)} />
      </Box>

      <Box sx={{ display:'flex', gap:1, mt:0, mb:1 }}>
        <Button variant="contained" onClick={handleSubmit} disabled={loading}>{initialOperation}</Button>
        <Button onClick={onClose}>取消</Button>
      </Box>

      <Box sx={{ mb:1, display:'flex', gap:1, alignItems:'center', flexWrap:'wrap' }}>
        <Input
          inputProps={{ accept: 'image/*' }}
          type="file"
          onChange={e => handleFileChange(e.target.files && e.target.files[0])}
          sx={{ display: 'inline-flex' }}
        />
        <Button size="small" onClick={() => { if (imgPreview) { const w = window.open(); if (w) w.document.body.innerHTML = `<img src="${imgPreview}" style="max-width:100%">` } }}>预览</Button>
        <Button size="small" variant="outlined" onClick={processImage} disabled={ocrLoading || !imgFile}>识别图片</Button>
        {ocrLoading && <Box sx={{ width: 160 }}><LinearProgress variant="determinate" value={ocrProgress} /></Box>}
      </Box>

      <Box sx={{ display: 'grid', gap: 0, gridTemplateColumns: 'repeat(auto-fill, minmax(128px, 1fr))' }}>
        {allCodes.map(code => {
          const p = findPalette(code)
          const hex = p ? p.hex : '#fff'
          const selected = selectedCodes.includes(code)
          return (
            <Box
              key={code}
              onClick={() => { setSelectedCodes(s => s.includes(code) ? s.filter(c => c !== code) : [...s, code]); setItemsMap(prev => ({ ...prev, [code]: prev[code] || 0 })) }}
              sx={{ display:'flex', alignItems:'center', gap:1, p:1, border: selected ? '2px solid rgba(25,118,210,0.8)' : '1px solid #eee', borderRadius:1, cursor: 'pointer' }}
            >
                <Box sx={{ display: 'inline-block' }}>
                  <ColorSwatch code={code} hex={hex} />
                </Box>
                <TextField size="small" type="number" inputProps={{ min:0 }} value={itemsMap[code] || 0} onClick={e=>e.stopPropagation()} onChange={e=>updateCount(code, e.target.value)} sx={{ width:120 }} />
              </Box>
          )
        })}
      </Box>

    </Box>

    <Dialog open={ocrDialogOpen} onClose={cancelOcr}>
      <DialogTitle>识别结果确认</DialogTitle>
      <DialogContent>
        {ocrResult && (
          <Box sx={{ display:'flex', gap:1, alignItems:'center', mt:1 }}>
            <TextField label="色号" size="small" value={ocrResult.code} onChange={e=>setOcrResult(r => ({ ...r, code: e.target.value }))} sx={{ minWidth:120 }} />
            <TextField label="数量" size="small" type="number" value={ocrResult.count} onChange={e=>setOcrResult(r => ({ ...r, count: e.target.value }))} sx={{ width:120 }} />
            <Box sx={{ display:'inline-block', ml:1 }}>
              <ColorSwatch code={ocrResult ? ocrResult.code : ''} hex={ocrResult ? ocrResult.hex : '#fff'} />
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={cancelOcr}>取消</Button>
        <Button variant="contained" onClick={confirmOcrApply}>应用</Button>
      </DialogActions>
    </Dialog>
    </>
  )
}
