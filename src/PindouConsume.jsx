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
  const previewRef = useRef(null)
  

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
    setLoading(true)
    try{
      // capture from camera canvas if available
      let imagePath = null
      try{
        const ctx = canvas.getContext('2d')
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.9))
        if (blob){
          const file = new File([blob], 'capture.jpg', { type: 'image/jpeg' })
          setImgFile(file)
          const url = URL.createObjectURL(blob)
          // show preview
          if (previewRef.current){ try{ URL.revokeObjectURL(previewRef.current) }catch(e){} }
          previewRef.current = url
          setImgPreview(url)
          // 上传图片到后端，后端返回路径
          const form = new FormData()
          form.append('image', file)
          const up = await fetch('/api/upload', { method: 'POST', body: form })
          const uj = await up.json()
          if (!up.ok) throw new Error(uj && uj.error ? uj.error : 'upload failed')
          imagePath = uj.path || uj.filename || null
        }
      }catch(e){ console.warn('image capture/upload skipped', e) }

      const body = { operation: initialOperation, items, occurred_at: new Date().toISOString(), note, image_path: imagePath }
      const res = await fetch('/api/reminders', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error((await res.json()).error || res.statusText)
      const data = await res.json()
      alert(initialOperation + '记录已保存')
      onAdded(data)
    }catch(err){
      console.error(err)
      alert('保存失败：' + err.message)
    }finally{
      stopCamera()
      setLoading(false)
    }
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

  

  

  // 选择文件时：本地预览并上传到后端（FormData）
  async function handleFileChange(file){
    if (!file) return
    setImgFile(file)
    try{
      // revoke previous preview URL
      if (previewRef.current){
        try{ URL.revokeObjectURL(previewRef.current) }catch(e){}
        previewRef.current = null
      }
      const url = URL.createObjectURL(file)
      previewRef.current = url
      setImgPreview(url)
    }catch(e){}
    // 不在此处上传，图片将在提交时统一上传
  }

  // cleanup objectURL on unmount
  useEffect(() => {
    return () => {
      if (previewRef.current) {
        try{ URL.revokeObjectURL(previewRef.current) }catch(e){}
        previewRef.current = null
      }
    }
  }, [])

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
        
        {/* 内联预览 */}
        {imgPreview && (
          <Box component="span" sx={{ ml:1, display:'inline-block', verticalAlign:'middle' }}>
            <img src={imgPreview} alt="preview" style={{ maxWidth:120, maxHeight:90, borderRadius:4, border:'1px solid #eee' }} />
          </Box>
        )}
        <Button size="small" onClick={() => { if (imgPreview) { const w = window.open(); if (w) w.document.body.innerHTML = `<img src="${imgPreview}" style="max-width:100%">` } }}>预览</Button>
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

    
    </>
  )
}
