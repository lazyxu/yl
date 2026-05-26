import React, { useEffect, useState, useCallback, useMemo } from 'react'
import MARD from './colorPalettes/mard.json'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
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

function Inventory({ onAction, refreshKey }) {
  const [inventory, setInventory] = useState([])
  const [threshold, setThreshold] = useState(() => {
    const v = localStorage.getItem('pindou-threshold')
    return v ? Number(v) : 20
  })
  const [bulkCountInput, setBulkCountInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [records, setRecords] = useState([])
  const [recordsLoading, setRecordsLoading] = useState(false)
  const [displayMode, setDisplayMode] = useState('all') // 'all' | 'low'
  // color-blind mode removed

  useEffect(() => { fetchInventory() }, [])
  useEffect(() => { if (typeof refreshKey !== 'undefined') fetchInventory() }, [refreshKey])

  useEffect(() => { fetchReminders() }, [])
  useEffect(() => { if (typeof refreshKey !== 'undefined') fetchReminders() }, [refreshKey])

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

  // removed onConsume handler — consumption is triggered from explicit UI elsewhere

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
        
      </Box>

      {/* 补豆 / 消耗 历史记录 */}
      <Box sx={{mb:1}}>
        <Typography variant="subtitle1" sx={{mb:0.5}}>补豆 / 消耗 历史</Typography>
        {recordsLoading && <Typography>加载中...</Typography>}
        {!recordsLoading && records.length === 0 && <Typography>暂无历史记录</Typography>}
        {!recordsLoading && records.length > 0 && (
          <Box sx={{ display:'flex', flexDirection:'column', gap:1 }}>
            {records.map(r => (
              <Box key={r.id} sx={{ p:1, border:'1px solid #f0f0f0', borderRadius:1, display:'flex', flexDirection:'column' }}>
                <Box sx={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:1 }}>
                  <Box sx={{ display:'flex', alignItems:'center', gap:1 }}>
                    <Typography variant="body2" sx={{ fontWeight:700 }}>{r.operation}</Typography>
                    <Typography variant="caption" sx={{ color:'#666' }}>{new Date(r.occurred_at).toLocaleString()}</Typography>
                  </Box>
                  <Box sx={{ display:'flex', alignItems:'center', gap:1 }}>
                    {r.note && <Typography variant="caption" sx={{ color:'#333' }}>{r.note}</Typography>}
                    <IconButton size="small" onClick={() => handleDeleteRecord(r.id)} aria-label="删除记录">
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </Box>
                <Box sx={{ mt:0.5, display:'flex', gap:0.5, flexWrap:'wrap', alignItems:'center' }}>
                  {(r.items || []).map((it, idx) => {
                    const p = findPalette(it.color)
                    const hex = p ? p.hex : '#ffffff'
                    return (
                      <Box key={idx} sx={{ display:'inline-flex', alignItems:'center', gap:0.5, p:0.5, borderRadius:1, border:'1px solid #f0f0f0', background:'#fff' }}>
                        <Box sx={{ width:14, height:14, background: hex, border: '1px solid rgba(0,0,0,0.06)', borderRadius:0.5 }} aria-hidden />
                        <Typography variant="caption">{`${it.color} x ${it.count}`}</Typography>
                      </Box>
                    )
                  })}
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Box>

      

      {loading && <Typography>加载中...</Typography>}

      {!loading && (displayMode === 'all' ? displayedInventory.length===0 : filteredInventory.length===0) && <Typography>暂无库存记录</Typography>}

      

      {/* 虚拟化卡片列表：每行为卡片风格，移动优先单列 */}
      {filteredInventory.length > 0 && (
        <Box sx={{ pr:0 }}>
          {groupedInventory.map(([letter, items]) => (
            <Box key={letter} sx={{ mb: 1 }}>
              <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: 'repeat(auto-fill, minmax(64px, 1fr))', sm: 'repeat(auto-fill, minmax(72px, 1fr))', md: 'repeat(auto-fill, minmax(84px, 1fr))' } }}>
                {items.map((it) => (
                    <Box key={it.color} sx={{ p: 0, display: 'flex', alignItems: 'center' }}>
                      <ColorCard
                        it={it}
                        findPalette={findPalette}
                        threshold={threshold}
                      />
                    </Box>
                ))}
              </Box>
            </Box>
          ))}
        </Box>
      )}

      
    </Box>
  )
}

export default Inventory
