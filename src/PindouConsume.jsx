import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import ColorCodeSelect from './ColorCodeSelect'
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
import InventoryGrid from './InventoryGrid'
 
function findPalette(code){
  return MARD.find(p => p.code === code)
}

export default function PindouConsume({ initialOperation = '消耗', initialRows = null, onClose = ()=>{}, onAdded = ()=>{} }){
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

  const handleSelectChange = useCallback((e, value) => {
    setSelectedCodes(value)
    setItemsMap(prev => {
      const next = { ...prev }
      value.forEach(code => { if (!(code in next)) next[code] = 0 })
      return next
    })
  }, [])

  const selectedSet = useMemo(() => new Set(selectedCodes), [selectedCodes])

  const canApplyToSelected = useMemo(() => {
    if (!selectedCodes || selectedCodes.length === 0) return false
    if (applyCount === '' || applyCount == null) return false
    const n = Number(applyCount)
    return Number.isInteger(n) && n > 0
  }, [selectedCodes, applyCount])

  // removed canSubmit: use canApplyToSelected instead as requested

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

    const items = Object.entries(submitMap).filter(([,cnt]) => Number(cnt) > 0).map(([color,cnt]) => ({ color, count: Number(cnt) }))
    if (items.length === 0) return alert('请先输入要' + initialOperation + '的数量')
    setLoading(true)
    try{
      // 优先使用用户选择的文件上传为提交图片
      let imagePath = null
      if (imgFile) {
        try{
          const form = new FormData()
          form.append('image', imgFile)
          const up = await fetch('/api/upload', { method: 'POST', body: form })
          const uj = await up.json()
          if (!up.ok) throw new Error(uj && uj.error ? uj.error : 'upload failed')
          imagePath = uj.path || uj.filename || null
        }catch(e){ console.warn('user-selected image upload skipped', e) }
      }

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
          <Box sx={{ minWidth:240 }}>
            <ColorCodeSelect options={allCodes} value={selectedCodes} onChange={handleSelectChange} sx={{ minWidth: 240 }} />
          </Box>
      </Box>

      <Box sx={{ display:'flex', gap:1, alignItems:'center', mb:1 }}>
        <TextField size="small" label="数量" type="number" value={applyCount} onChange={e=>setApplyCount(e.target.value)} sx={{ width:120 }} />
        <Button variant="contained" size="small" onClick={applyToSelected} disabled={!canApplyToSelected}>应用到所选</Button>
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

      <Box sx={{ mb:1 }}>
        <TextField fullWidth label="备注（可选）" size="small" value={note} onChange={e=>setNote(e.target.value)} />
      </Box>

      <Box sx={{ display:'flex', gap:1, mt:0, mb:1 }}>
        <Button variant="contained" onClick={handleSubmit} disabled={!canApplyToSelected || loading}>{initialOperation}</Button>
        <Button onClick={onClose}>取消</Button>
      </Box>

      {(() => {
        const grouped = (() => {
          const map = new Map()
          allCodes.forEach(code => {
            const key = (code || '').charAt(0).toUpperCase() || '#'
            if (!map.has(key)) map.set(key, [])
            map.get(key).push({ color: code, count: Number(itemsMap[code] || 0) })
          })
          return Array.from(map.entries()).sort((a,b)=>a[0].localeCompare(b[0]))
        })()

        return (
          <InventoryGrid groupedInventory={grouped} findPalette={findPalette} showZero={false} />
        )
      })()}

    </Box>

    
    </>
  )
}
