import React, { useEffect, useState, useCallback } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import DeleteIcon from '@mui/icons-material/Delete'
import Button from '@mui/material/Button'
import ColorSwatch from './ColorSwatch'
import InventoryGrid from './InventoryGrid'
import MARD from './colorPalettes/mard.json'

function findPalette(code){
  return MARD.find(p => p.code === code)
}

export default function History({ onNavigate = ()=>{}, refreshKey }){
  const [records, setRecords] = useState([])
  const [recordsLoading, setRecordsLoading] = useState(false)

  function resolveImageUrl(imagePath){
    if (!imagePath) return null
    if (/^https?:\/\//i.test(imagePath) || imagePath.startsWith('/')) return imagePath
    const parts = imagePath.split(/[\\\/]/)
    const filename = parts[parts.length-1]
    return `/api/upload/${filename}`
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

  useEffect(() => { fetchReminders() }, [refreshKey])

  async function handleDeleteRecord(id){
    if (!window.confirm('确认删除该历史记录？该操作不可恢复。')) return;
    setRecordsLoading(true)
    try{
      const res = await fetch(`/api/reminders/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('删除失败')
      setRecords(prev => prev.filter(r => r.id !== id))
    }catch(err){ console.error(err); alert('删除失败') }finally{ setRecordsLoading(false) }
  }

  return (
    <Box sx={{ p:1 }}>
      <Box sx={{ display:'flex', alignItems:'center', justifyContent:'space-between', mb:1 }}>
        <Typography variant="h6">补豆 / 消耗 历史</Typography>
        <Box>
          <Button size="small" onClick={() => onNavigate('拼豆')}>返回</Button>
        </Box>
      </Box>

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
                  {r.image_path && (
                    <Box sx={{ display:'inline-block', mr:0.5 }}>
                      <img
                        src={resolveImageUrl(r.image_path)}
                        alt="record"
                        style={{ width:56, height:56, objectFit:'cover', borderRadius:6, border:'1px solid #eee', cursor:'pointer' }}
                        onClick={() => { const u = resolveImageUrl(r.image_path); if (u) { const w = window.open(); if (w) w.document.body.innerHTML = `<img src="${u}" style="max-width:100%">` } }}
                      />
                    </Box>
                  )}
                  {r.note && <Typography variant="caption" sx={{ color:'#333' }}>{r.note}</Typography>}
                  <IconButton size="small" onClick={() => handleDeleteRecord(r.id)} aria-label="删除记录">
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Box>
              <Box sx={{ mt:0.5 }}>
                {(() => {
                  const items = Array.isArray(r.items) ? r.items : []
                  const map = new Map()
                  items.forEach(it => {
                    const key = (it.color || '').charAt(0).toUpperCase() || '#'
                    if (!map.has(key)) map.set(key, [])
                    map.get(key).push(it)
                  })
                  const grouped = Array.from(map.entries()).sort((a,b)=>a[0].localeCompare(b[0]))
                  return <InventoryGrid groupedInventory={grouped} findPalette={findPalette} showZero={false} />
                })()}
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}
