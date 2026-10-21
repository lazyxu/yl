import React, { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogActions from '@mui/material/DialogActions'
import Alert from '@mui/material/Alert'
import ColorSwatch from './ColorSwatch'
import InventoryGrid from './InventoryGrid'
import MARD from './colorPalettes/mard.json'
import { findPalette } from './palette'
import { toDatetimeLocal, fromDatetimeLocal } from './dateTime'



export default function History({ active = true, refreshKey }){
  const [records, setRecords] = useState([])
  const [recordsLoading, setRecordsLoading] = useState(false)
  const [recordsReady, setRecordsReady] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [online, setOnline] = useState(() => navigator.onLine)
  const [retryKey, setRetryKey] = useState(0)
  const [editingId, setEditingId] = useState(null)
  const [editData, setEditData] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [mutationError, setMutationError] = useState('')

  function resolveImageUrl(imagePath){
    if (!imagePath) return null
    if (/^https?:\/\//i.test(imagePath) || imagePath.startsWith('/')) return imagePath
    const parts = imagePath.split(/[\\/]/)
    const filename = parts[parts.length-1]
    return `/api/upload/${filename}`
  }

  async function fetchReminders(signal){
    setRecordsLoading(true)
    setLoadError('')
    try{
      const res = await fetch('/api/reminders', { signal })
      const data = await res.json()
      if (!res.ok || !Array.isArray(data)) throw new Error('历史记录暂时无法获取')
      if (!signal.aborted) { setRecords(data); setRecordsReady(true) }
    }catch(err){
      if (err.name !== 'AbortError' && !signal.aborted) setLoadError('历史记录无法连接服务器')
    }finally{ if (!signal.aborted) setRecordsLoading(false) }
  }

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
    fetchReminders(controller.signal)
    return () => controller.abort()
  }, [active, refreshKey, retryKey])

  async function handleDeleteRecord(){
    const id = pendingDelete
    if (id == null || deleting || !online || loadError) return
    setDeleting(true)
    setMutationError('')
    try{
      const res = await fetch(`/api/reminders/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('删除失败')
      setRecords(prev => prev.filter(r => r.id !== id))
      setPendingDelete(null)
    }catch(err){
      console.error(err)
      setMutationError('删除失败，请确认网络连接后重试')
    }finally{ setDeleting(false) }
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
    if (!editData || !editingId || !online || loadError) return
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
    }catch(err){ console.error(err); setMutationError('保存失败，请检查填写内容与网络连接') }finally{ setRecordsLoading(false) }
  }

  return (
    <>
    <Box className="pindou-page pindou-history">
      {mutationError && <Alert severity="error" role="alert"
        action={<Button color="inherit" onClick={() => setMutationError('')}>关闭</Button>}>
        {mutationError}
      </Alert>}
      {(!online || loadError) && <Alert severity="warning" role="status" sx={{ mb: 1, overflowWrap: 'anywhere' }}
        action={online ? <Button color="inherit" onClick={() => setRetryKey(key => key + 1)}>重试</Button> : undefined}>
        {recordsReady ? '离线或服务器暂不可用：以下为本次页面先前读取的记录，不保证最新，编辑和删除已停用。' :
          '离线或服务器暂不可用：无法获取历史记录，这不代表没有记录，请联网后重试。'}
      </Alert>}
      {recordsLoading && <Typography role="status" color="text.secondary" variant="body2">正在读取历史…</Typography>}
      {!recordsLoading && recordsReady && records.length === 0 && <Typography className="pindou-empty-state" role="status">暂无历史记录</Typography>}
      {!recordsLoading && records.length > 0 && (
        <Box className="pindou-history-list" sx={{ display:'flex', flexDirection:'column', gap:1.5 }}>
          {records.map(r => (
            <Box key={r.id} className="pindou-history-card">
              <Box className="pindou-history-head">
                <Box className="pindou-history-meta">
                  <Typography variant="body2" sx={{ fontWeight: 750 }}>{r.operation}</Typography>
                  <Typography variant="caption" sx={{ color: '#617183' }}>
                    {new Date(r.occurred_at).toLocaleString()}
                  </Typography>
                </Box>
                <Box className="pindou-history-actions">
                  <IconButton disabled={!online || Boolean(loadError) || deleting}
                    onClick={() => startEdit(r)} aria-label="编辑记录">
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton disabled={!online || Boolean(loadError) || deleting}
                    onClick={() => setPendingDelete(r.id)} aria-label="删除记录">
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Box>
              {(r.image_path || r.note) && <Box className="pindou-history-media">
                {r.image_path && <img src={resolveImageUrl(r.image_path)}
                  alt="历史记录图片" loading="lazy" />}
                {r.note && <Typography variant="body2" className="pindou-history-note">
                  {r.note}
                </Typography>}
              </Box>}
              <Box sx={{ mt:0.5 }}>
                {editingId === r.id && editData ? (
                  <Box className="pindou-history-editor">
                    <Box className="pindou-edit-field">
                      <Typography variant="body2">编辑时间：</Typography>
                      <input type="datetime-local" aria-label="编辑时间" value={toDatetimeLocal(editData.occurred_at)} onChange={e => {
                          const value = e.target.value
                          try { updateOccurredAt(value ? fromDatetimeLocal(value) : '') }
                          catch { updateOccurredAt('') }
                        }} />
                    </Box>
                    <Box className="pindou-edit-field">
                      <Typography variant="body2">备注：</Typography>
                      <input aria-label="编辑备注" value={editData.note} onChange={e => updateNote(e.target.value)} />
                    </Box>
                    <Box>
                      <Typography variant="body2" sx={{ mb:0.5 }}>项数量：</Typography>
                      {editData.items.map((it, idx) => (
                        <Box key={idx} className="pindou-edit-item">
                          <ColorSwatch code={it.color} hex={findPalette(it.color)?.hex || '#fff'} />
                          <select aria-label={`第${idx + 1}项色号`} value={it.color} onChange={e => updateItemColor(idx, e.target.value)}>
                            {MARD.map(p => <option key={p.code} value={p.code}>{p.code}</option>)}
                          </select>
                          <input type="number" aria-label={`第${idx + 1}项数量`} value={it.count} min={0} inputMode="numeric"
                            onChange={e => updateItemCount(idx, e.target.value)} />
                          <IconButton size="small" onClick={() => removeItem(idx)} aria-label="删除项">
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      ))}
                      <Box sx={{ mt:1 }}>
                        <Button size="small" onClick={addItem}>添加色号</Button>
                      </Box>
                    </Box>
                    <Box className="pindou-history-edit-actions">
                      <Button size="small" variant="contained" disabled={!online || Boolean(loadError)} onClick={saveEdit}>保存</Button>
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
    <Dialog open={pendingDelete != null} className="pindou-confirm-dialog"
      aria-labelledby="pindou-delete-title" aria-describedby="pindou-delete-copy"
      onClose={() => { if (!deleting) setPendingDelete(null) }} fullWidth maxWidth="xs">
      <DialogTitle id="pindou-delete-title">删除历史记录？</DialogTitle>
      <DialogContent><DialogContentText id="pindou-delete-copy">
        删除后会同步调整库存，且无法撤销。确认删除这条记录？
      </DialogContentText></DialogContent>
      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button disabled={deleting} onClick={() => setPendingDelete(null)}>取消</Button>
        <Button color="error" variant="contained" disabled={deleting || !online || Boolean(loadError)}
          onClick={handleDeleteRecord}>{deleting ? '正在删除…' : '确认删除'}</Button>
      </DialogActions>
    </Dialog>
    </>
  )
}
