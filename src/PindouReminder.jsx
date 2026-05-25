import React, { useMemo, useState, useEffect } from 'react'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Autocomplete from '@mui/material/Autocomplete'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import CloseIcon from '@mui/icons-material/Close'
import LinearProgress from '@mui/material/LinearProgress'
import Input from '@mui/material/Input'
import Tesseract from 'tesseract.js'
import ColorSwatch from './ColorSwatch'
import MARD from './colorPalettes/mard.json'

function findPalette(code){
  return MARD.find(p => p.code === code)
}

export default function PindouReminder({ initialOperation = '补豆', initialRows = null, onClose = ()=>{}, onAdded = ()=>{} }){
  // itemsMap: { code: number }
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
    // collect items with count>0
    const items = Object.entries(itemsMap).filter(([,cnt]) => Number(cnt) > 0).map(([color,cnt]) => ({ color, count: Number(cnt) }))
    if (items.length === 0) return alert('请先输入要补的数量')
    const body = { operation: '补豆', items, occurred_at: new Date().toISOString(), note }
    setLoading(true)
    try{
      const res = await fetch('/api/reminders', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error((await res.json()).error || res.statusText)
      const data = await res.json()
      alert('补豆记录已保存')
      onAdded(data)
    }catch(err){
      console.error(err)
      alert('保存失败：' + err.message)
    }finally{ setLoading(false) }
  }

  function handleFileChange(file){
    if (!file) return
    setImgFile(file)
    const url = URL.createObjectURL(file)
    setImgPreview(url)
  }

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
      // load image into canvas
      const img = await createImageBitmap(imgFile)
      const canvas = document.createElement('canvas')
      canvas.width = Math.min(img.width, 800)
      canvas.height = Math.min(img.height, 800 * (img.height/img.width))
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      // sample center area for average color
      const w = canvas.width, h = canvas.height
      const sx = Math.max(0, Math.floor(w*0.25)), sy = Math.max(0, Math.floor(h*0.25))
      const sw = Math.floor(w*0.5), sh = Math.floor(h*0.5)
      const data = ctx.getImageData(sx, sy, sw, sh).data
      let r=0,g=0,b=0,count=0
      for(let i=0;i<data.length;i+=4){ r += data[i]; g += data[i+1]; b += data[i+2]; count++ }
      const avg = { r: Math.round(r/count), g: Math.round(g/count), b: Math.round(b/count) }
      const nearest = findNearestCodeByRgb(avg)

      // run OCR to find numbers and codes
      const worker = Tesseract.createWorker({
        logger: m => { if (m.status==='recognizing text' && m.progress) setOcrProgress(Math.round(m.progress*100)) }
      })
      await worker.load()
      await worker.loadLanguage('eng+chi_sim')
      await worker.initialize('eng+chi_sim')
      const { data: { text } } = await worker.recognize(canvas)
      await worker.terminate()

      // find numeric quantity
      const nums = text.match(/\d+/g)
      const foundNum = nums ? Number(nums[0]) : null

      // try to find any known code in OCR text (A1, B12 etc.)
      const textUpper = text.toUpperCase()
      let foundCode = null
      for(const p of MARD){ if (textUpper.indexOf(p.code.toUpperCase()) > -1){ foundCode = p.code; break } }

      // prefer code from OCR, fallback to nearest color
      const targetCode = foundCode || nearest

      // apply results
      setItemsMap(prev => ({ ...prev, [targetCode]: foundNum || prev[targetCode] || 0 }))
      setSelectedCodes(s => s.includes(targetCode) ? s : [...s, targetCode])
      setOcrProgress(100)
      alert(`识别结果：色号 ${targetCode}，数量 ${foundNum || 0}`)
    }catch(err){
      console.error(err)
      alert('识别失败：' + err.message)
    }finally{ setOcrLoading(false); setOcrProgress(0) }
  }

  return (
    <Box sx={{ p:1 }}>
      <Box sx={{ display:'flex', alignItems:'center', justifyContent:'space-between', mb:1 }}>
        <Typography variant="h6">补豆</Typography>
        <IconButton onClick={onClose}><CloseIcon /></IconButton>
      </Box>

      

      <Box sx={{ display:'flex', gap:1, alignItems:'center', mb:1, flexWrap:'wrap' }}>
        <Autocomplete
          multiple
          freeSolo
          options={MARD.map(p=>p.code)}
          value={selectedCodes}
          onChange={(e, v) => {
            setSelectedCodes(v)
            // ensure map contains entries
            setItemsMap(prev => {
              const next = { ...prev }
              v.forEach(code => { if (!(code in next)) next[code] = 0 })
              return next
            })
          }}
          renderTags={(value, getTagProps) => value.map((option, index) => (
            <Chip size="small" label={option} {...getTagProps({ index })} key={option} />
          ))}
          renderInput={(params) => <TextField {...params} size="small" label="选择色号（可多选/输入）" />}
          sx={{ minWidth: 240 }}
        />

        <TextField size="small" label="数量" type="number" value={applyCount} onChange={e=>setApplyCount(e.target.value)} sx={{ width:120 }} />
        <Button variant="contained" size="small" onClick={applyToSelected}>应用到所选</Button>
      </Box>

      <Box sx={{ mb:1 }}>
        <TextField fullWidth label="备注（可选）" size="small" value={note} onChange={e=>setNote(e.target.value)} />
      </Box>

      <Box sx={{ display:'flex', gap:1, mt:0, mb:1 }}>
        <Button variant="contained" onClick={handleSubmit} disabled={loading}>补豆</Button>
        <Button onClick={onClose}>取消</Button>
      </Box>

      {/* 图片上传与识别 */}
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
          return (
            <Box key={code} sx={{ display:'flex', alignItems:'center', gap:1, p:1, border:'1px solid #eee', borderRadius:1 }}>
                <ColorSwatch code={code} hex={hex} sx={{ borderRadius:0, fontSize:'0.85rem', fontWeight:700 }} />
                <TextField size="small" type="number" inputProps={{ min:0 }} value={itemsMap[code] || 0} onChange={e=>updateCount(code, e.target.value)} sx={{ width:120 }} />
              </Box>
          )
        })}
      </Box>

      
    </Box>
  )
}

