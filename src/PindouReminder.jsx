import React, { useMemo, useState, useEffect, useRef } from 'react'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Autocomplete from '@mui/material/Autocomplete'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import CloseIcon from '@mui/icons-material/Close'
// Image upload and OCR removed
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
  // Image upload and OCR state removed

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
    if (items.length === 0) return alert('请先输入要' + initialOperation + '的数量')
    const body = { operation: initialOperation, items, occurred_at: new Date().toISOString(), note }
    setLoading(true)
    try{
      const res = await fetch('/api/reminders', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error((await res.json()).error || res.statusText)
      const data = await res.json()
      alert(initialOperation + '记录已保存')
      onAdded(data)
    }catch(err){
      console.error(err)
      alert('保存失败：' + err.message)
    }finally{ setLoading(false) }
  }

  // handleFileChange removed



  // OCR worker prewarm removed

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

  // processImage and OCR logic removed

  // OCR confirm/cancel removed

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

      {/* 图片上传与识别 已移除 */}

      <Box sx={{ display: 'grid', gap: 0, gridTemplateColumns: 'repeat(auto-fill, minmax(128px, 1fr))' }}>
        {allCodes.map(code => {
          const p = findPalette(code)
          const hex = p ? p.hex : '#fff'
          const selected = selectedCodes.includes(code)
          return (
            <Box
              key={code}
              sx={{ display:'flex', alignItems:'center', gap:1, p:1, border: selected ? '2px solid rgba(25,118,210,0.8)' : '1px solid #eee', borderRadius:1 }}
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

    {/* OCR dialog removed */}
    </>
  )
}

