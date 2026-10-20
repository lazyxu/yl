
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Alert, Box, Button, Grid, IconButton, LinearProgress, Stack, TextField, Typography } from '@mui/material'
import { CameraAltOutlined, Close, PhotoLibraryOutlined } from '@mui/icons-material'
import { gardenRequest, gardenJSON, gardenUpload, localInputTime, observedPayload } from '../gardenApi'
import GardenFormDialog from './GardenFormDialog'

function lastAuthor() {
  try { return localStorage.getItem('garden-author') || '' } catch { return '' }
}

export default function EntryEditor({ open, plantId, editing, onClose, onSaved, notify }) {
  const [when, setWhen] = useState(localInputTime())
  const [note, setNote] = useState('')
  const [author, setAuthor] = useState(lastAuthor)
  const [files, setFiles] = useState([])
  const [sending, setSending] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [progress, setProgress] = useState(null)
  const camera = useRef(null)
  const gallery = useRef(null)
  const editId = editing?.id
  useEffect(() => {
    if (!open) return
    setWhen(localInputTime(editing?.observed_at))
    setNote(editing?.note || '')
    setAuthor(editing?.author_name || lastAuthor())
    setFiles([])
    setDirty(false)
    setProgress(null)
  }, [open, editId])
  const [previews, setPreviews] = useState([])
  useLayoutEffect(() => {
    if (!open || editing) { setPreviews([]); return }
    const created = files.map(file => ({ file, url: URL.createObjectURL(file) }))
    setPreviews(created)
    return () => created.forEach(item => URL.revokeObjectURL(item.url))
  }, [files, open, editing])
  function selectFiles(selected) {
    if (!selected?.length) return
    const next = [...files, ...Array.from(selected)]
    if (next.length > 8) { notify('每条成长日记最多添加 8 张照片', true); return }
    setFiles(next)
    setDirty(true)
  }
  function change(setValue, value) {
    setValue(value); setDirty(true)
  }
  async function submit() {
    if (!when) return notify('请选择记录时间', true)
    if (!editing && files.length === 0) return notify('请至少拍一张照片', true)
    if (files.some(f => f.size > 20 * 1024 * 1024) ||
      files.reduce((sum, f) => sum + f.size, 0) > 90 * 1024 * 1024) {
      return notify('照片大小超限：单张最多20 MiB，总计90 MiB', true)
    }
    setSending(true)
    setProgress(null)
    try {
      const payload = observedPayload(when, note, author)
      if (editing) await gardenRequest('/entries/' + editing.id, gardenJSON(payload, 'PATCH'))
      else {
        const data = new FormData()
        data.append('plant_id', String(plantId))
        Object.entries(payload).forEach(([key, value]) => data.append(key, value))
        files.forEach(file => data.append('photos', file))
        await gardenUpload(data, setProgress)
      }
      try { localStorage.setItem('garden-author', author) } catch { /* private mode */ }
      setDirty(false)
      onSaved()
      onClose()
      notify(editing ? '成长日记已更新' : '新的成长瞬间已记录')
    } catch (err) { notify(err.message, true) }
    finally { setSending(false); setProgress(null) }
  }
  return <GardenFormDialog open={open} title={editing ? '编辑成长日记' : '记录成长'}
    dirty={dirty} busy={sending} onClose={onClose} onSave={submit} saveLabel="保存记录">
    <Stack spacing={2.1}>
      <TextField type="datetime-local" label="记录时间" value={when}
        onChange={e => change(setWhen, e.target.value)} InputLabelProps={{ shrink: true }}/>
      <TextField label="记录者（选填）" placeholder="例如：爸爸 / 妈妈" value={author}
        onChange={e => change(setAuthor, e.target.value)} inputProps={{ maxLength: 60 }}/>
      {!editing && <>
        <input type="file" accept="image/*,.heic,.heif" capture="environment" hidden ref={camera}
          onChange={e => { selectFiles(e.target.files); e.target.value = '' }}/>
        <input type="file" accept="image/*,.heic,.heif" multiple hidden ref={gallery}
          onChange={e => { selectFiles(e.target.files); e.target.value = '' }}/>
        <Stack direction="row" spacing={1}>
          <Button fullWidth variant="contained" startIcon={<CameraAltOutlined/>}
            onClick={() => camera.current?.click()} disabled={sending}>拍照</Button>
          <Button fullWidth variant="outlined" startIcon={<PhotoLibraryOutlined/>}
            onClick={() => gallery.current?.click()} disabled={sending}>相册选择</Button>
        </Stack>
        {files.length > 0 && <>
          <Typography variant="caption" color="text.secondary">已选择 {files.length} / 8 张照片</Typography>
          <Grid container spacing={1.2}>
            {previews.map((item, index) => <Grid item xs={4} key={item.url + index}>
              <Box sx={{ position: 'relative' }}>
                <img className="garden-draft-image" src={item.url} alt={item.file.name}/>
                <IconButton className="garden-draft-remove" aria-label="移除照片"
                  disabled={sending}
                  onClick={() => { setFiles(list => list.filter((_, at) => at !== index)); setDirty(true) }}>
                  <Close fontSize="small"/>
                </IconButton>
              </Box>
            </Grid>)}
          </Grid>
        </>}
      </>}
      <TextField label="备注（选填）" placeholder="今天又长了两片叶子，终于开花了……"
        value={note} onChange={e => change(setNote, e.target.value)}
        multiline minRows={3}/>
      {editing && <Alert severity="info">可修改时间、记录者和备注；如需新增照片，请另外记录一次成长。</Alert>}
      {sending && <Box role="status" aria-live="polite">
        <Typography variant="body2" mb={1}>{progress == null ? '正在保存成长记录…' : '上传照片 ' + progress + '%'}</Typography>
        {progress == null ? <LinearProgress/> : <LinearProgress variant="determinate" value={progress}/>}
      </Box>}
    </Stack>
  </GardenFormDialog>
}
