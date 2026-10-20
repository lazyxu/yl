
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Alert, Box, Button, CircularProgress, IconButton, Snackbar, Stack, Typography } from '@mui/material'
import { Add, CalendarMonthOutlined, GridViewOutlined, ListOutlined, LocalFloristOutlined, SearchOutlined, ShareOutlined, Close } from '@mui/icons-material'
import { useSearchParams } from 'react-router-dom'
import useGardenPlants from './useGardenPlants'
import PlantGrid from './PlantGrid'
import PlantEditor from './PlantEditor'
import FlowerDetail from './FlowerDetail'
import GardenCalendar from './GardenCalendar'

function shouldShowInstallHint() {
  if (typeof navigator === 'undefined') return false
  const iosSafari = /iPhone|iPad|iPod/.test(navigator.userAgent) && /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent)
  const standalone = navigator.standalone || window.matchMedia?.('(display-mode: standalone)').matches
  try { return iosSafari && !standalone && localStorage.getItem('garden-install-hint-dismissed') !== '1' }
  catch { return false }
}
const sameMonth = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()

export default function Garden({ active = true }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const plantId = Number(searchParams.get('plant') || 0)
  const selectedPlant = Number.isSafeInteger(plantId) && plantId > 0 ? plantId : 0
  const [group, setGroup] = useState(false)
  const [tab, setTab] = useState(0)
  const [creating, setCreating] = useState(false)
  const [notice, setNotice] = useState(null)
  const [installHint, setInstallHint] = useState(shouldShowInstallHint)
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [selectedDay, setSelectedDay] = useState('')
  const scrollSaved = useRef([0, 0])
  const sentinel = useRef(null)
  const notify = useCallback((message, error = false) => setNotice({ message, error }), [])
  const {
    plants, species, search, setSearch, loading, error,
    plantHasMore, plantTotal, plantLoadingMore, fetchSpecies, refresh, loadMorePlants,
  } = useGardenPlants(active, notify)
  const [showLoadingPlaceholder, setShowLoadingPlaceholder] = useState(false)
  useEffect(() => {
    if (!loading) { setShowLoadingPlaceholder(false); return }
    const timer = setTimeout(() => setShowLoadingPlaceholder(true), 180)
    return () => clearTimeout(timer)
  }, [loading])

  const scrollArea = () => document.querySelector('.app-page[data-view="花园"]')
  const rememberScroll = () => {
    const node = scrollArea()
    if (node && !selectedPlant) scrollSaved.current[tab] = node.scrollTop
  }
  const goPlant = id => {
    if (id) rememberScroll()
    setSearchParams(current => {
      const next = new URLSearchParams(current)
      if (id) next.set('plant', String(id))
      else next.delete('plant')
      return next
    })
  }
  const chooseTab = nextTab => {
    if (tab === nextTab) return
    rememberScroll()
    setTab(nextTab)
  }
  useLayoutEffect(() => {
    if (!active) return
    const node = scrollArea()
    if (node) node.scrollTop = selectedPlant ? 0 : scrollSaved.current[tab]
  }, [selectedPlant, tab, active])

  const groups = useMemo(() => {
    const result = new Map()
    for (const plant of plants) {
      const label = plant.species_name || '未分类'
      result.set(label, [...(result.get(label) || []), plant])
    }
    return [...result].sort((a, b) => a[0].localeCompare(b[0], 'zh-CN'))
  }, [plants])
  useEffect(() => {
    if (!active || selectedPlant || tab !== 0 || !plantHasMore || !sentinel.current || !window.IntersectionObserver) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) loadMorePlants()
    }, { root: scrollArea(), rootMargin: '240px 0px' })
    observer.observe(sentinel.current)
    return () => observer.disconnect()
  }, [active, selectedPlant, tab, plantHasMore, loadMorePlants])

  const dismissInstall = () => {
    setInstallHint(false)
    try { localStorage.setItem('garden-install-hint-dismissed', '1') } catch { /* private mode */ }
  }
  const heading = <div className="garden-header">
    <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
      <Box minWidth={0}>
        <Typography component="h1" className="garden-heading">我的花园</Typography>
        <div className="garden-subtitle">记录每一株花的成长</div>
      </Box>
      <Button aria-label="添加花卉" className="garden-add-btn" variant="contained" color="success"
        startIcon={<Add />} onClick={() => setCreating(true)}>添加花卉</Button>
    </Stack>
  </div>

  return <Box className="garden-root" data-garden-screen={selectedPlant ? 'detail' : 'home'}>
    {selectedPlant
      ? <FlowerDetail key={selectedPlant} id={selectedPlant} active={active} species={species}
          onBack={() => goPlant(null)} onChange={refresh} onSpecies={fetchSpecies} notify={notify} />
      : <Box>
        {heading}
        <div className="garden-segments" role="tablist" aria-label="花园视图">
          <button type="button" className="garden-segment" role="tab" aria-selected={tab === 0}
            onClick={() => chooseTab(0)}><GridViewOutlined sx={{ fontSize: 18, verticalAlign: 'middle', mr: .6 }} />花卉</button>
          <button type="button" className="garden-segment" role="tab" aria-selected={tab === 1}
            onClick={() => chooseTab(1)}><CalendarMonthOutlined sx={{ fontSize: 18, verticalAlign: 'middle', mr: .6 }} />成长日历</button>
        </div>
        {tab === 0 ? <>
          <label className="garden-search">
            <SearchOutlined aria-hidden="true" sx={{ color: 'var(--garden-muted)' }} />
            <input type="search" aria-label="搜索花卉或位置" placeholder="搜索花卉、品种或位置"
              value={search} onChange={e => { setSearch(e.target.value); scrollSaved.current[0] = 0; const node = scrollArea(); if (node) node.scrollTop = 0 }} autoComplete="off" />
            {search && <IconButton size="small" aria-label="清除搜索" onClick={() => setSearch('')}><Close fontSize="small" /></IconButton>}
          </label>
          <div className="garden-list-header">
            <div><Typography fontWeight={750} component="h2">全部花卉</Typography>
              <Typography variant="caption" color="text.secondary">{plantTotal} 株</Typography>
            </div>
            <div className="garden-view-switch" role="group" aria-label="花卉分组">
              <button type="button" aria-pressed={!group} onClick={() => { setGroup(false); scrollSaved.current[0] = 0; const node = scrollArea(); if (node) node.scrollTop = 0 }}>
                <ListOutlined fontSize="small" aria-hidden="true" sx={{ verticalAlign: 'middle' }} /> 按单株
              </button>
              <button type="button" aria-pressed={group} onClick={() => { setGroup(true); scrollSaved.current[0] = 0; const node = scrollArea(); if (node) node.scrollTop = 0 }}>
                <GridViewOutlined fontSize="small" aria-hidden="true" sx={{ verticalAlign: 'middle' }} /> 按品种
              </button>
            </div>
          </div>
          {error && <Alert severity="error" className="garden-error" action={<Button onClick={refresh}>重试</Button>}>
            {plants.length ? '刷新失败，以下仍是上次的结果：' : '花园加载失败：'}{error}
          </Alert>}
          {loading && plants.length === 0 && !error
            ? <div style={{ minHeight: 320 }} aria-busy="true" aria-label="正在获取花卉">
              {showLoadingPlaceholder && <div className="garden-loading-grid"><div className="garden-loading-card"/><div className="garden-loading-card"/><div className="garden-loading-card"/><div className="garden-loading-card"/></div>}
            </div>
            : plants.length === 0 && !error
              ? <div className="garden-empty">
                  <LocalFloristOutlined sx={{ fontSize: 56, color: '#91b59b' }} />
                  <Typography fontWeight={750}>{search.trim() ? '没有找到符合条件的花卉' : '花园等待第一株花'}</Typography>
                  <Typography variant="body2" color="text.secondary" my={1}>{search.trim() ? '尝试换个关键词' : '添加一株花，开始记录成长'}</Typography>
                  {search.trim() && <Button onClick={() => setSearch('')}>清除搜索</Button>}
                </div>
              : group ? <>{groups.map(([name, list]) => <section key={name} aria-label={name}>
                <h2 className="garden-group-heading">{name}<span className="garden-group-count">已加载 {list.length} 株</span></h2>
                <PlantGrid items={list} onSelect={goPlant} />
              </section>)}</> : <PlantGrid items={plants} onSelect={goPlant} />}
          {loading && plants.length > 0 && <Box sx={{ height: 3, mt: 1 }}><CircularProgress size={18} aria-label="正在刷新花卉" /></Box>}
          {plants.length > 0 && <div className="garden-pagination">
            <Typography variant="caption" color="text.secondary">已显示 {plants.length} / {plantTotal} 株</Typography>
            {plantHasMore && <Button variant="outlined" onClick={loadMorePlants} disabled={plantLoadingMore}>
              {plantLoadingMore ? '正在加载更多…' : '加载更多花卉'}
            </Button>}
            <div ref={sentinel} aria-hidden="true" style={{ height: 2, width: '100%' }} />
          </div>}
          {installHint && <div className="garden-install-hint">
            <ShareOutlined aria-hidden="true" color="success"/>
            <p>在 Safari 点「分享」→「添加到主屏幕」，即可像 App 一样打开花园。</p>
            <IconButton aria-label="关闭安装提示" onClick={dismissInstall}><Close fontSize="small"/></IconButton>
          </div>}
        </> : <GardenCalendar active={active} month={calendarMonth}
          selected={selectedDay} onMonthChange={nextMonth => setCalendarMonth(current => sameMonth(current, nextMonth) ? current : nextMonth)}
          onSelectedChange={setSelectedDay} selectPlant={goPlant} notify={notify} />}
      </Box>}
    <PlantEditor open={creating} plant={null} species={species} onClose={() => setCreating(false)}
      onSaved={refresh} onSpecies={fetchSpecies} notify={notify} />
    <Snackbar open={!!notice} autoHideDuration={4100} onClose={() => setNotice(null)}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
      <Alert onClose={() => setNotice(null)} severity={notice?.error ? 'error' : 'success'} variant="filled">{notice?.message}</Alert>
    </Snackbar>
  </Box>
}
