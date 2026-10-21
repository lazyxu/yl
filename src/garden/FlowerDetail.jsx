
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
import { clearGardenOffline, readGardenDetail, saveGardenDetail } from '../offline/data'

const entryPagePath = (plantId, offset = 0) =>
  '/entries?plant_id=' + plantId + '&limit=40&order=asc' + (offset ? '&offset=' + offset : '')

export default function FlowerDetail({ id, active, species, onBack, onChange, onSpecies, notify }) {
  const [plant, setPlant] = useState(null)
  const [entries, setEntries] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [offlineReadOnly, setOfflineReadOnly] = useState(false)
  const [offlineSavedAt, setOfflineSavedAt] = useState(null)
  const [loading, setLoading] = useState(true)
  const [detailError, setDetailError] = useState('')
  const [showSkeleton, setShowSkeleton] = useState(false)
  useEffect(() => {
    if (!loading || plant) { setShowSkeleton(false); return }
    const timer = setTimeout(() => setShowSkeleton(true), 180)
    return () => clearTimeout(timer)
  }, [loading, plant])
  const [moreBusy, setMoreBusy] = useState(false)
  const paging = useRef(false)
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
    paging.current = false
    setDetailError('')
    try {
      const [p, list] = await Promise.all([
        gardenRequest('/plants/' + id, { signal: controller.signal }),
        gardenRequest(entryPagePath(id), { signal: controller.signal }),
      ])
      if (version !== requestVersion.current || controller.signal.aborted) return
      setPlant(p); setEntries(list.items); setHasMore(list.has_more)
      setOfflineReadOnly(false); setOfflineSavedAt(null)
      saveGardenDetail(p, list.items).catch(() => {})
    } catch (err) {
      if (version === requestVersion.current && err.name !== 'AbortError') {
        const cached = await readGardenDetail(id)
        if (cached && version === requestVersion.current && !controller.signal.aborted) {
          setPlant(cached.plant)
          setEntries(cached.entries)
          setHasMore(false)
          setOfflineReadOnly(true)
          setOfflineSavedAt(cached.savedAt)
        } else if (!controller.signal.aborted) {
          const unavailable = !navigator.onLine || err instanceof TypeError ||
            /failed to fetch|load failed|networkerror|network connection/i.test(err.message)
          setDetailError(unavailable
            ? '当前无法连接服务器，本机也没有这株花的已保存离线详情。请联网后再试。'
            : /不存在|未找到|not found|404/i.test(err.message)
              ? '花卉不存在或已被删除。'
              : '无法读取花卉详情：' + (err.message || '服务器暂不可用'))
        }
      }
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
    if (!hasMore || moreBusy || paging.current) return
    paging.current = true
    const version = requestVersion.current
    const controller = new AbortController()
    moreController.current = controller
    setMoreBusy(true)
    try {
      const res = await gardenRequest(entryPagePath(id, entries.length), { signal: controller.signal })
      if (version !== requestVersion.current || controller.signal.aborted) return
      const merged = [...entries, ...res.items]
      setEntries(merged)
      setHasMore(res.has_more)
      if (plant) saveGardenDetail(plant, merged).catch(() => {})
    } catch (err) {
      if (version === requestVersion.current && err.name !== 'AbortError') notify(err.message, true)
    } finally {
      paging.current = false
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
        await clearGardenOffline(false)
        notify('已删除花卉')
        onBack(); onChange()
      } else {
        await gardenRequest('/entries/' + intent.entry.id, { method: 'DELETE' })
        await clearGardenOffline(false)
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
  if (loading && !plant) return <div className="garden-detail-skeleton" aria-busy="true"
    aria-label="正在加载花卉档案">
    {showSkeleton && <div className="garden-loading-card" style={{ aspectRatio: '16/10' }} />}
  </div>
  if (!plant) return <div className="garden-detail garden-detail-error">
    <header className="garden-detail-header">
      <Button className="garden-detail-back" startIcon={<ArrowBackIosNew fontSize="small" />}
        onClick={onBack}>花园</Button>
    </header>
    <Alert severity="warning" role="status" sx={{ my: 2, overflowWrap: 'anywhere' }}
      action={navigator.onLine && !/不存在|已被删除/.test(detailError) ?
        <Button color="inherit" onClick={load}>重试</Button> : undefined}>
      {detailError || '当前无法查看这株花卉，请返回花园或联网后重试。'}
    </Alert>
  </div>

  return <div className="garden-detail">
    <header className="garden-detail-header">
      <Button className="garden-detail-back" startIcon={<ArrowBackIosNew fontSize="small" />} onClick={onBack}>花园</Button>
      <IconButton aria-label="更多花卉操作" disabled={offlineReadOnly || !navigator.onLine}
        onClick={event => setMenuAnchor(event.currentTarget)}><MoreHoriz/></IconButton>
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
        <Typography component="h1" className="garden-detail-title">{plant.name}</Typography>
        <div className="garden-detail-description">{plant.species_name || '未分类'}{plant.location ? ' · ' + plant.location : ''}</div>
        <Typography variant="body2" sx={{ color: 'var(--garden-green, #347c52)', mt: 1 }}>
          {plantedDays(plant.planted_on) ? '种植第 ' + plantedDays(plant.planted_on) + ' 天 · ' : ''}{plant.photo_count} 张成长照片
        </Typography>
        {plant.notes && <Typography sx={{ whiteSpace: 'pre-wrap', mt: 1.5, overflowWrap: 'anywhere' }}>{plant.notes}</Typography>}
      </div>
    </section>
    {offlineReadOnly && <Alert severity="warning" sx={{ my: 1.5 }}>
      本地只读快照：{new Date(offlineSavedAt).toLocaleString('zh-CN')}。
      仅含此前访问并保存的部分记录；可能已在其他设备上更改或删除。
    </Alert>}
    <Typography component="h2" className="garden-timeline-heading">成长时间线</Typography>
    <GrowthTimeline entries={entries} photos={photos}
      onEdit={entry => { if (!offlineReadOnly && navigator.onLine) { setEditing(entry); setEntryEditor(true) } }}
      onDelete={entry => { if (!offlineReadOnly && navigator.onLine) setPendingDelete({ kind: 'entry', entry }) }}
      readOnly={offlineReadOnly || !navigator.onLine}
      onOpenPhoto={openPhoto} />
    {hasMore && <Stack alignItems="center" py={2}>
      <Button variant="outlined" disabled={moreBusy} onClick={more}>{moreBusy ? '加载中…' : '加载更多后续记录'}</Button>
    </Stack>}
    {!offlineReadOnly && navigator.onLine && <div className="garden-record-dock">
      <Button startIcon={<CameraAltOutlined/>} color="success" variant="contained"
        onClick={() => { setEditing(null); setEntryEditor(true) }}>记录成长</Button>
    </div>}
    <PlantEditor open={plantEditor} plant={plant} species={species}
      onClose={() => setPlantEditor(false)} onSaved={() => { load(); onChange() }}
      onSpecies={onSpecies} notify={notify} />
    <EntryEditor open={entryEditor} plantId={id} editing={editing}
      onClose={() => setEntryEditor(false)} onSaved={() => { load(); onChange() }} notify={notify} />
    {photoIndex !== null && <Viewer photos={photos} current={photoIndex} onClose={closePhoto}
      hasMore={hasMore} loadingMore={moreBusy} onEndReached={more} />}
    <GardenConfirmDialog open={Boolean(pendingDelete)} title={pendingDelete?.kind === 'plant' ? '删除这株花卉？' : '删除这条成长日记？'}
      description={pendingDelete?.kind === 'plant'
        ? '「' + plant.name + '」和它的全部成长日记、照片将永久删除，无法撤销。'
        : '这条记录及其中的照片将永久删除，无法撤销。'}
      confirmText="永久删除" busy={deleting} onCancel={() => setPendingDelete(null)} onConfirm={confirmDelete}/>
  </div>
}
