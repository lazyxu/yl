import React, { useEffect, useState, useCallback } from 'react'
import './PindouReminder.css'
import MARD from './colorPalettes/mard.json'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Checkbox from '@mui/material/Checkbox'
import Badge from '@mui/material/Badge'
// removed color-blind controls
import IconButton from '@mui/material/IconButton'
import DeleteIcon from '@mui/icons-material/Delete'
import Grid from '@mui/material/Grid'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'

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
    <Box sx={{ position: 'relative' }}>
      <Card variant="outlined" sx={{ minHeight:120, touchAction:'manipulation' }} role="listitem" aria-label={`${it.color}，${cnt} 颗`}>
        <CardContent sx={{ p:0.5, minHeight:44 }}>
          <Box sx={{ display:'flex', alignItems:'center', gap:0.5, minHeight:44 }}>
            <Box sx={{ width:44, height:44, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Checkbox aria-label={`选择 ${it.color} 库存 ${cnt}`} checked={isSelected} onChange={(e)=>onSelectToggle(it.color, e.target.checked)} sx={{padding:0}} />
            </Box>
            <Box sx={{ width:40, height:28, background:hex, border:'1px solid #ddd', borderRadius:1, display:'flex', alignItems:'center', justifyContent:'center', color:textColor, fontWeight:700, fontSize:{xs:'11px', sm:'12px'} }} title={`${it.color} ${hex}`}>
              <span aria-hidden>{it.color}</span>
            </Box>
            <Box sx={{ flex:1, minWidth:0 }} />
          </Box>
        </CardContent>
      </Card>

      {/* Low-stock badge (top-left) */}
      {low && (
        <Box sx={{ position: 'absolute', top: 6, left: 6 }}>
          <Box sx={{ backgroundColor: '#d32f2f', color: '#fff', borderRadius: 8, px:1, py:'2px', fontSize:12, fontWeight:700 }} aria-hidden>
            低
          </Box>
        </Box>
      )}

      {/* Count badge in top-right (small circular Badge) */}
      <Badge badgeContent={cnt} overlap="circular" sx={{
        position:'absolute', top:8, right:8,
        '& .MuiBadge-badge': {
          minWidth: 18,
          height: 18,
          borderRadius: '50%',
          fontSize: 11,
          fontWeight: 700,
          backgroundColor: '#fff',
          color: '#000',
          border: '1px solid rgba(0,0,0,0.12)',
          boxShadow: 1,
          lineHeight: '18px'
        }
      }}>
        <Box sx={{ width: 0, height: 0 }} />
      </Badge>
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
  // color-blind mode removed

  useEffect(() => { fetchInventory() }, [])
  useEffect(() => { if (typeof refreshKey !== 'undefined') fetchInventory() }, [refreshKey])

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
    <Box sx={{pb:{xs:'76px', sm:2}}}>
      <Box sx={{display:'flex',alignItems:'center',justifyContent:'space-between',mb:2}}>
        <Typography variant="h5" sx={{fontSize:{xs:'1.1rem',sm:'1.25rem',md:'1.4rem'},lineHeight:1.25}}>库存总览</Typography>
        <Box sx={{display:'flex',alignItems:'center',gap:1}}>
          {/* 色弱模式已移除 */}
          <Stack direction="row" spacing={1}>
            <Button variant="contained" onClick={()=>{ if (typeof onAction==='function') onAction('补豆') }}>补豆</Button>
            <Button variant="contained" color="error" onClick={()=>{ if (typeof onAction==='function') onAction('消耗') }}>消耗</Button>
          </Stack>
        </Box>
      </Box>

      <Box sx={{display:'flex',alignItems:'center',gap:2,mb:2}}>
        <TextField label="阈值预警（颗）" type="number" size="small" value={threshold} onChange={e=>saveThreshold(Number(e.target.value))} sx={{width:120}} />
        <Button onClick={fetchInventory}>刷新</Button>
        <Box sx={{ml:1, display:'flex', gap:1, alignItems:'center'}}>
          <Button size="small" onClick={() => {
            // 全选所有库存项
            const codes = inventory.map(it => it.color)
            setSelected(codes)
          }}>全选</Button>
          <Button size="small" onClick={() => {
            // 按当前筛选（此处即当前 inventory）全选
            const codes = inventory.map(it => it.color)
            setSelected(codes)
          }}>按筛选全选</Button>
          <Button size="small" onClick={() => setSelected([])}>取消选择</Button>
        </Box>
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

      {!loading && inventory.length===0 && <Typography>暂无库存记录</Typography>}

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
            const it = inventory.find(x => x.color === code)
            return { color: code, count: it ? it.count : 0 }
          })
          if (typeof onAction === 'function') onAction('消耗', rows)
        }}>清空选中</Button>
        <Button onClick={()=>{ setSelected([]); setBulkCountInput('') }}>清除选择</Button>
      </Box>

      {/* 虚拟化卡片列表：每行为卡片风格，移动优先单列 */}
      {inventory.length > 0 && (
        <Grid container spacing={1}>
          {inventory.map((it, index) => {
            const isSelected = selected.indexOf(it.color) > -1
            return (
              <Grid item xs={6} sm={4} md={3} lg={2} key={it.color}>
                <ColorCard
                  it={it}
                  findPalette={findPalette}
                  threshold={threshold}
                  isSelected={isSelected}
                  onSelectToggle={handleSelectToggle}
                  onConsume={handleConsume}
                />
              </Grid>
            )
          })}
        </Grid>
      )}

      {/* 底部固定批量操作面板（移动优先） */}
      <Box sx={{position:'fixed',bottom:0,left:0,right:0,p:1,background:'#fff',borderTop:'1px solid #eee',display:'flex',gap:1,alignItems:'center',justifyContent:'space-between'}}>
        <Box sx={{display:'flex',alignItems:'center',gap:1}}>
          <Typography variant="body2">已选 {selected.length} 项</Typography>
        </Box>
        <Box sx={{display:'flex',gap:1}}>
          <Button size="small" variant="contained" onClick={() => {
            const cnt = Number(bulkCountInput)
            if (!selected || selected.length===0) return alert('请先选择色号')
            if (!Number.isInteger(cnt) || cnt<=0) return alert('数量需为正整数')
            const rows = selected.map(code => ({ color: code, count: cnt }))
            if (typeof onAction === 'function') onAction('补豆', rows)
          }}>补豆</Button>
          <Button size="small" variant="contained" color="error" onClick={() => {
            const cnt = Number(bulkCountInput)
            if (!selected || selected.length===0) return alert('请先选择色号')
            if (!Number.isInteger(cnt) || cnt<=0) return alert('数量需为正整数')
            const rows = selected.map(code => ({ color: code, count: cnt }))
            if (typeof onAction === 'function') onAction('消耗', rows)
          }}>消耗</Button>
          <Button size="small" onClick={() => { setSelected([]); setBulkCountInput('') }}>清除</Button>
        </Box>
      </Box>
    </Box>
  )
}

export default Inventory
