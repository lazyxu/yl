import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Grid, IconButton, Stack, TextField, Typography } from '@mui/material'
import { CameraAltOutlined, Close, PhotoLibraryOutlined } from '@mui/icons-material'
import { gardenRequest, gardenJSON, localInputTime, observedPayload } from '../gardenApi'


export default function EntryEditor({ open, plantId, editing, onClose, onSaved, notify }) {
  const [when, setWhen] = useState(localInputTime())
  const [note, setNote] = useState('')
  const [author, setAuthor] = useState(() => localStorage.getItem('garden-author') || '')
  const [files, setFiles] = useState([])
  const [sending, setSending] = useState(false)
  const camera = useRef(null)
  const gallery = useRef(null)
  useEffect(() => {
    setWhen(localInputTime(editing?.observed_at))
    setNote(editing?.note || '')
    setAuthor(editing?.author_name || localStorage.getItem('garden-author') || '')
    setFiles([])
  }, [open, editing])
  const previews = useMemo(() => files.map(f => ({ file: f, url: URL.createObjectURL(f) })), [files])
  useEffect(() => () => previews.forEach(p => URL.revokeObjectURL(p.url)), [previews])
  function selectFiles(value) {
    if (!value) return
    setFiles(old => [...old, ...Array.from(value)].slice(0, 8))
  }
  async function submit() {
    if (!when) return notify('请选择记录时间', true)
    if (!editing && files.length === 0) return notify('请至少拍一张照片', true)
    if (files.some(f => f.size > 20 * 1024 * 1024) || files.reduce((sum, f) => sum + f.size, 0) > 90 * 1024 * 1024) {
      return notify('照片大小超限：单张最多20 MiB，总计90 MiB', true)
    }
    setSending(true)
    try {
      const payload = observedPayload(when, note, author)
      if (editing) {
        await gardenRequest('/entries/' + editing.id, gardenJSON(payload, 'PATCH'))
      } else {
        const data = new FormData()
        data.append('plant_id', String(plantId))
        Object.entries(payload).forEach(([key, value]) => data.append(key, value))
        files.forEach(file => data.append('photos', file))
        await gardenRequest('/entries', { method: 'POST', body: data })
      }
      localStorage.setItem('garden-author', author)
      onSaved(); onClose()
      notify(editing ? '成长日记已更新' : '新的成长瞬间已记录')
    } catch (err) { notify(err.message, true) }
    finally { setSending(false) }
  }
  return <Dialog open={open} onClose={sending ? undefined : onClose} fullWidth maxWidth="sm">
    <DialogTitle sx={{ fontWeight: 750 }}>{editing ? '编辑成长日记' : '记录成长瞬间'}</DialogTitle>
    <DialogContent><Stack spacing={2.2} sx={{ pt: 1 }}>
      <TextField type="datetime-local" label="记录时间" value={when} onChange={e => setWhen(e.target.value)} InputLabelProps={{ shrink: true }} />
      <TextField label="记录者（选填）" placeholder="例如：爸爸 / 妈妈" value={author} onChange={e => setAuthor(e.target.value)} inputProps={{ maxLength: 60 }} />
      {!editing && <>
        <input type="file" accept="image/*,.heic,.heif" capture="environment" hidden ref={camera} onChange={e => { selectFiles(e.target.files); e.target.value = '' }} />
        <input type="file" accept="image/*,.heic,.heif" multiple hidden ref={gallery} onChange={e => { selectFiles(e.target.files); e.target.value = '' }} />
        <Stack direction="row" spacing={1}>
          <Button fullWidth variant="contained" startIcon={<CameraAltOutlined />} onClick={() => camera.current?.click()}>拍照</Button>
          <Button fullWidth variant="outlined" startIcon={<PhotoLibraryOutlined />} onClick={() => gallery.current?.click()}>相册选择</Button>
        </Stack>
        {files.length > 0 && <><Typography variant="caption" color="text.secondary">已选择 {files.length} / 8 张</Typography><Grid container spacing={1}>
          {previews.map((p, i) => <Grid item xs={4} key={i}><Box sx={{ position: 'relative' }}>
            <img className="garden-draft-image" src={p.url} alt={p.file.name} />
            <IconButton size="small" aria-label="移除照片" onClick={() => setFiles(list => list.filter((_, idx) => idx !== i))}
              sx={{ position: 'absolute', right: 2, top: 2, bgcolor: 'white', color: '#333', width: 32, height: 32 }}><Close fontSize="small" /></IconButton>
          </Box></Grid>)}
        </Grid></>}
      </>}
      <TextField label="备注（选填）" placeholder="今天又长了两片叶子，终于开花了……" value={note} onChange={e => setNote(e.target.value)} multiline minRows={3} />
      {editing && <Alert severity="info">可修改时间、记录者和备注；如果要新增照片，请再记录一次成长。</Alert>}
    </Stack></DialogContent>
    <DialogActions sx={{ p: 2.5 }}><Button onClick={onClose} disabled={sending}>取消</Button><Button onClick={submit} disabled={sending} variant="contained">{sending ? '正在保存…' : '保存记录'}</Button></DialogActions>
  </Dialog>
}
