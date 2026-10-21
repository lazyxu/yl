import React, { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Alert, Box, Button, Card, CardActionArea, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, IconButton, Stack, TextField, Typography, useMediaQuery } from '@mui/material'
import { ChevronLeft, ChevronRight, TodayOutlined } from '@mui/icons-material'
import { gardenRequest, displayDate } from '../gardenApi'
import { Cover } from './Shared'
import { readGardenDay } from '../offline/data'

const firstOfMonth = date => new Date(date.getFullYear(), date.getMonth(), 1)
const dateKey = date => date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') +
  '-' + String(date.getDate()).padStart(2, '0')
const weekday = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
const weekHeads = ['日', '一', '二', '三', '四', '五', '六']

export default function GardenCalendar({ active, selectPlant, notify,
  month: outerMonth, onMonthChange, selected: outerSelected, onSelectedChange }) {
  const [innerMonth, setInnerMonth] = useState(() => firstOfMonth(new Date()))
  const [todayDate, setTodayDate] = useState(() => new Date())
  useEffect(() => {
    if (!active) return
    let timer
    const refreshToday = () => {
      const now = new Date()
      setTodayDate(previous => dateKey(previous) === dateKey(now) ? previous : now)
      clearTimeout(timer)
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      timer = setTimeout(refreshToday, Math.max(500, midnight.getTime() - now.getTime() + 70))
    }
    const onVisible = () => { if (document.visibilityState !== 'hidden') refreshToday() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    refreshToday()
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible) }
  }, [active])
  const [innerSelected, setInnerSelected] = useState('')
  const month = outerMonth || innerMonth
  const selected = outerSelected ?? innerSelected
  const setMonth = onMonthChange || setInnerMonth
  const setSelected = onSelectedChange || setInnerSelected
  const [monthPickerOpen, setMonthPickerOpen] = useState(false)
  const [pickerValue, setPickerValue] = useState('')
  const [counts, setCounts] = useState([])
  const [countsError, setCountsError] = useState('')
  const [countsRetry, setCountsRetry] = useState(0)
  const [items, setItems] = useState([])
  const [loadedDay, setLoadedDay] = useState('')
  const [dayTotal, setDayTotal] = useState(0)
  const [dayHasMore, setDayHasMore] = useState(false)
  const [dayCursor, setDayCursor] = useState(null)
  const [dayLoading, setDayLoading] = useState(false)
  const [showDayLoading, setShowDayLoading] = useState(false)
  const [dayLoadingMore, setDayLoadingMore] = useState(false)
  const [partialOffline, setPartialOffline] = useState(false)
  const [error, setError] = useState('')
  const [retryToken, setRetryToken] = useState(0)
  const dayRequestGeneration = useRef(0)
  const dayPageAbort = useRef(null)
  const dayPaging = useRef(false)
  const grid = useRef(null)
  const swipeStart = useRef(null)
  const frame = useRef(0)
  const latestDx = useRef(0)
  const phone = useMediaQuery('(max-width:599.95px), (max-height:480px) and (pointer:coarse)')

  useEffect(() => {
    if (!dayLoading) { setShowDayLoading(false); return }
    const timer = setTimeout(() => setShowDayLoading(true), 170)
    return () => clearTimeout(timer)
  }, [dayLoading])

  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    setCountsError('')
    gardenRequest('/calendar', { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setCounts(data)
    }).catch(err => {
      if (err.name !== 'AbortError' && !controller.signal.aborted)
        setCountsError(!navigator.onLine || err instanceof TypeError ? 'offline' : 'server')
    })
    return () => controller.abort()
  }, [active, countsRetry])

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
      setPartialOffline(false)
      setDayTotal(page.total)
      setDayHasMore(page.has_more)
      setDayCursor(page.next_cursor)
      setLoadedDay(selected)
    }).catch(async err => {
      if (err.name === 'AbortError' || generation !== dayRequestGeneration.current) return
      const cached = await readGardenDay(selected)
      if (cached && generation === dayRequestGeneration.current && !controller.signal.aborted) {
        setItems(cached)
        setDayTotal(cached.length)
        setDayHasMore(false)
        setDayCursor(null)
        setLoadedDay(selected)
        setPartialOffline(true)
        setError('')
      } else setError(!navigator.onLine || err instanceof TypeError
        ? '离线且本设备未缓存该日期的成长记录，联网后可查看。' : err.message)
    }).finally(() => {
      if (generation === dayRequestGeneration.current && !controller.signal.aborted) setDayLoading(false)
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
      setItems(prev => [...prev, ...page.items.filter(item => !prev.some(previous => previous.id === item.id))])
      setDayHasMore(page.has_more)
      setDayCursor(page.next_cursor)
    } catch (err) { if (err.name !== 'AbortError' && !controller.signal.aborted) notify(err.message, true) }
    finally { dayPaging.current = false; if (generation === dayRequestGeneration.current) setDayLoadingMore(false) }
  }

  const countsMap = useMemo(() => new Map(counts.map(d => [d.day, Number(d.count)])), [counts])
  const today = todayDate
  const todayKey = dateKey(today)
  // Six steady weeks, matching the first-level schedule calendar.
  const cells = useMemo(() => Array.from({ length: 42 }, (_, i) =>
    new Date(month.getFullYear(), month.getMonth(), i - month.getDay() + 1)
  ), [month])
  function resetGesture() {
    if (frame.current) cancelAnimationFrame(frame.current)
    frame.current = 0
    latestDx.current = 0
    if (grid.current) grid.current.style.transform = ''
  }
  useEffect(() => () => {
    if (frame.current) cancelAnimationFrame(frame.current)
  }, [])
  const moveMonth = steps => {
    resetGesture()
    setMonth(firstOfMonth(new Date(month.getFullYear(), month.getMonth() + steps, 1)))
    setSelected('')
  }
  function selectDay(day) {
    if (day.getMonth() !== month.getMonth() || day.getFullYear() !== month.getFullYear()) {
      setMonth(firstOfMonth(day))
    }
    setSelected(dateKey(day))
  }
  function touchStart(event) {
    if (event.touches.length !== 1) return
    const touch = event.touches[0]
    resetGesture()
    swipeStart.current = { x: touch.clientX, y: touch.clientY, axis: null,
      edge: touch.clientX <= 24 || touch.clientX >= window.innerWidth - 24 }
  }
  function touchMove(event) {
    const start = swipeStart.current
    const touch = event.touches[0]
    if (!start || start.edge || !touch || event.touches.length !== 1) return
    const dx = touch.clientX - start.x, dy = touch.clientY - start.y
    if (!start.axis) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) return
      start.axis = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical'
    }
    if (start.axis !== 'horizontal') return
    latestDx.current = Math.max(-120, Math.min(120, dx * 0.45))
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      if (grid.current) grid.current.style.transform = 'translate3d(' + latestDx.current + 'px, 0, 0)'
    })
  }
  function touchEnd(event) {
    const start = swipeStart.current
    swipeStart.current = null
    const touch = event.changedTouches[0]
    if (!start || start.edge || start.axis !== 'horizontal' || !touch) { resetGesture(); return }
    const dx = touch.clientX - start.x, dy = touch.clientY - start.y
    if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.25) {
      flushSync(() => {
        setMonth(firstOfMonth(new Date(month.getFullYear(), month.getMonth() + (dx < 0 ? 1 : -1), 1)))
        setSelected('')
      })
    }
    resetGesture()
  }
  function keyDown(event) {
    const button = event.target.closest?.('button[data-garden-date]')
    if (!button) return
    const date = new Date(button.dataset.gardenDate + 'T00:00:00')
    if (Number.isNaN(date.getTime())) return
    const keys = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7 }
    if (!Object.prototype.hasOwnProperty.call(keys, event.key) &&
      !['Home', 'End', 'Enter', ' '].includes(event.key)) return
    event.preventDefault()
    if (event.key === 'Enter' || event.key === ' ') { selectDay(date); return }
    const target = new Date(date)
    if (event.key === 'Home') target.setDate(date.getDate() - date.getDay())
    else if (event.key === 'End') target.setDate(date.getDate() + (6 - date.getDay()))
    else target.setDate(date.getDate() + keys[event.key])
    selectDay(target)
    requestAnimationFrame(() => grid.current?.querySelector('[data-garden-date="' + dateKey(target) + '"]')?.focus())
  }

  const displayingSelected = selected && selected.slice(0, 7) === dateKey(month).slice(0, 7)
  const ready = loadedDay === selected && !dayLoading
  return <section className="garden-calendar-panel" aria-label="成长日历">
    <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
      <IconButton aria-label="上个月" onClick={() => moveMonth(-1)}><ChevronLeft/></IconButton>
      <Button aria-label="成长日历选择年月" onClick={() => {
        setPickerValue(month.getFullYear() + '-' + String(month.getMonth() + 1).padStart(2, '0'))
        setMonthPickerOpen(true)
      }} sx={{ fontSize: { xs: 16, sm: 20 }, fontWeight: 750, px: 1 }}>
        {month.getFullYear()} 年 {month.getMonth() + 1} 月
      </Button>
      <IconButton aria-label="下个月" onClick={() => moveMonth(1)}><ChevronRight/></IconButton>
    </Stack>
    <Stack direction="row" justifyContent="center" mb={1}>
      <Button size="small" startIcon={<TodayOutlined/>} onClick={() => {
        setMonth(firstOfMonth(today)); setSelected(todayKey)
      }}>今天</Button>
    </Stack>
    {countsError && !partialOffline && (countsError === 'offline' ?
      <Typography component="p" role="status" className="garden-calendar-offline-note" color="text.secondary">
        离线：日期标记和记录数尚未验证。
      </Typography> :
      <Alert severity="warning" sx={{ mb: 1 }}
        action={<Button onClick={() => setCountsRetry(value => value + 1)}>重试</Button>}>
        成长日历在线标记暂时不可用，请重试。
      </Alert>)}
    <div className="garden-calendar-grid" ref={grid} role="group"
      aria-label="成长日历日期，左右箭头可移动日期"
      onKeyDown={keyDown} onTouchStart={touchStart} onTouchMove={touchMove}
      onTouchEnd={touchEnd} onTouchCancel={() => { swipeStart.current = null; resetGesture() }}>
      {weekHeads.map(day => <div className="garden-calendar-weekday" key={day} aria-hidden="true">{day}</div>)}
      {cells.map(day => {
        const key = dateKey(day)
        const inMonth = day.getMonth() === month.getMonth()
        const count = countsMap.get(key) || 0
        return <button key={key} type="button" data-garden-date={key}
          className={'garden-calendar-day' + (!inMonth ? ' other-month' : '')}
          aria-label={key + ' ' + weekday[day.getDay()] + (countsError === 'offline' ?
            '，记录数尚未验证' : count ? '，' + count + ' 条成长记录' : '，没有成长记录') +
            (key === todayKey ? '，今天' : '') + (key === selected ? '，已选中' : '')}
          aria-pressed={key === selected}
          aria-current={key === todayKey ? 'date' : undefined}
          tabIndex={key === selected || (!selected && key === dateKey(month)) ? 0 : -1}
          onClick={() => selectDay(day)}>
          {day.getDate()}{count > 0 && <span className="garden-calendar-dot" aria-hidden="true"/>}
        </button>
      })}
    </div>
    <Divider sx={{ my: 2 }}/>
    {displayingSelected ? <div aria-live="polite">
      {partialOffline && <Alert severity="warning" sx={{ mb: 1 }}>
        离线只读：仅包含已保存过的花卉成长记录，不代表当天全部记录数。
      </Alert>}
      <Typography fontWeight={720} mb={1}>{selected} · {partialOffline ?
        '本机已缓存 ' + items.length + ' 条' : ready ? dayTotal + ' 条记录' : '记录数待确认'}</Typography>
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
                  <Typography fontWeight={680} sx={{ overflowWrap: 'anywhere' }}>{item.plant_name}</Typography>
                  <Typography variant="body2" color="text.secondary"
                    sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}>
                    {item.note || displayDate(item.observed_at)}
                  </Typography>
                </Box>
              </div>
            </CardActionArea>
          </Card>)}
        </Stack>
        {items.length === 0 && <Typography variant="body2" color="text.secondary" py={1.5}>
          {partialOffline ? '本机没有缓存这一天的成长记录，不代表当天没有记录。' : '这一天还没有成长记录。'}
        </Typography>}
        {dayHasMore && <Stack alignItems="center" my={2}>
          <Button variant="outlined" disabled={dayLoadingMore} onClick={loadMoreDay}>
            {dayLoadingMore ? '加载中…' : '加载更多成长记录'}
          </Button>
        </Stack>}
      </>}
    </div> : <Typography textAlign="center" variant="body2" color="text.secondary" py={1}>
      点选日期，回看那一天的花园。
    </Typography>}
    <Dialog open={monthPickerOpen} onClose={() => setMonthPickerOpen(false)} fullWidth maxWidth="xs"
      sx={phone ? { '& .MuiDialog-container': { alignItems: 'flex-end' } } : undefined}
      PaperProps={{ sx: phone ? { m: 0, width: '100%', borderRadius: '18px 18px 0 0',
        pb: 'max(6px, env(safe-area-inset-bottom, 0px))' } : undefined }}
      aria-labelledby="garden-month-title">
      <DialogTitle id="garden-month-title">跳转到指定月份</DialogTitle>
      <DialogContent sx={{ pt: '12px !important' }}>
        <TextField type="month" label="月份" fullWidth value={pickerValue}
          onChange={event => setPickerValue(event.target.value)}
          InputLabelProps={{ shrink: true }}/>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={() => setMonthPickerOpen(false)}>取消</Button>
        <Button variant="contained" disabled={!/^\d{4}-\d{2}$/.test(pickerValue)} onClick={() => {
          const date = new Date(pickerValue + '-01T00:00:00')
          if (!Number.isNaN(date.getTime())) { setMonth(firstOfMonth(date)); setSelected('') }
          setMonthPickerOpen(false)
        }}>跳转</Button>
      </DialogActions>
    </Dialog>
  </section>
}
