import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Box, Button, CircularProgress, Grid, IconButton, Paper, Stack, Tab, Tabs, Typography } from '@mui/material'
import { ArrowBack, ArchiveOutlined, CameraAltOutlined, DeleteOutline, EditOutlined, UnarchiveOutlined } from '@mui/icons-material'
import { gardenRequest, gardenJSON, gardenPhoto, plantedDays } from '../gardenApi'
import { Cover } from './Shared'
import PlantEditor from './PlantEditor'
import EntryEditor from './EntryEditor'
import Viewer from './PhotoViewer'
import GrowthTimeline from './GrowthTimeline'
import GrowthComparison from './GrowthComparison'

const CONFIRM_DELETE = '此操作无法撤销，照片和成长日记将一并永久删除。'

export default function FlowerDetail({ id, active, species, onBack, onChange, onSpecies, notify }) {
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
    {tab === 0 && <GrowthTimeline entries={entries} photos={photos} onEdit={entry => { setEditing(entry); setEntryEditor(true) }} onDelete={deleteEntry} onOpenPhoto={setPhotoIndex} />}
    {tab === 1 && <Grid container spacing={1}>{photos.map((p, i) => <Grid key={p.id} item xs={4} sm={3} md={2}>
      <button className="garden-picture-button garden-square" onClick={() => setPhotoIndex(i)} aria-label={'查看照片：' + p.name}>
        <img src={gardenPhoto(p.id)} loading="lazy" alt={p.name} />
      </button>
    </Grid>)}</Grid>}
    {tab === 2 && <GrowthComparison shots={shots} first={first} second={second} onFirst={setFirst} onSecond={setSecond} />}
    {hasMore && <Stack alignItems="center" py={2}><Button variant="outlined" disabled={moreBusy} onClick={more}>{moreBusy ? '加载中…' : '查看更多早期记录'}</Button></Stack>}
    <PlantEditor open={plantEditor} plant={plant} species={species} onClose={() => setPlantEditor(false)} onSaved={() => { load(); onChange() }} onSpecies={onSpecies} notify={notify} />
    <EntryEditor open={entryEditor} plantId={id} editing={editing} onClose={() => setEntryEditor(false)} onSaved={() => { load(); onChange() }} notify={notify} />
    {photoIndex !== null && <Viewer photos={photos} current={photoIndex} onClose={() => setPhotoIndex(null)} />}
  </Box>
}
