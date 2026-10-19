import React, { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import Button from '@mui/material/Button'
import ColorSwatch from './ColorSwatch'
import InventoryGrid from './InventoryGrid'
import MARD from './colorPalettes/mard.json'
import { toDatetimeLocal, fromDatetimeLocal } from './dateTime'

function findPalette(code){
  return MARD.find(p => p.code === code)
}

export default function History({ active = true, onNavigate = ()=>{}, refreshKey }){
  const [records, setRecords] = useState([])
  const [recordsLoading, setRecordsLoading] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editData, setEditData] = useState(null)

  function resolveImageUrl(imagePath){
    if (!imagePath) return null
    if (/^https?:\/\//i.test(imagePath) || imagePath.startsWith('/')) return imagePath
    const parts = imagePath.split(/[\\/]/)
    const filename = parts[parts.length-1]
    return `/api/upload/${filename}`
  }

  async function fetchReminders(signal){
    setRecordsLoading(true)
    try{
      const res = await fetch('/api/reminders', { signal })
      const data = await res.json()
      if (!signal.aborted) setRecords(Array.isArray(data) ? data : [])
    }catch(err){
      if (err.name !== 'AbortError') console.error(err)
    }finally{ if (!signal.aborted) setRecordsLoading(false) }
  }

  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    fetchReminders(controller.signal)
    return () => controller.abort()
  }, [active, refreshKey])

  async function handleDeleteRecord(id){
    if (!window.confirm('确认删除该历史记录？该操作不可恢复。')) return;
    setRecordsLoading(true)
    try{
      const res = await fetch(`/api/reminders/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('删除失败')
      setRecords(prev => prev.filter(r => r.id !== id))
    }catch(err){ console.error(err); alert('删除失败') }finally{ setRecordsLoading(false) }
  }

  function startEdit(rec){
    // clone record for editing
    const cloned = {
      id: rec.id,
      operation: rec.operation,
      occurred_at: rec.occurred_at,
      note: rec.note || '',
      image_path: rec.image_path || null,
      items: Array.isArray(rec.items) ? rec.items.map(it => ({ color: it.color, count: Number(it.count) || 0 })) : [],
    }
    setEditingId(rec.id)
    setEditData(cloned)
  }

  function cancelEdit(){
    setEditingId(null)
    setEditData(null)
  }

  function updateItemCount(index, value){
    setEditData(prev => {
      const next = { ...prev, items: prev.items.map((it,i) => i === index ? { ...it, count: Number(value) } : it) }
      return next
    })
  }

  function updateItemColor(index, value){
    setEditData(prev => ({ ...prev, items: prev.items.map((it,i) => i === index ? { ...it, color: value } : it) }))
  }

  function addItem(){
    const defaultCode = (MARD && MARD[0] && MARD[0].code) || ''
    setEditData(prev => ({ ...prev, items: [ ...prev.items, { color: defaultCode, count: 1 } ] }))
  }

  function removeItem(index){
    setEditData(prev => ({ ...prev, items: prev.items.filter((_,i) => i !== index) }))
  }

  function updateNote(value){ setEditData(prev => ({ ...prev, note: value })) }

  function updateOccurredAt(value){ setEditData(prev => ({ ...prev, occurred_at: value })) }

  async function saveEdit(){
    if (!editData || !editingId) return
    setRecordsLoading(true)
    try{
      // validate items: must be non-empty and counts positive integers
      const itemsForSave = (editData.items || []).map(it => ({ color: it.color, count: Number(it.count) }))
      if (!Array.isArray(itemsForSave) || itemsForSave.length === 0) throw new Error('items must be non-empty')
      for (const it of itemsForSave) {
        if (!it.color || !Number.isInteger(it.count) || it.count <= 0) throw new Error('each item must have color and positive integer count')
      }

      const body = {
        operation: editData.operation,
        items: itemsForSave,
        occurred_at: editData.occurred_at,
        note: editData.note,
        image_path: editData.image_path,
      }
      const res = await fetch(`/api/reminders/${editingId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error('保存失败')
      const updated = await res.json()
      setRecords(prev => prev.map(r => r.id === updated.id ? updated : r))
      cancelEdit()
    }catch(err){ console.error(err); alert('保存失败') }finally{ setRecordsLoading(false) }
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
                      />
                    </Box>
                  )}
                  {r.note && <Typography variant="caption" sx={{ color:'#333' }}>{r.note}</Typography>}
                  <IconButton size="small" onClick={() => startEdit(r)} aria-label="编辑记录">
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" onClick={() => handleDeleteRecord(r.id)} aria-label="删除记录">
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Box>
              <Box sx={{ mt:0.5 }}>
                {editingId === r.id && editData ? (
                  <Box sx={{ p:1, border:'1px dashed #ddd', borderRadius:1, mb:1 }}>
                    <Box sx={{ display:'flex', gap:1, alignItems:'center', mb:1 }}>
                      <Typography variant="body2">编辑时间：</Typography>
                      <input type="datetime-local" aria-label="编辑时间" value={toDatetimeLocal(editData.occurred_at)} onChange={e => {
                          const value = e.target.value
                          try { updateOccurredAt(value ? fromDatetimeLocal(value) : '') }
                          catch { updateOccurredAt('') }
                        }} />
                    </Box>
                    <Box sx={{ display:'flex', gap:1, alignItems:'center', mb:1 }}>
                      <Typography variant="body2">备注：</Typography>
                      <input style={{ flex:1 }} value={editData.note} onChange={e => updateNote(e.target.value)} />
                    </Box>
                    <Box>
                      <Typography variant="body2" sx={{ mb:0.5 }}>项数量：</Typography>
                      {editData.items.map((it, idx) => (
                        <Box key={idx} sx={{ display:'flex', alignItems:'center', gap:1, mb:0.5 }}>
                          <ColorSwatch code={it.color} hex={findPalette(it.color)?.hex || '#fff'} />
                          <select value={it.color} onChange={e => updateItemColor(idx, e.target.value)}>
                            {MARD.map(p => <option key={p.code} value={p.code}>{p.code}</option>)}
                          </select>
                          <input type="number" value={it.count} min={0} onChange={e => updateItemCount(idx, e.target.value)} />
                          <IconButton size="small" onClick={() => removeItem(idx)} aria-label="删除项">
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      ))}
                      <Box sx={{ mt:1 }}>
                        <Button size="small" onClick={addItem}>添加色号</Button>
                      </Box>
                    </Box>
                    <Box sx={{ display:'flex', gap:1, mt:1 }}>
                      <Button size="small" variant="contained" onClick={saveEdit}>保存</Button>
                      <Button size="small" variant="outlined" onClick={cancelEdit}>取消</Button>
                    </Box>
                  </Box>
                ) : null}
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
