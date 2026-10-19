import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Button, Card, CardActionArea, Divider, IconButton, Paper, Stack, Typography } from '@mui/material'
import { ChevronLeft, ChevronRight } from '@mui/icons-material'
import { gardenRequest, displayDate } from '../gardenApi'
import { Cover } from './Shared'

export default function GardenCalendar({ active, selectPlant, notify }) {
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
