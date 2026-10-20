
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Box, Button, Card, CardActionArea, Divider, IconButton, Stack, Typography } from '@mui/material'
import { ChevronLeft, ChevronRight, TodayOutlined } from '@mui/icons-material'
import { gardenRequest, displayDate } from '../gardenApi'
import { Cover } from './Shared'

const firstOfMonth = value => new Date(value.getFullYear(), value.getMonth(), 1)
function dateKey(year, month, day) {
  return year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0')
}

export default function GardenCalendar({ active, selectPlant, notify,
  month: outerMonth, onMonthChange, selected: outerSelected, onSelectedChange }) {
  const [innerMonth, setInnerMonth] = useState(() => firstOfMonth(new Date()))
  const [innerSelected, setInnerSelected] = useState('')
  const month = outerMonth || innerMonth
  const selected = outerSelected ?? innerSelected
  const setMonth = onMonthChange || setInnerMonth
  const setSelected = onSelectedChange || setInnerSelected
  const [counts, setCounts] = useState([])
  const [items, setItems] = useState([])
  const [loadedDay, setLoadedDay] = useState('')
  const [dayTotal, setDayTotal] = useState(0)
  const [dayHasMore, setDayHasMore] = useState(false)
  const [dayCursor, setDayCursor] = useState(null)
  const [dayLoading, setDayLoading] = useState(false)
  const [showDayLoading, setShowDayLoading] = useState(false)
  useEffect(() => {
    if (!dayLoading) { setShowDayLoading(false); return }
    const timer = setTimeout(() => setShowDayLoading(true), 170)
    return () => clearTimeout(timer)
  }, [dayLoading])
  const [dayLoadingMore, setDayLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [retryToken, setRetryToken] = useState(0)
  const dayRequestGeneration = useRef(0)
  const dayPageAbort = useRef(null)
  const dayPaging = useRef(false)
  const swipeStart = useRef(null)

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
    dayPageAbort.current?.abort()
    dayPaging.current = false
    setDayLoadingMore(false)
    setDayLoading(true)
    setError('')
    gardenRequest('/calendar/day?date=' + selected + '&limit=40', { signal: controller.signal }).then(page => {
      if (controller.signal.aborted || generation !== dayRequestGeneration.current) return
      setItems(page.items)
      setDayTotal(page.total)
      setDayHasMore(page.has_more)
      setDayCursor(page.next_cursor)
      setLoadedDay(selected)
    }).catch(err => {
      if (err.name !== 'AbortError' && generation === dayRequestGeneration.current) {
        setError(err.message)
      }
    }).finally(() => {
      if (generation === dayRequestGeneration.current) setDayLoading(false)
    })
    return () => { controller.abort(); dayPageAbort.current?.abort(); dayRequestGeneration.current++ }
  }, [active, selected, retryToken])

  async function loadMoreDay() {
    if (!dayHasMore || !dayCursor || dayPaging.current) return
    const generation = dayRequestGeneration.current
    const controller = new AbortController()
    dayPageAbort.current = controller
    dayPaging.current = true
    setDayLoadingMore(true)
    try {
      const page = await gardenRequest('/calendar/day?date=' + selected + '&limit=40&cursor=' + encodeURIComponent(dayCursor), { signal: controller.signal })
      if (generation !== dayRequestGeneration.current || controller.signal.aborted) return
      setItems(prev => [...prev, ...page.items])
      setDayHasMore(page.has_more)
      setDayCursor(page.next_cursor)
    } catch (err) { if (err.name !== 'AbortError') notify(err.message, true) }
    finally { dayPaging.current = false; if (generation === dayRequestGeneration.current) setDayLoadingMore(false) }
  }
  const countsMap = useMemo(() => new Map(counts.map(d => [d.day, Number(d.count)])), [counts])
  const offset = (month.getDay() + 6) % 7
  const total = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells = Array.from({ length: offset + total }, (_, i) => i < offset ? 0 : i + 1 - offset)
  const today = new Date()
  const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate())
  const moveMonth = steps => {
    setMonth(firstOfMonth(new Date(month.getFullYear(), month.getMonth() + steps, 1)))
    setSelected('')
  }
  const onTouchStart = event => {
    if (event.touches.length !== 1) return
    const touch = event.touches[0]
    swipeStart.current = { x: touch.clientX, y: touch.clientY, edge: touch.clientX <= 24 || touch.clientX >= window.innerWidth - 24 }
  }
  const onTouchEnd = event => {
    const start = swipeStart.current
    swipeStart.current = null
    const touch = event.changedTouches[0]
    if (!start || !touch || start.edge) return
    const dx = touch.clientX - start.x, dy = touch.clientY - start.y
    if (Math.abs(dx) > 65 && Math.abs(dy) < 45) moveMonth(dx < 0 ? 1 : -1)
  }
  const displayingSelected = selected && selected.slice(0, 7) === dateKey(month.getFullYear(), month.getMonth(), 1).slice(0, 7)
  const ready = loadedDay === selected && !dayLoading

  return <section className="garden-calendar-panel" aria-label="成长日历">
    <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
      <IconButton aria-label="上个月" onClick={() => moveMonth(-1)}><ChevronLeft/></IconButton>
      <Typography variant="h6" fontWeight={730}>{month.getFullYear()} 年 {month.getMonth() + 1} 月</Typography>
      <IconButton aria-label="下个月" onClick={() => moveMonth(1)}><ChevronRight/></IconButton>
    </Stack>
    <Stack direction="row" justifyContent="center" mb={1}>
      <Button size="small" startIcon={<TodayOutlined/>} onClick={() => {
        setMonth(firstOfMonth(today)); setSelected(todayKey)
      }}>今天</Button>
    </Stack>
    <div className="garden-calendar-grid" onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd} onTouchCancel={() => { swipeStart.current = null }}>
      {['一','二','三','四','五','六','日'].map(d => <div className="garden-calendar-weekday" key={d}>{d}</div>)}
      {cells.map((day, index) => {
        const key = day ? dateKey(month.getFullYear(), month.getMonth(), day) : ''
        const count = countsMap.get(key) || 0
        return <button key={index} type="button" disabled={!day}
          className="garden-calendar-day" aria-label={day ? key + (count ? ' · ' + count + ' 条记录' : '') : undefined}
          aria-selected={key && key === selected ? 'true' : 'false'}
          aria-current={key === todayKey ? 'date' : undefined}
          onClick={() => day && setSelected(key)}>
          {day > 0 && <>{day}{count > 0 && <span className="garden-calendar-dot" aria-hidden="true"/>}</>}
        </button>
      })}
    </div>
    <Divider sx={{ my: 2 }}/>
    {displayingSelected ? <div aria-live="polite">
      <Typography fontWeight={720} mb={1}>{selected} · {ready ? dayTotal : (countsMap.get(selected) || 0)} 条记录</Typography>
      {dayLoading && <Box sx={{ py: 2, minHeight: 50 }} role="status" aria-busy="true">
        {showDayLoading && <Typography variant="body2" color="text.secondary">正在读取当天记录…</Typography>}
      </Box>}
      {error && <Alert severity="error" action={<Button onClick={() => setRetryToken(i => i + 1)}>重试</Button>}>{error}</Alert>}
      {ready && <>
        <Stack spacing={1}>
          {items.map(item => <Card variant="outlined" sx={{ borderRadius: 3 }} key={item.id}>
            <CardActionArea onClick={() => selectPlant(item.plant_id)} aria-label={'查看花卉：' + item.plant_name}>
              <div className="garden-calendar-record">
                <Cover id={item.photo_id} height={62} label={item.plant_name}/>
                <Box flex={1} minWidth={0}>
                  <Typography fontWeight={680} noWrap>{item.plant_name}</Typography>
                  <Typography variant="body2" color="text.secondary" noWrap>{item.note || displayDate(item.observed_at)}</Typography>
                </Box>
              </div>
            </CardActionArea>
          </Card>)}
        </Stack>
        {items.length === 0 && <Typography variant="body2" color="text.secondary" py={1.5}>这一天还没有成长记录。</Typography>}
        {dayHasMore && <Stack alignItems="center" my={2}>
          <Button variant="outlined" disabled={dayLoadingMore} onClick={loadMoreDay}>
            {dayLoadingMore ? '加载中…' : '加载更多成长记录'}
          </Button>
        </Stack>}
      </>}
    </div> : <Typography textAlign="center" variant="body2" color="text.secondary" py={1}>
      点选日期，回看那一天的花园。
    </Typography>}
  </section>
}
