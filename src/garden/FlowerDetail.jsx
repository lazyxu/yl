
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Button, IconButton, Menu, MenuItem, Stack, Typography } from '@mui/material'
import { ArrowBackIosNew, CameraAltOutlined, DeleteOutline, EditOutlined, MoreHoriz } from '@mui/icons-material'
import { gardenRequest, plantedDays } from '../gardenApi'
import { Cover } from './Shared'
import PlantEditor from './PlantEditor'
import EntryEditor from './EntryEditor'
import Viewer from './PhotoViewer'
import GrowthTimeline from './GrowthTimeline'
import GardenConfirmDialog from './GardenConfirmDialog'

const entryPagePath = (plantId, offset = 0) =>
  '/entries?plant_id=' + plantId + '&limit=40&order=asc' + (offset ? '&offset=' + offset : '')

export default function FlowerDetail({ id, active, species, onBack, onChange, onSpecies, notify }) {
  const [plant, setPlant] = useState(null)
  const [entries, setEntries] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [moreBusy, setMoreBusy] = useState(false)
  const [plantEditor, setPlantEditor] = useState(false)
  const [entryEditor, setEntryEditor] = useState(false)
  const [editing, setEditing] = useState(null)
  const [photoIndex, setPhotoIndex] = useState(null)
  const [menuAnchor, setMenuAnchor] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const photoButton = useRef(null)
  const requestVersion = useRef(0)
  const controllerRef = useRef(null)
  const moreController = useRef(null)

  const load = useCallback(async () => {
    if (!active) return
    const version = ++requestVersion.current
    controllerRef.current?.abort()
    moreController.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setMoreBusy(false)
    try {
      const [p, list] = await Promise.all([
        gardenRequest('/plants/' + id, { signal: controller.signal }),
        gardenRequest(entryPagePath(id), { signal: controller.signal }),
      ])
      if (version !== requestVersion.current || controller.signal.aborted) return
      setPlant(p); setEntries(list.items); setHasMore(list.has_more)
    } catch (err) {
      if (version === requestVersion.current && err.name !== 'AbortError') notify(err.message, true)
    } finally {
      if (version === requestVersion.current) setLoading(false)
    }
  }, [id, active, notify])

  useEffect(() => {
    setLoading(true)
    load()
    return () => {
      requestVersion.current++
      controllerRef.current?.abort()
      moreController.current?.abort()
    }
  }, [load])

  async function more() {
    if (!hasMore || moreBusy) return
    const version = requestVersion.current
    const controller = new AbortController()
    moreController.current = controller
    setMoreBusy(true)
    try {
      const res = await gardenRequest(entryPagePath(id, entries.length), { signal: controller.signal })
      if (version !== requestVersion.current || controller.signal.aborted) return
      setEntries(current => [...current, ...res.items])
      setHasMore(res.has_more)
    } catch (err) {
      if (version === requestVersion.current && err.name !== 'AbortError') notify(err.message, true)
    } finally {
      if (version === requestVersion.current) setMoreBusy(false)
    }
  }
  async function confirmDelete() {
    const intent = pendingDelete
    if (!intent || deleting) return
    setDeleting(true)
    try {
      if (intent.kind === 'plant') {
        await gardenRequest('/plants/' + id, { method: 'DELETE' })
        notify('已删除花卉')
        onBack(); onChange()
      } else {
        await gardenRequest('/entries/' + intent.entry.id, { method: 'DELETE' })
        await load()
        onChange(); notify('记录已删除')
      }
      setPendingDelete(null)
    } catch (err) { notify(err.message, true) }
    finally { setDeleting(false) }
  }
  const photos = entries.flatMap(entry => entry.photos || [])
  const openPhoto = index => {
    photoButton.current = document.activeElement
    setPhotoIndex(index)
  }
  const closePhoto = () => {
    setPhotoIndex(null)
    requestAnimationFrame(() => photoButton.current?.focus?.())
  }
  if (loading && !plant) return <div className="garden-detail-skeleton" aria-label="正在加载花卉档案">
    <div className="garden-loading-card" style={{ aspectRatio: '16/10' }} />
  </div>
  if (!plant) return <Alert severity="warning">花卉不存在或已删除。<Button onClick={onBack}>返回花园</Button></Alert>

  return <div className="garden-detail">
    <header className="garden-detail-header">
      <Button className="garden-detail-back" startIcon={<ArrowBackIosNew fontSize="small" />} onClick={onBack}>花园</Button>
      <Typography fontWeight={680} fontSize={15} component="h1">花卉档案</Typography>
      <IconButton aria-label="更多花卉操作" onClick={event => setMenuAnchor(event.currentTarget)}><MoreHoriz/></IconButton>
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        <MenuItem aria-label="编辑花卉" onClick={() => { setMenuAnchor(null); setPlantEditor(true) }}>
          <EditOutlined sx={{ mr: 1 }} fontSize="small"/>编辑花卉
        </MenuItem>
        <MenuItem aria-label="删除花卉" onClick={() => { setMenuAnchor(null); setPendingDelete({ kind: 'plant' }) }} sx={{ color: 'error.main' }}>
          <DeleteOutline sx={{ mr: 1 }} fontSize="small"/>删除花卉
        </MenuItem>
      </Menu>
    </header>
    <section className="garden-detail-hero">
      <Cover id={plant.latest_photo_id} height={null} className="garden-detail-cover" label={plant.name}/>
      <div className="garden-detail-info">
        <Typography component="h2" className="garden-detail-title">{plant.name}</Typography>
        <div className="garden-detail-description">{plant.species_name || '未分类'}{plant.location ? ' · ' + plant.location : ''}</div>
        <Typography variant="body2" sx={{ color: '#46815c', mt: 1 }}>
          {plantedDays(plant.planted_on) ? '种植第 ' + plantedDays(plant.planted_on) + ' 天 · ' : ''}{plant.photo_count} 张成长照片
        </Typography>
        {plant.notes && <Typography sx={{ whiteSpace: 'pre-wrap', mt: 1.5, overflowWrap: 'anywhere' }}>{plant.notes}</Typography>}
      </div>
    </section>
    <Typography component="h2" className="garden-timeline-heading">成长时间线</Typography>
    <GrowthTimeline entries={entries} photos={photos}
      onEdit={entry => { setEditing(entry); setEntryEditor(true) }}
      onDelete={entry => setPendingDelete({ kind: 'entry', entry })}
      onOpenPhoto={openPhoto} />
    {hasMore && <Stack alignItems="center" py={2}>
      <Button variant="outlined" disabled={moreBusy} onClick={more}>{moreBusy ? '加载中…' : '加载更多后续记录'}</Button>
    </Stack>}
    <div className="garden-record-dock">
      <Button startIcon={<CameraAltOutlined/>} color="success" variant="contained"
        onClick={() => { setEditing(null); setEntryEditor(true) }}>记录成长</Button>
    </div>
    <PlantEditor open={plantEditor} plant={plant} species={species}
      onClose={() => setPlantEditor(false)} onSaved={() => { load(); onChange() }}
      onSpecies={onSpecies} notify={notify} />
    <EntryEditor open={entryEditor} plantId={id} editing={editing}
      onClose={() => setEntryEditor(false)} onSaved={() => { load(); onChange() }} notify={notify} />
    {photoIndex !== null && <Viewer photos={photos} current={photoIndex} onClose={closePhoto} />}
    <GardenConfirmDialog open={Boolean(pendingDelete)} title={pendingDelete?.kind === 'plant' ? '删除这株花卉？' : '删除这条成长日记？'}
      description={pendingDelete?.kind === 'plant'
        ? '「' + plant.name + '」和它的全部成长日记、照片将永久删除，无法撤销。'
        : '这条记录及其中的照片将永久删除，无法撤销。'}
      confirmText="永久删除" busy={deleting} onCancel={() => setPendingDelete(null)} onConfirm={confirmDelete}/>
  </div>
}
