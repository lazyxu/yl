import React, { useEffect, useState, useCallback, useMemo } from 'react'
import './PindouReminder.css'
import MARD from './colorPalettes/mard.json'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
// selection handled by clickable color block (IconButton)
// Badge removed — using inline "x N" and selectable color block
// removed color-blind controls
import IconButton from '@mui/material/IconButton'
import DeleteIcon from '@mui/icons-material/Delete'
// use CSS Grid for auto-fill compact layout instead of MUI 12-col Grid
// Card replaced by Box for more compact layout

const ColorCard = React.memo(function ColorCard({ it, findPalette, threshold, isSelected, onSelectToggle, onConsume }){
  const p = findPalette(it.color)
  const hex = p ? p.hex : '#fff'
  function getTextColor(hex){
    try{
      const c = (hex||'#ffffff').replace('#','')
      const r = parseInt(c.substr(0,2),16)
      const g = parseInt(c.substr(2,2),16)
      const b = parseInt(c.substr(4,2),16)
      // relative luminance approximation
      const lum = (0.2126*r + 0.7152*g + 0.0722*b) / 255
      return lum > 0.6 ? '#000' : '#fff'
    }catch(e){ return '#000' }
  }
  const textColor = getTextColor(hex)
  const cnt = it.count || 0
  const low = cnt <= threshold
  return (
    <Box sx={{ position: 'relative', p: 0 }}>
      <Box role="listitem" aria-label={`${it.color}，${cnt} 颗`} sx={{ p:0, touchAction:'manipulation', border: 'none', borderRadius: 0, boxShadow: 'none' }}>
        <Box sx={{ p:0 }}>
          <Box sx={{ p:0, display:'flex', alignItems:'center', gap:0.4 }}>
            <IconButton
              aria-pressed={isSelected}
              aria-label={`选择 ${it.color} 库存 ${cnt}`}
              onClick={() => onSelectToggle(it.color, !isSelected)}
              sx={{ width:48, height:48, p:0.5, borderRadius:1, display:'flex', alignItems:'center', justifyContent:'center', border: isSelected ? '2px solid rgba(25,118,210,0.9)' : '1px solid transparent' }}
            >
              <Box sx={{ width:36, height:20, p:0, background:hex, border:'1px solid rgba(0,0,0,0.06)', borderRadius:1, display:'flex', alignItems:'center', justifyContent:'center', color: textColor, fontWeight:700, fontSize:{xs:'10px', sm:'11px'} }} title={`${it.color} ${hex}`}>
                <span aria-hidden>{it.color}</span>
              </Box>
            </IconButton>
            <Box sx={{ ml:0.5, p:0, display:'flex', alignItems:'center', fontWeight:700, fontSize:{xs:'10px', sm:'11px'}, opacity: cnt === 0 ? 0.5 : 1 }} aria-hidden>x {cnt}</Box>
            <Box sx={{ flex:1, minWidth:0 }} />
          </Box>
        </Box>
      </Box>
    </Box>
  )
})

// API base inlined as '/api'

