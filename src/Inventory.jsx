import React, { useEffect, useState, useMemo } from 'react'
import MARD from './colorPalettes/mard.json'
import { findPalette, PALETTE_CODES } from './palette'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
// Chip removed; history will show inline color swatches
import Stack from '@mui/material/Stack'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
// selection handled by clickable color block (IconButton)
// Badge removed — using inline "x N" and selectable color block
// removed color-blind controls
import IconButton from '@mui/material/IconButton'
import DeleteIcon from '@mui/icons-material/Delete'
import ColorSwatch from './ColorSwatch'
import InventoryGrid from './InventoryGrid'
// use CSS Grid for auto-fill compact layout instead of MUI 12-col Grid
// Card replaced by Box for more compact layout

const ColorCard = React.memo(function ColorCard({ it, findPalette, threshold }){
  const p = findPalette(it.color)
  const hex = p ? p.hex : '#fff'
  
  const cnt = it.count || 0
  const low = cnt <= threshold
  return (
    <Box sx={{ position: 'relative', p: 0 }}>
      <Box role="listitem" aria-label={`${it.color}，${cnt} 颗`} sx={{ p:0, touchAction:'manipulation', border: 'none', borderRadius: 0, boxShadow: 'none' }}>
        <Box sx={{ p:0 }}>
          <Box sx={{ p:0, display:'flex', alignItems:'center', gap:0.4 }}>
            <ColorSwatch code={it.color} hex={hex} />
            <Box sx={{ ml:0.5, p:0, display:'flex', alignItems:'center', fontWeight:700, fontSize:{xs:'10px', sm:'11px'}, opacity: cnt === 0 ? 0.5 : 1 }} aria-hidden>{cnt}</Box>
            <Box sx={{ flex:1, minWidth:0 }} />
          </Box>
        </Box>
      </Box>
    </Box>
  )
})

// API base inlined as '/api'

