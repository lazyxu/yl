import React, { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
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

function resolveImageUrl(imagePath) {
  if (!imagePath) return null
  if (/^https?:\/\//i.test(imagePath) || imagePath.startsWith('/')) return imagePath
  const parts = imagePath.split(/[\\/]/)
  return '/api/upload/' + encodeURIComponent(parts[parts.length - 1])
}

function resolveThumbnailUrl(imagePath) {
  const url = resolveImageUrl(imagePath)
  // Do not download remote/legacy full-size images into the compact list.
  if (!url || !/^\/api\/upload\/[^/?#]+$/.test(url)) return null
  return url + '/thumb'
}

function countItems(items) {
  if (!Array.isArray(items)) return 0
  return items.reduce((sum, item) => sum + (Number(item.count) || 0), 0)
}

function formatCount(value) {
  return Number(value).toLocaleString('zh-CN')
}

function HistoryThumbnail({ src }) {
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [src])
  if (!src || broken) return <ImageOutlinedIcon color="disabled" aria-hidden="true" />
  return <img src={src} alt="历史记录缩略图" loading="lazy" decoding="async"
    onError={() => setBroken(true)} />
}

export default function History({ active = true, refreshKey }) {
  const [records, setRecords] = useState([])
  const [recordsLoading, setRecordsLoading] = useState(false)
  const [recordsReady, setRecordsReady] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [summary, setSummary] = useState(null)
  const [summaryError, setSummaryError] = useState('')
  const [summaryRefreshKey, setSummaryRefreshKey] = useState(0)
  const [online, setOnline] = useState(() => navigator.onLine)
  const [retryKey, setRetryKey] = useState(0)
  const [expandedId, setExpandedId] = useState(null)
  const [viewImage, setViewImage] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editData, setEditData] = useState(null)
  const [saving, setSaving] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [mutationError, setMutationError] = useState('')

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
    const fetchReminders = async () => {
      setRecordsLoading(true)
      setLoadError('')
      try {
        const res = await fetch('/api/reminders', { signal: controller.signal })
        const data = await res.json()
        if (!res.ok || !Array.isArray(data)) throw new Error('历史记录暂时无法获取')
        if (!controller.signal.aborted) { setRecords(data); setRecordsReady(true) }
      } catch (err) {
        if (err.name !== 'AbortError' && !controller.signal.aborted)
          setLoadError('历史记录无法连接服务器')
      } finally {
        if (!controller.signal.aborted) setRecordsLoading(false)
      }
    }
    fetchReminders()
    return () => controller.abort()
  }, [active, refreshKey, retryKey])

  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    const fetchSummary = async () => {
      setSummaryError('')
      try {
        const res = await fetch('/api/reminders/summary', { signal: controller.signal })
        const data = await res.json()
        const added = Number(data.added)
        const consumed = Number(data.consumed)
        if (!res.ok || !Number.isSafeInteger(added) || !Number.isSafeInteger(consumed) ||
          added < 0 || consumed < 0) throw new Error('历史累计统计数据无效')
        if (!controller.signal.aborted) setSummary({ added, consumed })
      } catch (err) {
        if (err.name !== 'AbortError' && !controller.signal.aborted) setSummaryError('历史累计统计暂不可用')
      }
    }
    fetchSummary()
    return () => controller.abort()
  }, [active, refreshKey, retryKey, summaryRefreshKey])

  async function handleDeleteRecord() {
    const id = pendingDelete
    if (id == null || deleting || !online || loadError) return
    setDeleting(true)
    setMutationError('')
    try {
      const res = await fetch('/api/reminders/' + id, { method: 'DELETE' })
      if (!res.ok) throw new Error('删除失败')
      setRecords(prev => prev.filter(r => r.id !== id))
      setExpandedId(prev => prev === id ? null : prev)
      setPendingDelete(null)
      setSummaryRefreshKey(key => key + 1)
    } catch (err) {
      console.error(err)
      setMutationError('删除失败，请确认网络连接后重试')
    } finally { setDeleting(false) }
  }

  function startEdit(rec) {
    const cloned = {
      id: rec.id,
      operation: rec.operation,
      occurred_at: rec.occurred_at,
      note: rec.note || '',
      image_path: rec.image_path || null,
      items: Array.isArray(rec.items) ? rec.items.map(it => ({ color: it.color, count: Number(it.count) || 0 })) : [],
    }
    setExpandedId(rec.id)
    setEditingId(rec.id)
    setEditData(cloned)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditData(null)
  }

  function updateItemCount(index, value) {
    setEditData(prev => ({ ...prev, items: prev.items.map((it, i) =>
      i === index ? { ...it, count: Number(value) } : it) }))
  }

  function updateItemColor(index, value) {
    setEditData(prev => ({ ...prev, items: prev.items.map((it, i) =>
      i === index ? { ...it, color: value } : it) }))
  }

  function addItem() {
    const defaultCode = (MARD && MARD[0] && MARD[0].code) || ''
    setEditData(prev => ({ ...prev, items: [...prev.items, { color: defaultCode, count: 1 }] }))
  }

  function removeItem(index) {
    setEditData(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }))
  }

  async function saveEdit() {
    if (!editData || editingId == null || saving || !online || loadError) return
    setSaving(true)
    setMutationError('')
    try {
      const itemsForSave = (editData.items || []).map(it => ({ color: it.color, count: Number(it.count) }))
      if (itemsForSave.length === 0 || itemsForSave.some(it =>
        !it.color || !Number.isSafeInteger(it.count) || it.count <= 0)) {
        throw new Error('色号与数量无效')
      }
      const body = {
        operation: editData.operation,
        items: itemsForSave,
        occurred_at: editData.occurred_at,
        note: editData.note,
        image_path: editData.image_path,
      }
      const res = await fetch('/api/reminders/' + editingId, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('保存失败')
      const updated = await res.json()
      setRecords(prev => prev.map(r => r.id === updated.id ? updated : r))
      setSummaryRefreshKey(key => key + 1)
      cancelEdit()
    } catch (err) {
      console.error(err)
      setMutationError('保存失败，请检查填写内容与网络连接')
    } finally { setSaving(false) }
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
        {summaryError && online && !loadError && <Alert severity="warning" role="status">
          {summaryError}，请稍后重试。
        </Alert>}
        {summary && <Box className="pindou-history-totals" role="group" aria-label="全部历史累计">
          <Box className="pindou-history-total">
            <Typography variant="caption">累计补豆</Typography>
            <Typography className="pindou-history-total-number" aria-label={'累计补豆 ' + formatCount(summary.added) + ' 颗'}>
              {formatCount(summary.added)} <small>颗</small>
            </Typography>
          </Box>
          <Box className="pindou-history-total">
            <Typography variant="caption">累计消耗</Typography>
            <Typography className="pindou-history-total-number" aria-label={'累计消耗 ' + formatCount(summary.consumed) + ' 颗'}>
              {formatCount(summary.consumed)} <small>颗</small>
            </Typography>
          </Box>
        </Box>}
        {recordsLoading && <Typography role="status" color="text.secondary" variant="body2">正在读取历史…</Typography>}
        {!recordsLoading && recordsReady && records.length === 0 &&
          <Typography className="pindou-empty-state" role="status">暂无历史记录</Typography>}
        {records.length > 0 && <Box className="pindou-history-list">
          {records.map(r => {
            const expanded = expandedId === r.id
            const count = countItems(r.items)
            const originalUrl = resolveImageUrl(r.image_path)
            const thumbnailUrl = resolveThumbnailUrl(r.image_path)
            return <Box key={r.id} className="pindou-history-card">
              <Box className="pindou-history-head">
                {originalUrl ? (
                  <button type="button" className="pindou-history-thumbnail"
                    aria-label="查看记录图片" onClick={() => setViewImage({ url: originalUrl, id: r.id })}>
                    <HistoryThumbnail src={thumbnailUrl} />
                  </button>
                ) : <Box className="pindou-history-image-empty"><ImageOutlinedIcon color="disabled" aria-hidden="true" /></Box>}
                <Button className="pindou-history-toggle" type="button" color="inherit"
                  onClick={() => setExpandedId(expanded ? null : r.id)}
                  aria-label={(expanded ? '收起记录 ' : '展开记录 ') + r.id}
                  aria-expanded={expanded} aria-controls={'pindou-history-details-' + r.id}>
                  <span className="pindou-history-meta">
                    <Typography variant="caption" component="span">
                      {new Date(r.occurred_at).toLocaleString()}
                    </Typography>
                    <Typography className="pindou-history-quantity" component="span">
                      {r.operation} · {formatCount(count)} 颗
                    </Typography>
                  </span>
                  <ExpandMoreIcon className={expanded ? 'pindou-history-arrow is-expanded' : 'pindou-history-arrow'} />
                </Button>
              </Box>
              {expanded && <Box className="pindou-history-details" id={'pindou-history-details-' + r.id}>
                {r.note && <Typography variant="body2" className="pindou-history-note">{r.note}</Typography>}
                <Box className="pindou-history-actions">
                  <IconButton disabled={!online || Boolean(loadError) || deleting || saving}
                    onClick={() => startEdit(r)} aria-label="编辑记录">
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton disabled={!online || Boolean(loadError) || deleting || saving}
                    onClick={() => setPendingDelete(r.id)} aria-label="删除记录">
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
                {editingId === r.id && editData && <Box className="pindou-history-editor">
                  <Box className="pindou-edit-field">
                    <Typography variant="body2">编辑时间：</Typography>
                    <input type="datetime-local" aria-label="编辑时间" value={toDatetimeLocal(editData.occurred_at)} onChange={e => {
                      const value = e.target.value
                      try { setEditData(prev => ({ ...prev, occurred_at: value ? fromDatetimeLocal(value) : '' })) }
                      catch { setEditData(prev => ({ ...prev, occurred_at: '' })) }
                    }} />
                  </Box>
                  <Box className="pindou-edit-field">
                    <Typography variant="body2">备注：</Typography>
                    <input aria-label="编辑备注" value={editData.note}
                      onChange={e => setEditData(prev => ({ ...prev, note: e.target.value }))} />
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ mb: 0.5 }}>项数量：</Typography>
                    {editData.items.map((it, idx) => <Box key={idx} className="pindou-edit-item">
                      <ColorSwatch code={it.color} hex={findPalette(it.color)?.hex || '#fff'} />
                      <select aria-label={'第' + (idx + 1) + '项色号'} value={it.color}
                        onChange={e => updateItemColor(idx, e.target.value)}>
                        {MARD.map(p => <option key={p.code} value={p.code}>{p.code}</option>)}
                      </select>
                      <input type="number" aria-label={'第' + (idx + 1) + '项数量'} value={it.count}
                        min={0} inputMode="numeric" onChange={e => updateItemCount(idx, e.target.value)} />
                      <IconButton size="small" onClick={() => removeItem(idx)} aria-label="删除项">
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>)}
                    <Button size="small" onClick={addItem}>添加色号</Button>
                  </Box>
                  <Box className="pindou-history-edit-actions">
                    <Button size="small" variant="contained" disabled={saving || !online || Boolean(loadError)}
                      onClick={saveEdit}>{saving ? '保存中…' : '保存'}</Button>
                    <Button size="small" variant="outlined" disabled={saving} onClick={cancelEdit}>取消</Button>
                  </Box>
                </Box>}
                <Typography variant="body2" sx={{ fontWeight: 650, mb: 1 }}>色号明细</Typography>
                {(() => {
                  const map = new Map()
                  ;(Array.isArray(r.items) ? r.items : []).forEach(it => {
                    const letter = (it.color || '').charAt(0).toUpperCase() || '#'
                    if (!map.has(letter)) map.set(letter, [])
                    map.get(letter).push(it)
                  })
                  return <InventoryGrid groupedInventory={Array.from(map.entries()).sort((a, b) =>
                    a[0].localeCompare(b[0]))} findPalette={findPalette} showZero={false} />
                })()}
              </Box>}
            </Box>
          })}
        </Box>}
      </Box>
      <Dialog open={viewImage != null} onClose={() => setViewImage(null)} fullWidth maxWidth="sm"
        aria-labelledby="pindou-history-image-title"
        PaperProps={{ className: 'pindou-image-preview', sx: { m: 1, maxWidth: 'calc(100% - 16px)' } }}>
        <DialogTitle id="pindou-history-image-title">查看图片</DialogTitle>
        <DialogContent>
          {viewImage && <img src={viewImage.url} alt="历史记录原图" />}
          <Button fullWidth sx={{ mt: 2 }} onClick={() => setViewImage(null)}>关闭</Button>
        </DialogContent>
      </Dialog>
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
