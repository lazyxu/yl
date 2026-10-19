import React, { useCallback, useMemo, useState } from 'react'
import { Alert, Box, Button, Chip, CircularProgress, IconButton, Paper, Snackbar, Stack, Tab, Tabs, TextField, Typography } from '@mui/material'
import { Add, CalendarMonthOutlined, DownloadOutlined, FilterAltOutlined, LocalFloristOutlined, SearchOutlined, YardOutlined } from '@mui/icons-material'
import { useSearchParams } from 'react-router-dom'
import useGardenPlants from './useGardenPlants'
import { SectionTitle } from './Shared'
import PlantGrid from './PlantGrid'
import PlantEditor from './PlantEditor'
import FlowerDetail from './FlowerDetail'
import GardenCalendar from './GardenCalendar'

export default function Garden({ active = true }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const plantId = Number(searchParams.get('plant') || 0)
  const selectedPlant = Number.isSafeInteger(plantId) && plantId > 0 ? plantId : 0
  const [group, setGroup] = useState(false)
  const [tab, setTab] = useState(0)
  const [creating, setCreating] = useState(false)
  const [notice, setNotice] = useState(null)
  const notify = useCallback((message, error = false) => setNotice({ message, error }), [])
  const {
    plants, species, search, setSearch, status, setStatus, loading,
    plantHasMore, plantTotal, plantLoadingMore, fetchSpecies, refresh, loadMorePlants,
  } = useGardenPlants(active, notify)
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
              {groups.map(([name, list]) => <Box key={name}><Typography variant="h6" mb={1}>{name} <Chip label={list.length + ' 株'} size="small" /></Typography><PlantGrid items={list} onSelect={goPlant} /></Box>)}
            </Stack> : <PlantGrid items={plants} onSelect={goPlant} />}
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