function Inventory({ active = true, onAction, refreshKey, onNavigate = ()=>{} }) {
  const [inventory, setInventory] = useState([])
  const [threshold, setThreshold] = useState(() => {
    const v = localStorage.getItem('pindou-threshold')
    return v ? Number(v) : 200
  })
  const [bulkCountInput, setBulkCountInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [inventoryReady, setInventoryReady] = useState(false)
  const [inventoryError, setInventoryError] = useState('')
  const [online, setOnline] = useState(() => navigator.onLine)
  const [retryKey, setRetryKey] = useState(0)
  const [records, setRecords] = useState([])
  const [recordsLoading, setRecordsLoading] = useState(false)
  const [displayMode, setDisplayMode] = useState('all') // 'all' | 'low'
  const [sortOrder, setSortOrder] = useState('none') // 'none' | 'asc' | 'desc'
  // color-blind mode removed

  useEffect(() => {
    const disconnected = () => setOnline(false)
    const reconnected = () => { setOnline(true); setRetryKey(key => key + 1) }
    window.addEventListener('offline', disconnected)
    window.addEventListener('online', reconnected)
    return () => {
      window.removeEventListener('offline', disconnected)
      window.removeEventListener('online', reconnected)
    }
  }, [])
  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    fetchInventory(controller.signal)
    return () => controller.abort()
  }, [active, refreshKey, retryKey])

  // history moved to separate page

  // Build displayedInventory: include all color codes from MARD (missing -> count 0),
  // and append any backend inventory entries not present in MARD.
  const displayedInventory = useMemo(() => {
    const map = new Map((inventory || []).map(i => [i.color, i.count]))
    const list = inventoryReady ? MARD.map(p => ({ color: p.code, count: map.has(p.code) ? map.get(p.code) : 0 })) : []
    ;(inventory || []).forEach(i => {
      if (!PALETTE_CODES.has(i.color)) list.push(i)
    })
    return list
  }, [inventory, inventoryReady])

  // filtered by display mode and threshold
  const filteredInventory = useMemo(() => {
    if (displayMode === 'all') return displayedInventory
    return displayedInventory.filter(it => (it.count || 0) <= threshold)
  }, [displayedInventory, displayMode, threshold])

  // group by first letter of the color code for sectioned display
  const groupedInventory = useMemo(() => {
    // Global ascending order is derived once below, not also sorted per group.
    if (sortOrder === 'asc') return []
    const map = new Map();
    ;(filteredInventory || []).forEach(it => {
      const key = (it.color || '').charAt(0).toUpperCase() || '#'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(it)
    })
    // sort items in each group by count according to sortOrder
    const entries = Array.from(map.entries()).map(([k, items]) => {
      const sorted = items.slice()
      if (sortOrder === 'asc') sorted.sort((a,b) => (Number(a.count)||0) - (Number(b.count)||0))
      else if (sortOrder === 'desc') sorted.sort((a,b) => (Number(b.count)||0) - (Number(a.count)||0))
      return [k, sorted]
    })
    // sort groups by letter
    return entries.sort((a, b) => a[0].localeCompare(b[0]))
  }, [filteredInventory, sortOrder])

  // If user chooses global ascending sort, present a single-column groupedInventory
  const groupedForGrid = useMemo(() => {
    if (sortOrder !== 'asc') return groupedInventory
    // use filteredInventory (respecting displayMode) and sort ascending by count
    const all = (filteredInventory || []).slice()
    all.sort((a,b) => (Number(a.count)||0) - (Number(b.count)||0))
    return [['全部', all]]
  }, [sortOrder, filteredInventory, groupedInventory])

  const lowCount = useMemo(() => {
    return displayedInventory.filter(it => (it.count || 0) <= threshold).length
  }, [displayedInventory, threshold])

  async function fetchInventory(signal) {
    setLoading(true)
    setInventoryError('')
    try {
      const res = await fetch('/api/inventory', { signal })
      const data = await res.json()
      if (!res.ok || !Array.isArray(data)) throw new Error('库存暂时无法更新')
      if (!signal.aborted) { setInventory(data); setInventoryReady(true) }
    } catch (err) {
      if (err.name !== 'AbortError' && !signal.aborted) setInventoryError('无法获取最新库存')
    } finally { if (!signal.aborted) setLoading(false) }
  }

  async function fetchReminders(){
    setRecordsLoading(true)
    try{
      const res = await fetch('/api/reminders')
      const data = await res.json()
      setRecords(Array.isArray(data) ? data : [])
    }catch(err){
      console.error(err)
    }finally{ setRecordsLoading(false) }
  }

  async function handleDeleteRecord(id){
    if (!window.confirm('确认删除该历史记录？该操作不可恢复。')) return;
    setRecordsLoading(true)
    try{
      const res = await fetch(`/api/reminders/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('删除失败')
      setRecords(prev => prev.filter(r => r.id !== id))
    }catch(err){
      console.error(err)
      alert('删除失败')
    }finally{ setRecordsLoading(false) }
  }

  function saveThreshold(v){ localStorage.setItem('pindou-threshold', String(v)); setThreshold(v) }

  return (
    <Box sx={{ p:1 }}>
      <Box sx={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:1,mb:1}}>
        <Typography variant="h5" sx={{fontSize:{xs:'1.1rem',sm:'1.25rem',md:'1.4rem'},lineHeight:1.25}}>库存总览</Typography>
          <Box sx={{display:'flex',alignItems:'center',gap:1}}>
          {/* 色弱模式已移除 */}
          <Stack direction="row" spacing={1}>
            <Button size='small' variant="contained" onClick={() => onNavigate('历史')}>历史</Button>
            <Button size='small' variant="contained" color="success" onClick={()=>{ if (typeof onAction==='function') onAction('补豆') }}>补豆</Button>
            <Button size='small' variant="contained" color="warning" onClick={()=>{ if (typeof onAction==='function') onAction('消耗') }}>消耗</Button>
          </Stack>
        </Box>
      </Box>

      {(!online || inventoryError) && <Alert severity="warning" role="status" sx={{ mb: 1, overflowWrap: 'anywhere' }}
        action={online ? <Button color="inherit" onClick={() => setRetryKey(key => key + 1)}>重试</Button> : undefined}>
        {inventoryReady ? '离线或服务器暂不可用：显示本次页面已读取的旧库存，不保证实时准确，暂不可提交修改。' :
          '离线或服务器暂不可用：库存未能读取，不能把未知数量当成 0，请联网后重试。'}
      </Alert>}
      <Box sx={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:1,mb:1}}>
        <TextField label="阈值预警（颗）" type="number" size="small" value={threshold} onChange={e=>saveThreshold(Number(e.target.value))} sx={{width:110}} />
        <ToggleButtonGroup size="small" value={displayMode} exclusive onChange={(e, v)=>{ if (v) setDisplayMode(v) }}>
          <ToggleButton value="all">{inventoryReady ? '全部: ' + displayedInventory.length + ' 项' : '全部（未加载）'}</ToggleButton>
          <ToggleButton value="low">{inventoryReady ? '低于阈值: ' + lowCount + ' 项' : '低于阈值（未加载）'}</ToggleButton>
        </ToggleButtonGroup>
        <ToggleButtonGroup size="small" value={sortOrder} exclusive onChange={(e, v)=>{ if (v) setSortOrder(v) }}>
          <ToggleButton value="none">默认</ToggleButton>
          <ToggleButton value="asc">升序</ToggleButton>
        </ToggleButtonGroup>
        
      </Box>

      

      

      {loading && <Typography>加载中...</Typography>}

      {!loading && inventoryReady && (displayMode === 'all' ? displayedInventory.length===0 : filteredInventory.length===0) && <Typography>暂无库存记录</Typography>}

      

      {/* 虚拟化卡片列表：每行为卡片风格，移动优先单列 */}
      {filteredInventory.length > 0 && (
        <InventoryGrid groupedInventory={groupedForGrid} findPalette={findPalette} />
      )}

      
    </Box>
  )
}

export default Inventory
