import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Alert, Box, Button, Card, CardActionArea, CardContent, Chip, CircularProgress,
  Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControl, Grid,
  IconButton, InputLabel, MenuItem, Paper, Select, Snackbar, Stack, Tab, Tabs,
  TextField, Typography
} from '@mui/material'
import {
  Add, ArrowBack, ArchiveOutlined, CameraAltOutlined, CalendarMonthOutlined,
  ChevronLeft, ChevronRight, Close, DeleteOutline,
  DownloadOutlined, EditOutlined, FilterAltOutlined, LocalFloristOutlined,
  PhotoLibraryOutlined, SearchOutlined, UnarchiveOutlined, YardOutlined
} from '@mui/icons-material'
import { gardenRequest, gardenJSON, gardenPhoto, localInputTime, observedPayload, displayDate, plantedDays } from './gardenApi'
import './Garden.css'

const EMPTY_PLANT = { name: '', species_id: 0, planted_on: '', location: '', notes: '', status: 'active' }
const CONFIRM_DELETE = '此操作无法撤销，照片和成长日记将一并永久删除。'

function Cover({ id, height = 178, label = '花卉照片' }) {
  return <Box className="garden-cover" sx={{ height }}>
    {id ? <img src={gardenPhoto(id)} alt={label} loading="lazy" /> :
      <LocalFloristOutlined sx={{ fontSize: 58, color: '#9bbc96' }} />}
  </Box>
}
function SectionTitle({ title, detail, action }) {
  return <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} mb={2}>
    <Box><Typography variant="h5" sx={{ fontWeight: 750, color: '#335d43' }}>{title}</Typography>
      {detail && <Typography variant="body2" color="text.secondary">{detail}</Typography>}
    </Box>{action}
  </Stack>
}
function PlantEditor({ open, plant, species, onClose, onSaved, onSpecies, notify }) {
  const [form, setForm] = useState(EMPTY_PLANT)
  const [speciesName, setSpeciesName] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    setForm(plant ? {
      name: plant.name, species_id: plant.species_id || 0, planted_on: plant.planted_on || '',
      location: plant.location || '', notes: plant.notes || '', status: plant.status,
    } : { ...EMPTY_PLANT, planted_on: localInputTime().slice(0, 10) })
    setSpeciesName('')
  }, [open, plant])
  const change = (key, value) => setForm(prev => ({ ...prev, [key]: value }))
  async function addSpecies() {
    if (!speciesName.trim()) return
    try {
      const created = await gardenRequest('/species', gardenJSON({ name: speciesName.trim() }))
      change('species_id', created.id)
      onSpecies()
      setSpeciesName('')
      notify('已添加品种')
    } catch (err) { notify(err.message, true) }
  }
  async function save() {
    if (!form.name.trim()) return notify('请填写花卉名称', true)
    setSaving(true)
    try {
      await gardenRequest(plant ? '/plants/' + plant.id : '/plants', gardenJSON(form, plant ? 'PATCH' : 'POST'))
      onSaved(); onClose()
      notify(plant ? '档案已更新' : '新花卉已加入花园')
    } catch (err) { notify(err.message, true) }
    finally { setSaving(false) }
  }
  return <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="sm">
    <DialogTitle sx={{ fontWeight: 750 }}>{plant ? '编辑花卉档案' : '种下一株新花'}</DialogTitle>
    <DialogContent><Stack spacing={2.1} sx={{ pt: 1 }}>
      <TextField autoFocus required label="给这株花起个名字" placeholder="例如：窗边的月季" value={form.name} onChange={e => change('name', e.target.value)} />
      <FormControl><InputLabel>花卉品种</InputLabel><Select label="花卉品种" value={form.species_id} onChange={e => change('species_id', e.target.value)}>
        <MenuItem value={0}>未分类</MenuItem>{species.map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
      </Select></FormControl>
      <Stack direction="row" spacing={1}><TextField fullWidth size="small" label="添加新品种" value={speciesName} onChange={e => setSpeciesName(e.target.value)} /><Button variant="outlined" onClick={addSpecies} disabled={!speciesName.trim()}>添加</Button></Stack>
      <TextField type="date" label="种植日期" value={form.planted_on || ''} onChange={e => change('planted_on', e.target.value)} InputLabelProps={{ shrink: true }} />
      <TextField label="种植位置" placeholder="阳台 / 院子 / 客厅" value={form.location} onChange={e => change('location', e.target.value)} />
      <TextField label="花卉备注" multiline minRows={3} value={form.notes} onChange={e => change('notes', e.target.value)} />
    </Stack></DialogContent>
    <DialogActions sx={{ p: 2.5 }}><Button onClick={onClose} disabled={saving}>取消</Button><Button variant="contained" disabled={saving} onClick={save}>保存</Button></DialogActions>
  </Dialog>
}
function EntryEditor({ open, plantId, editing, onClose, onSaved, notify }) {
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
function Viewer({ photos, current, onClose }) {
  const [index, setIndex] = useState(current)
  useEffect(() => setIndex(current), [current])
  const selected = photos[index]
  if (!selected) return null
  return <Dialog open fullScreen onClose={onClose} PaperProps={{ sx: { bgcolor: '#111914', color: '#fff' } }}>
    <Stack direction="row" alignItems="center" px={2} sx={{ minHeight: 60 }}>
      <IconButton onClick={onClose} aria-label="关闭" sx={{ color: 'white' }}><Close /></IconButton>
      <Typography flex={1} textAlign="center">{index + 1} / {photos.length}</Typography>
      <IconButton component="a" href={gardenPhoto(selected.id, 'original') + '?download=1'} aria-label="下载原图" sx={{ color: 'white' }}><DownloadOutlined /></IconButton>
    </Stack>
    <Stack direction="row" alignItems="center" flex={1} minHeight={0}>
      <IconButton onClick={() => setIndex(i => i - 1)} aria-label="上一张" disabled={index === 0} sx={{ color: '#fff' }}><ChevronLeft /></IconButton>
      <Box flex={1} minWidth={0} display="grid" sx={{ placeItems: 'center' }}>
        <img className="garden-large-photo" src={gardenPhoto(selected.id, 'preview')} alt={selected.name} />
      </Box>
      <IconButton onClick={() => setIndex(i => i + 1)} aria-label="下一张" disabled={index === photos.length - 1} sx={{ color: '#fff' }}><ChevronRight /></IconButton>
    </Stack>
    <Typography textAlign="center" variant="caption" sx={{ py: 1.5, opacity: .7 }}>{selected.name}</Typography>
  </Dialog>
}
function FlowerDetail({ id, active, species, onBack, onChange, onSpecies, notify }) {
  const [plant, setPlant] = useState(null)
  const [entries, setEntries] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [moreBusy, setMoreBusy] = useState(false)
  const [tab, setTab] = useState(0)
  const [plantEditor, setPlantEditor] = useState(false)
  const [entryEditor, setEntryEditor] = useState(false)
  const [editing, setEditing] = useState(null)
  const [photoIndex, setPhotoIndex] = useState(null)
  const [first, setFirst] = useState(-1)
  const [second, setSecond] = useState(-1)
  const requestVersion = useRef(0)
  const load = useCallback(async () => {
    if (!active) return
    const version = ++requestVersion.current
    try {
      const [p, list] = await Promise.all([
        gardenRequest('/plants/' + id), gardenRequest('/entries?plant_id=' + id + '&limit=40'),
      ])
      if (version !== requestVersion.current) return
      setPlant(p); setEntries(list.items); setHasMore(list.has_more)
    } catch (err) { if (version === requestVersion.current) notify(err.message, true) }
    finally { if (version === requestVersion.current) setLoading(false) }
  }, [id, active, notify])
  useEffect(() => { setLoading(true); load(); return () => { requestVersion.current++ } }, [load])
  async function more() {
    setMoreBusy(true)
    try {
      const res = await gardenRequest('/entries?plant_id=' + id + '&limit=40&offset=' + entries.length)
      setEntries(current => [...current, ...res.items]); setHasMore(res.has_more)
    } catch (err) { notify(err.message, true) }
    finally { setMoreBusy(false) }
  }
  async function updateArchive() {
    const data = {
      name: plant.name, species_id: plant.species_id || 0, planted_on: plant.planted_on || '',
      location: plant.location || '', notes: plant.notes || '',
      status: plant.status === 'active' ? 'archived' : 'active',
    }
    try { await gardenRequest('/plants/' + id, gardenJSON(data, 'PATCH')); await load(); onChange() }
    catch (err) { notify(err.message, true) }
  }
  async function deletePlant() {
    if (!window.confirm('确定删除「' + plant.name + '」？' + CONFIRM_DELETE)) return
    try {
      await gardenRequest('/plants/' + id, { method: 'DELETE' })
      notify('已删除花卉')
      onBack(); onChange()
    } catch (err) { notify(err.message, true) }
  }
  async function deleteEntry(entry) {
    if (!window.confirm('确定删除这条记录？' + CONFIRM_DELETE)) return
    try {
      await gardenRequest('/entries/' + entry.id, { method: 'DELETE' })
      await load(); onChange()
      notify('记录已删除')
    } catch (err) { notify(err.message, true) }
  }
  const shots = entries.flatMap(entry => (entry.photos || []).map(photo => ({ photo, at: entry.observed_at })))
  const photos = shots.map(s => s.photo)
  const compareA = first < 0 ? shots.length - 1 : first
  const compareB = second < 0 ? 0 : second
  if (loading && !plant) return <Stack alignItems="center" py={8}><CircularProgress /></Stack>
  if (!plant) return <Alert severity="warning">花卉不存在或已删除。<Button onClick={onBack}>返回花园</Button></Alert>
  return <Box className="garden-enter">
    <Button startIcon={<ArrowBack />} onClick={onBack} sx={{ mb: 1 }}>返回我的花园</Button>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} mb={3}>
      <Paper sx={{ overflow: 'hidden', width: { xs: '100%', sm: 230 }, flexShrink: 0, borderRadius: 3 }}><Cover id={plant.latest_photo_id} height={230} /></Paper>
      <Stack justifyContent="center" spacing={.8} flex={1}>
        <Typography variant="h5" fontWeight={750}>{plant.name}</Typography>
        <Typography color="text.secondary" variant="body2">{plant.species_name || '未分类'} {plant.location ? ' · ' + plant.location : ''}</Typography>
        <Typography color="#467d57" variant="body2">{plantedDays(plant.planted_on) ? '种植第 ' + plantedDays(plant.planted_on) + ' 天 · ' : ''}{plant.photo_count} 张成长照片</Typography>
        {plant.notes && <Typography sx={{ whiteSpace: 'pre-wrap', py: 1 }}>{plant.notes}</Typography>}
        <Stack direction="row" alignItems="center" flexWrap="wrap" useFlexGap spacing={1} mt={1}>
          <Button startIcon={<CameraAltOutlined />} variant="contained" onClick={() => { setEditing(null); setEntryEditor(true) }}>记录成长</Button>
          <IconButton title="编辑花卉" aria-label="编辑花卉" onClick={() => setPlantEditor(true)}><EditOutlined /></IconButton>
          <IconButton title={plant.status === 'active' ? '归档' : '恢复'} aria-label="归档或恢复" onClick={updateArchive}>{plant.status === 'active' ? <ArchiveOutlined /> : <UnarchiveOutlined />}</IconButton>
          <IconButton title="永久删除花卉" aria-label="删除花卉" color="error" onClick={deletePlant}><DeleteOutline /></IconButton>
        </Stack>
      </Stack>
    </Stack>
    <Paper sx={{ mb: 2, borderRadius: 2 }}><Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
      <Tab label="成长时间线" /><Tab label="照片" /><Tab label="成长对比" />
    </Tabs></Paper>
    {tab === 0 && <Stack spacing={2.5}>
      {entries.length === 0 && <Paper sx={{ textAlign: 'center', py: 8, borderRadius: 3 }}><YardOutlined sx={{ fontSize: 56, color: '#9bbc96' }} /><Typography>还没有成长日记，拍下第一张照片吧。</Typography></Paper>}
      {entries.map(entry => <Box key={entry.id} sx={{ borderLeft: '3px solid #b5ceb3', pl: 2, position: 'relative' }}>
        <Card variant="outlined"><CardContent sx={{ p: 2 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="start" gap={1}>
            <Box flex={1}><Typography fontWeight={750}>{displayDate(entry.observed_at)}</Typography>
              {entry.author_name && <Typography color="text.secondary" variant="caption">记录者：{entry.author_name}</Typography>}
            </Box>
            <IconButton size="small" aria-label="编辑日记" onClick={() => { setEditing(entry); setEntryEditor(true) }}><EditOutlined fontSize="small" /></IconButton>
            <IconButton size="small" color="error" aria-label="删除日记" onClick={() => deleteEntry(entry)}><DeleteOutline fontSize="small" /></IconButton>
          </Stack>
          {entry.note && <Typography sx={{ whiteSpace: 'pre-wrap', my: 1.5 }}>{entry.note}</Typography>}
          <Grid container spacing={1} mt={.1}>{entry.photos.map(photo => <Grid key={photo.id} item xs={entry.photos.length === 1 ? 12 : 6} sm={4}>
            <button className="garden-picture-button" onClick={() => setPhotoIndex(photos.findIndex(p => p.id === photo.id))} aria-label={'查看照片：' + photo.name}>
              <img src={gardenPhoto(photo.id)} loading="lazy" alt={photo.name} />
            </button>
          </Grid>)}</Grid>
        </CardContent></Card>
      </Box>)}
    </Stack>}
    {tab === 1 && <Grid container spacing={1}>{photos.map((p, i) => <Grid key={p.id} item xs={4} sm={3} md={2}>
      <button className="garden-picture-button garden-square" onClick={() => setPhotoIndex(i)} aria-label={'查看照片：' + p.name}>
        <img src={gardenPhoto(p.id)} loading="lazy" alt={p.name} />
      </button>
    </Grid>)}</Grid>}
    {tab === 2 && <Paper sx={{ p: 2.5 }}>
      <Typography variant="h6" mb={1}>见证生长变化</Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>选择不同日期的两张照片，观察花儿是怎样长大的。</Typography>
      {shots.length < 2 ? <Alert severity="info">至少需要两张成长照片才可以对比。</Alert> :
        <><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          {[first, second].map((value, idx) => <FormControl key={idx} fullWidth><InputLabel>{idx === 0 ? '较早的照片' : '较新的照片'}</InputLabel>
            <Select label={idx === 0 ? '较早的照片' : '较新的照片'} value={value < 0 ? idx === 0 ? shots.length - 1 : 0 : value} onChange={e => idx === 0 ? setFirst(Number(e.target.value)) : setSecond(Number(e.target.value))}>
              {shots.map((s, i) => <MenuItem key={s.photo.id} value={i}>{displayDate(s.at)} · {s.photo.name}</MenuItem>)}
            </Select>
          </FormControl>)}
        </Stack>
          <Grid container spacing={1.5} mt={1}>{[compareA, compareB].map((idx, i) => <Grid key={i} item xs={6}>
            <img className="garden-compare-photo" src={gardenPhoto(shots[idx].photo.id, 'preview')} alt={'成长对比照片' + (i + 1)} />
            <Typography variant="caption" color="text.secondary">{displayDate(shots[idx].at)}</Typography>
          </Grid>)}</Grid>
        </>}
    </Paper>}
    {hasMore && <Stack alignItems="center" py={2}><Button variant="outlined" disabled={moreBusy} onClick={more}>{moreBusy ? '加载中…' : '查看更多早期记录'}</Button></Stack>}
    <PlantEditor open={plantEditor} plant={plant} species={species} onClose={() => setPlantEditor(false)} onSaved={() => { load(); onChange() }} onSpecies={onSpecies} notify={notify} />
    <EntryEditor open={entryEditor} plantId={id} editing={editing} onClose={() => setEntryEditor(false)} onSaved={() => { load(); onChange() }} notify={notify} />
    {photoIndex !== null && <Viewer photos={photos} current={photoIndex} onClose={() => setPhotoIndex(null)} />}
  </Box>
}
function GardenCalendar({ active, selectPlant, notify }) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [counts, setCounts] = useState([])
  const [selected, setSelected] = useState('')
  const [items, setItems] = useState([])
  const [dayTotal, setDayTotal] = useState(0)
  const [dayHasMore, setDayHasMore] = useState(false)
  const [dayCursor, setDayCursor] = useState(null)
  const [dayLoadingMore, setDayLoadingMore] = useState(false)
  const dayRequestGeneration = useRef(0)
  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    gardenRequest('/calendar', { signal: controller.signal }).then(setCounts).catch(err => {
      if (err.name !== 'AbortError') notify(err.message, true)
    })
    return () => controller.abort()
  }, [active, notify])
  useEffect(() => {
    if (!active || !selected) return
    const controller = new AbortController()
    const generation = ++dayRequestGeneration.current
    setItems([])
    setDayTotal(0)
    setDayHasMore(false)
    setDayCursor(null)
    gardenRequest('/calendar/day?date=' + selected + '&limit=40', { signal: controller.signal }).then(page => {
      if (controller.signal.aborted || generation !== dayRequestGeneration.current) return
      setItems(page.items)
      setDayTotal(page.total)
      setDayHasMore(page.has_more)
      setDayCursor(page.next_cursor)
    }).catch(err => {
      if (err.name !== 'AbortError') notify(err.message, true)
    })
    return () => { controller.abort(); dayRequestGeneration.current++ }
  }, [active, selected, notify])
  async function loadMoreDay() {
    if (!dayHasMore || !dayCursor || dayLoadingMore) return
    setDayLoadingMore(true)
    const generation = dayRequestGeneration.current
    try {
      const page = await gardenRequest('/calendar/day?date=' + selected + '&limit=40&cursor=' + encodeURIComponent(dayCursor))
      if (generation !== dayRequestGeneration.current) return
      setItems(prev => [...prev, ...page.items])
      setDayHasMore(page.has_more)
      setDayCursor(page.next_cursor)
    } catch (err) { notify(err.message, true) }
    finally { setDayLoadingMore(false) }
  }
  const dayCounts = useMemo(() => new Map(counts.map(d => [d.day, Number(d.count)])), [counts])
  const offset = (month.getDay() + 6) % 7
  const total = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells = Array.from({ length: offset + total }, (_, i) => i < offset ? 0 : i + 1 - offset)
  const key = d => month.getFullYear() + '-' + String(month.getMonth() + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0')
  const stepMonth = n => setMonth(m => new Date(m.getFullYear(), m.getMonth() + n, 1))
  return <Paper sx={{ p: { xs: 1.5, md: 3 }, borderRadius: 3 }}>
    <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
      <IconButton aria-label="上个月" onClick={() => stepMonth(-1)}><ChevronLeft /></IconButton>
      <Typography variant="h6">{month.getFullYear()} 年 {month.getMonth() + 1} 月</Typography>
      <IconButton aria-label="下个月" onClick={() => stepMonth(1)}><ChevronRight /></IconButton>
    </Stack>
    <Box className="garden-calendar-grid">
      {['一', '二', '三', '四', '五', '六', '日'].map(d => <Typography key={d} textAlign="center" color="text.secondary" fontWeight={650}>{d}</Typography>)}
      {cells.map((d, i) => <button key={i} type="button" disabled={!d} onClick={() => d && setSelected(key(d))}
        className={'garden-calendar-day' + (d && key(d) === selected ? ' garden-calendar-selected' : '')}>
        {d > 0 && <><span>{d}</span>{dayCounts.get(key(d)) > 0 && <i />}</>}
      </button>)}
    </Box>
    <Divider sx={{ my: 2 }} />
    {selected ? <Stack spacing={1}><Typography fontWeight={700}>{selected} · {dayTotal || dayCounts.get(selected) || 0} 条记录</Typography>
      {items.map(item => <Card key={item.id} variant="outlined"><CardActionArea onClick={() => selectPlant(item.plant_id)}>
        <Stack direction="row" spacing={1.5} alignItems="center" p={1}>
          <Box sx={{ width: 64, flexShrink: 0 }}><Cover id={item.photo_id} height={64} /></Box>
          <Box minWidth={0}><Typography fontWeight={650}>{item.plant_name}</Typography><Typography variant="body2" color="text.secondary" noWrap>{item.note || displayDate(item.observed_at)}</Typography></Box>
        </Stack>
      </CardActionArea></Card>)}
      {items.length === 0 && <Typography color="text.secondary">这一天还没有成长记录。</Typography>}
      {dayHasMore && <Button variant="outlined" disabled={dayLoadingMore} onClick={loadMoreDay}>
        {dayLoadingMore ? '加载中…' : '加载更多成长记录'}
      </Button>}
    </Stack> : <Typography textAlign="center" color="text.secondary" variant="body2">点选日期，回看那一天的花园。</Typography>}
  </Paper>
}
export default function Garden({ active = true }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const plantId = Number(searchParams.get('plant') || 0)
  const selectedPlant = Number.isSafeInteger(plantId) && plantId > 0 ? plantId : 0
  const [plants, setPlants] = useState([])
  const [species, setSpecies] = useState([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('active')
  const [group, setGroup] = useState(false)
  const [tab, setTab] = useState(0)
  const [creating, setCreating] = useState(false)
  const [loading, setLoading] = useState(false)
  const [plantCursor, setPlantCursor] = useState(null)
  const [plantHasMore, setPlantHasMore] = useState(false)
  const [plantTotal, setPlantTotal] = useState(0)
  const [plantLoadingMore, setPlantLoadingMore] = useState(false)
  const plantRequestGeneration = useRef(0)
  const [notice, setNotice] = useState(null)
  const notify = useCallback((message, error = false) => setNotice({ message, error }), [])
  const fetchSpecies = useCallback(() => gardenRequest('/species').then(setSpecies).catch(err => notify(err.message, true)), [notify])
  const loadPlants = useCallback(async (signal, cursor = null) => {
    const generation = cursor ? plantRequestGeneration.current : ++plantRequestGeneration.current
    if (!cursor) setLoading(true)
    try {
      const path = '/plants?status=' + status + '&q=' + encodeURIComponent(search) + '&limit=36' +
        (cursor ? '&cursor=' + encodeURIComponent(cursor) : '')
      const page = await gardenRequest(path, { signal })
      if (!signal?.aborted && generation === plantRequestGeneration.current) {
        setPlants(previous => cursor ? [...previous, ...page.items] : page.items)
        setPlantTotal(page.total)
        setPlantHasMore(page.has_more)
        setPlantCursor(page.next_cursor)
      }
    } catch (err) { if (err.name !== 'AbortError') notify(err.message, true) }
    finally { if (!signal?.aborted && !cursor && generation === plantRequestGeneration.current) setLoading(false) }
  }, [search, status, notify])
  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    fetchSpecies()
    loadPlants(controller.signal)
    return () => controller.abort()
  }, [active, fetchSpecies, loadPlants])
  function refresh() { loadPlants() }
  async function loadMorePlants() {
    if (!plantHasMore || !plantCursor || plantLoadingMore) return
    setPlantLoadingMore(true)
    try { await loadPlants(undefined, plantCursor) }
    finally { setPlantLoadingMore(false) }
  }
  const goPlant = id => {
    setSearchParams(current => {
      const next = new URLSearchParams(current)
      if (id) next.set('plant', String(id))
      else next.delete('plant')
      return next
    })
  }
  const groups = useMemo(() => {
    const result = new Map()
    for (const plant of plants) {
      const label = plant.species_name || '未分类'
      result.set(label, [...(result.get(label) || []), plant])
    }
    return [...result].sort((a, b) => a[0].localeCompare(b[0], 'zh-CN'))
  }, [plants])
  function grid(items) {
    return <Grid container spacing={1.5}>{items.map(plant => <Grid item xs={6} sm={4} md={3} key={plant.id}>
      <Card variant="outlined" sx={{ height: '100%', borderRadius: 3, overflow: 'hidden' }}><CardActionArea sx={{ height: '100%' }} onClick={() => goPlant(plant.id)}>
        <Cover id={plant.latest_photo_id} height={165} label={plant.name} />
        <CardContent sx={{ p: 1.5 }}>
          <Typography fontWeight={750} noWrap>{plant.name}</Typography>
          <Typography variant="caption" color="text.secondary" display="block" noWrap>{plant.species_name || '未分类'} {plant.location ? '· ' + plant.location : ''}</Typography>
          <Typography variant="caption" sx={{ color: '#4a8258' }}>{plantedDays(plant.planted_on) ? '种植第 ' + plantedDays(plant.planted_on) + ' 天' : plant.photo_count + ' 张照片'}</Typography>
        </CardContent>
      </CardActionArea></Card>
    </Grid>)}</Grid>
  }
  return <Box className="garden-root">
    {selectedPlant ? <FlowerDetail key={selectedPlant} id={selectedPlant} active={active} species={species} onBack={() => goPlant(null)} onChange={refresh} onSpecies={fetchSpecies} notify={notify} /> :
      <Box className="garden-enter">
        <SectionTitle title="我的花园" detail="一起记录每一次生长。"
          action={<Stack direction="row" gap={.5} alignItems="center">
            <IconButton component="a" href="/api/garden/export" title="导出花园数据（含照片原图）" aria-label="导出花园数据">
              <DownloadOutlined />
            </IconButton>
            <Button variant="contained" color="success" startIcon={<Add />} onClick={() => setCreating(true)}>添加花卉</Button>
          </Stack>} />
        <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mb: 2 }}><Tab label="花卉" icon={<YardOutlined />} iconPosition="start" /><Tab label="成长日历" icon={<CalendarMonthOutlined />} iconPosition="start" /></Tabs>
        {tab === 0 ? <>
          <Stack spacing={1.4} mb={2}>
            <TextField fullWidth size="small" placeholder="搜索花卉或位置" value={search} onChange={e => setSearch(e.target.value)} InputProps={{ startAdornment: <SearchOutlined fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} /> }} />
            <Stack direction="row" gap={1} flexWrap="wrap">
              <Chip label="正在生长" onClick={() => setStatus('active')} color={status === 'active' ? 'success' : 'default'} />
              <Chip label="已归档" onClick={() => setStatus('archived')} color={status === 'archived' ? 'success' : 'default'} />
              <Chip label={group ? '按单株' : '按品种'} onClick={() => setGroup(x => !x)} variant="outlined" icon={<FilterAltOutlined />} />
            </Stack>
          </Stack>
          {loading && plants.length === 0 ? <Stack alignItems="center" py={7}><CircularProgress size={26} /></Stack> :
            plants.length === 0 ? <Paper sx={{ textAlign: 'center', py: 8, borderRadius: 3 }}>
              <LocalFloristOutlined sx={{ fontSize: 60, color: '#a3c7a4' }} /><Typography fontWeight={650}>{status === 'active' ? '花园等待第一株花' : '还没有归档花卉'}</Typography>
            </Paper> : group ? <Stack spacing={3.5}>
              {groups.map(([name, list]) => <Box key={name}><Typography variant="h6" mb={1}>{name} <Chip label={list.length + ' 株'} size="small" /></Typography>{grid(list)}</Box>)}
            </Stack> : grid(plants)}
          {plants.length > 0 && <Stack alignItems="center" gap={1} mt={3} pb={1}>
            <Typography variant="caption" color="text.secondary">已显示 {plants.length} / {plantTotal} 株</Typography>
            {plantHasMore && <Button variant="outlined" disabled={plantLoadingMore} onClick={loadMorePlants}>
              {plantLoadingMore ? '加载中…' : '加载更多花卉'}
            </Button>}
          </Stack>}
        </> : <GardenCalendar active={active} selectPlant={goPlant} notify={notify} />}
      </Box>}
    <PlantEditor open={creating} plant={null} species={species} onClose={() => setCreating(false)} onSaved={refresh} onSpecies={fetchSpecies} notify={notify} />
    <Snackbar open={!!notice} autoHideDuration={4100} onClose={() => setNotice(null)} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
      <Alert onClose={() => setNotice(null)} severity={notice?.error ? 'error' : 'success'} variant="filled">{notice?.message}</Alert>
    </Snackbar>
  </Box>
}