function Inventory({ onAction, refreshKey }) {
  const [inventory, setInventory] = useState([])
  const [threshold, setThreshold] = useState(() => {
    const v = localStorage.getItem('pindou-threshold')
    return v ? Number(v) : 20
  })
  const [selected, setSelected] = useState([]) // selected color codes
  const [bulkCountInput, setBulkCountInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [displayMode, setDisplayMode] = useState('all') // 'all' | 'low'
  // color-blind mode removed

  useEffect(() => { fetchInventory() }, [])
  useEffect(() => { if (typeof refreshKey !== 'undefined') fetchInventory() }, [refreshKey])

  // Build displayedInventory: include all color codes from MARD (missing -> count 0),
  // and append any backend inventory entries not present in MARD.
  const displayedInventory = useMemo(() => {
    const map = new Map((inventory || []).map(i => [i.color, i.count]))
    const list = MARD.map(p => ({ color: p.code, count: map.has(p.code) ? map.get(p.code) : 0 }))
    ;(inventory || []).forEach(i => {
      if (!MARD.find(p => p.code === i.color)) list.push(i)
    })
    return list
  }, [inventory])

  // filtered by display mode and threshold
  const filteredInventory = useMemo(() => {
    if (displayMode === 'all') return displayedInventory
    return displayedInventory.filter(it => (it.count || 0) <= threshold)
  }, [displayedInventory, displayMode, threshold])

  // group by first letter of the color code for sectioned display
  const groupedInventory = useMemo(() => {
    const map = new Map();
    ;(filteredInventory || []).forEach(it => {
      const key = (it.color || '').charAt(0).toUpperCase() || '#'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(it)
    })
    // sort groups by letter
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filteredInventory])

  const lowCount = useMemo(() => {
    return displayedInventory.filter(it => (it.count || 0) <= threshold).length
  }, [displayedInventory, threshold])

  const findPalette = useCallback((code) => MARD.find(p => p.code === code), [])

  const handleSelectToggle = useCallback((code, checked) => {
    setSelected(s => {
      if (checked) return s.includes(code) ? s : [...s, code]
      return s.filter(x => x !== code)
    })
  }, [])

  const handleConsume = useCallback((item) => {
    const rows = [{ color: item.color, count: item.count }]
    if (typeof onAction === 'function') onAction('消耗', rows)
  }, [onAction])

  async function fetchInventory() {
    setLoading(true)
    try {
      const res = await fetch('/api/inventory')
      const data = await res.json()
      setInventory(data)
    } catch (err) {
      console.error(err)
    } finally { setLoading(false) }
  }

  function saveThreshold(v){ localStorage.setItem('pindou-threshold', String(v)); setThreshold(v) }

  return (
    <Box sx={{pb:0, width: '100%'}}>
      <Box sx={{display:'flex',alignItems:'center',justifyContent:'space-between',mb:1}}>
        <Typography variant="h5" sx={{fontSize:{xs:'1.1rem',sm:'1.25rem',md:'1.4rem'},lineHeight:1.25}}>库存总览</Typography>
          <Box sx={{display:'flex',alignItems:'center',gap:1}}>
          {/* 色弱模式已移除 */}
          <Stack direction="row" spacing={1}>
            <Button variant="contained" onClick={()=>{ if (typeof onAction==='function') onAction('补豆') }}>补豆</Button>
            <Button variant="contained" color="error" onClick={()=>{ if (typeof onAction==='function') onAction('消耗') }}>消耗</Button>
          </Stack>
        </Box>
      </Box>

      <Box sx={{display:'flex',alignItems:'center',gap:1,mb:1}}>
        <TextField label="阈值预警（颗）" type="number" size="small" value={threshold} onChange={e=>saveThreshold(Number(e.target.value))} sx={{width:110}} />
        <ToggleButtonGroup size="small" value={displayMode} exclusive onChange={(e, v)=>{ if (v) setDisplayMode(v) }} sx={{ ml:1, mr:1 }}>
          <ToggleButton value="all">全部: {displayedInventory.length} 项</ToggleButton>
          <ToggleButton value="low">低于阈值: {lowCount} 项</ToggleButton>
        </ToggleButtonGroup>
        <Stack direction="column" spacing={0.5} sx={{ml:0, alignItems:'flex-start'}}>
          <Button size="small" onClick={() => {
            // 全选所有色号（包含 mard 中无库存的色号）
            const codes = displayedInventory.map(it => it.color)
            setSelected(codes)
          }}>全选</Button>
          <Button size="small" onClick={() => {
            // 按当前筛选（此处即 displayedInventory）全选
            const codes = filteredInventory.map(it => it.color)
            setSelected(codes)
          }}>按筛选全选</Button>
          <Button size="small" onClick={() => setSelected([])}>取消选择</Button>
        </Stack>
      </Box>

      {/* 已选切片显示 */}
      {selected.length > 0 && (
        <Box sx={{mb:1, display:'flex', gap:1, flexWrap:'wrap'}}>
          {selected.map(code => {
            const p = findPalette(code)
            return (
              <Chip key={code} label={`${code} ${p ? p.hex : ''}`} onDelete={() => setSelected(s => s.filter(x => x !== code))} sx={{minHeight:32}} />
            )
          })}
        </Box>
      )}

      {loading && <Typography>加载中...</Typography>}

      {!loading && (displayMode === 'all' ? displayedInventory.length===0 : filteredInventory.length===0) && <Typography>暂无库存记录</Typography>}

      <Box sx={{display:'flex',alignItems:'center',gap:2,mb:1}}>
        <TextField label="批量数量" size="small" value={bulkCountInput} onChange={e=>setBulkCountInput(e.target.value)} sx={{width:120}} />
        <Button variant="contained" onClick={()=>{
          const cnt = Number(bulkCountInput)
          if (!selected || selected.length===0) return alert('请先选择色号')
          if (!Number.isInteger(cnt) || cnt<=0) return alert('数量需为正整数')
          // prepare rows and open modal for 补豆
          const rows = selected.map(code => ({ color: code, count: cnt }))
          if (typeof onAction === 'function') onAction('补豆', rows)
        }}>批量补豆</Button>
        <Button variant="contained" color="error" onClick={()=>{
          const cnt = Number(bulkCountInput)
          if (!selected || selected.length===0) return alert('请先选择色号')
          if (!Number.isInteger(cnt) || cnt<=0) return alert('数量需为正整数')
          const rows = selected.map(code => ({ color: code, count: cnt }))
          if (typeof onAction === 'function') onAction('消耗', rows)
        }}>批量消耗</Button>
          <Button color="error" onClick={() => {
            if (!selected || selected.length === 0) return alert('请先选择色号')
            if (!confirm('确认将所选色号全部清空（生成消耗记录）？')) return
            const rows = selected.map(code => {
              const it = displayedInventory.find(x => x.color === code)
              return { color: code, count: it ? it.count : 0 }
            })
            if (typeof onAction === 'function') onAction('消耗', rows)
          }}>清空选中</Button>
        <Button onClick={()=>{ setSelected([]); setBulkCountInput('') }}>清除选择</Button>
      </Box>

      {/* 虚拟化卡片列表：每行为卡片风格，移动优先单列 */}
      {filteredInventory.length > 0 && (
        <Box sx={{ pr:0 }}>
          {groupedInventory.map(([letter, items]) => (
            <Box key={letter} sx={{ mb: 1 }}>
              <Typography variant="subtitle2" sx={{ px: 0.5, py: 0.5 }}>{letter}</Typography>
              <Box sx={{ display: 'grid', gap: 0, gridTemplateColumns: { xs: 'repeat(auto-fill, minmax(64px, 1fr))', sm: 'repeat(auto-fill, minmax(72px, 1fr))', md: 'repeat(auto-fill, minmax(84px, 1fr))' } }}>
                {items.map((it) => {
                  const isSelected = selected.indexOf(it.color) > -1
                  return (
                    <Box key={it.color} sx={{ p: 0, display: 'flex', alignItems: 'center' }}>
                      <ColorCard
                        it={it}
                        findPalette={findPalette}
                        threshold={threshold}
                        isSelected={isSelected}
                        onSelectToggle={handleSelectToggle}
                        onConsume={handleConsume}
                      />
                    </Box>
                  )
                })}
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {/* 底部固定批量操作面板（移动优先） */}
      <Box sx={{position:'fixed',bottom:0,left:0,right:0,p:1,background:'#fff',borderTop:'1px solid #eee',display:'flex',gap:1,alignItems:'center',justifyContent:'space-between'}}>
        <Box sx={{display:'flex',alignItems:'center',gap:1}}>
          <Typography variant="body2">已选 {selected.length} 项</Typography>
        </Box>
        <Box sx={{display:'flex',gap:1}}>
          <Button size="medium" variant="contained" onClick={() => {
            const cnt = Number(bulkCountInput)
            if (!selected || selected.length===0) return alert('请先选择色号')
            if (!Number.isInteger(cnt) || cnt<=0) return alert('数量需为正整数')
            const rows = selected.map(code => ({ color: code, count: cnt }))
            if (typeof onAction === 'function') onAction('补豆', rows)
          }}>补豆</Button>
          <Button size="medium" variant="contained" color="error" onClick={() => {
            const cnt = Number(bulkCountInput)
            if (!selected || selected.length===0) return alert('请先选择色号')
            if (!Number.isInteger(cnt) || cnt<=0) return alert('数量需为正整数')
            const rows = selected.map(code => ({ color: code, count: cnt }))
            if (typeof onAction === 'function') onAction('消耗', rows)
          }}>消耗</Button>
          <Button size="medium" onClick={() => { setSelected([]); setBulkCountInput('') }}>清除</Button>
        </Box>
      </Box>
    </Box>
  )
}

export default Inventory
