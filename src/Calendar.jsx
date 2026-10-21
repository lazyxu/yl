import moment from 'moment'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, TextField, Typography, useMediaQuery } from '@mui/material'
import { ChevronLeft, ChevronRight, SettingsOutlined, TodayOutlined } from '@mui/icons-material'
import './Calendar.css'
import { getDaysTogether, getShift } from './utils'
import defaultRules from '../server/config/shift-defaults.json'
import ShiftSettings from './ShiftSettings'
import { loadShiftSettings, loadDayShifts } from './shiftSettingsApi'
import { shiftStyle } from './shifts'
import CalendarDay from './CalendarDay'
import DayShiftEditor from './DayShiftEditor'
import { readCalendarSnapshot, saveCalendarSnapshot } from './offline/data'

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
const dateKey = value => value.format('YYYY-MM-DD')
const firstOfMonth = value => value.clone().startOf('month')

function MonthPicker({ open, month, onClose, onConfirm }) {
  const phone = useMediaQuery('(max-width:599.95px), (max-height:480px) and (pointer:coarse)')
  const [year, setYear] = useState(month.year())
  const [selectedMonth, setSelectedMonth] = useState(month.month() + 1)
  useEffect(() => {
    if (!open) return
    setYear(month.year())
    setSelectedMonth(month.month() + 1)
  }, [open, month])
  const valid = Number.isInteger(year) && year >= 1900 && year <= 2100
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs"
    aria-labelledby="schedule-month-picker-title" className="schedule-month-picker-dialog"
    sx={phone ? { '& .MuiDialog-container': { alignItems: 'flex-end' } } : undefined}
    PaperProps={{ sx: phone ? { m: 0, width: '100%', maxWidth: { xs: '100%', sm: 520 },
      borderRadius: '18px 18px 0 0', pb: 'max(6px, env(safe-area-inset-bottom, 0px))',
      maxHeight: 'calc(100dvh - env(safe-area-inset-top, 0px) - 12px)' } : undefined }}>
    <DialogTitle id="schedule-month-picker-title">跳转年月</DialogTitle>
    <DialogContent>
      <div className="schedule-month-fields">
        <TextField label="年份" type="number" value={year} onChange={event => setYear(Number(event.target.value))}
          inputProps={{ min: 1900, max: 2100, inputMode: 'numeric' }} error={!valid}
          helperText={valid ? '1900 至 2100 年' : '请输入有效年份'} />
        <label>月份
          <select aria-label="月份" value={selectedMonth} onChange={event => setSelectedMonth(Number(event.target.value))}>
            {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1} 月</option>)}
          </select>
        </label>
      </div>
    </DialogContent>
    <DialogActions sx={{ p: 2 }}>
      <Button onClick={onClose}>取消</Button>
      <Button variant="contained" disabled={!valid} onClick={() => { onConfirm(year, selectedMonth); onClose() }}>跳转</Button>
    </DialogActions>
  </Dialog>
}

export default function Calendar({ active = true }) {
  const [todayKey, setTodayKey] = useState(() => dateKey(moment()))
  const today = moment(todayKey, 'YYYY-MM-DD', true)
  const [currentMonth, setCurrentMonth] = useState(() => moment().startOf('month'))
  const [selectedDate, setSelectedDate] = useState(() => moment().startOf('day'))
  const [settings, setSettings] = useState({ rules: defaultRules, version: null })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [loadingSettings, setLoadingSettings] = useState(true)
  const [settingsError, setSettingsError] = useState('')
  const [dayShifts, setDayShifts] = useState({ overrides: {}, version: null })
  const [loadingDayShifts, setLoadingDayShifts] = useState(true)
  const [dayShiftsError, setDayShiftsError] = useState('')
  const [dayEditor, setDayEditor] = useState(null)
  const [showPending, setShowPending] = useState(false)
  const [monthPickerOpen, setMonthPickerOpen] = useState(false)
  const [snapshotAt, setSnapshotAt] = useState(null)
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine)
  const [serverRulesReady, setServerRulesReady] = useState(false)
  const [serverOverridesReady, setServerOverridesReady] = useState(false)
  const liveRules = useRef(null)
  const liveOverrides = useRef(null)
  const lastOnlineSync = useRef(0)

  const calendarRef = useRef(null)
  const swipeStart = useRef(null)
  const swipeFrame = useRef(null)
  const swipeDelta = useRef(0)
  const gestureBlocked = useRef(false)

  // Read only previously confirmed pairs of rule/override versions. They
  // never authorize editing and cannot overwrite a newer network response.
  useEffect(() => {
    if (!active) return
    let cancelled = false
    readCalendarSnapshot().then(snapshot => {
      if (!snapshot || cancelled) return
      setSnapshotAt(snapshot.savedAt)
      setSettings(current => current.version === null
        ? { rules: snapshot.rules, version: snapshot.rulesVersion } : current)
      setDayShifts(current => current.version === null
        ? { overrides: snapshot.overrides, version: snapshot.overridesVersion } : current)
    })
    return () => { cancelled = true }
  }, [active])

  useEffect(() => {
    if (!active) return
    const update = () => setOnline(navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [active])

  // Refresh "today" on foreground activation and at the next local midnight;
  // never reset the month or selected date while doing so.
  useEffect(() => {
    if (!active) return
    let timeout
    const update = () => {
      const now = moment()
      setTodayKey(value => value === dateKey(now) ? value : dateKey(now))
      const nextMidnight = now.clone().add(1, 'day').startOf('day')
      clearTimeout(timeout)
      timeout = setTimeout(update, Math.max(500, nextMidnight.diff(now) + 50))
    }
    const foreground = () => { if (document.visibilityState !== 'hidden') update() }
    update()
    document.addEventListener('visibilitychange', foreground)
    window.addEventListener('focus', foreground)
    return () => {
      clearTimeout(timeout)
      document.removeEventListener('visibilitychange', foreground)
      window.removeEventListener('focus', foreground)
    }
  }, [active])

  function resetSwipeTransform() {
    if (swipeFrame.current !== null) {
      if (typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(swipeFrame.current)
      else clearTimeout(swipeFrame.current)
      swipeFrame.current = null
    }
    swipeDelta.current = 0
    if (calendarRef.current) calendarRef.current.style.transform = ''
  }
  function scheduleSwipeTransform(pixels) {
    swipeDelta.current = pixels
    if (swipeFrame.current !== null) return
    const paint = () => {
      swipeFrame.current = null
      if (calendarRef.current) calendarRef.current.style.transform =
        'translate3d(' + swipeDelta.current + 'px, 0, 0)'
    }
    swipeFrame.current = typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame(paint)
      : setTimeout(paint, 16)
  }
  useEffect(() => () => resetSwipeTransform(), [])

  const reloadSettings = useCallback(async signal => {
    setLoadingSettings(true)
    setSettingsError('')
    try {
      const loaded = await loadShiftSettings(signal)
      if (signal?.aborted) return
      // A delayed response may arrive after a newer version from another
      // foreground refresh. Keep both displayed state and cached pair monotonic.
      const latest = liveRules.current && liveRules.current.version > loaded.version
        ? liveRules.current : loaded
      liveRules.current = latest
      setServerRulesReady(true)
      setSettings(current => current.version === null || latest.version >= current.version ? latest : current)
      if (liveOverrides.current) {
        saveCalendarSnapshot({ rules: latest.rules, rulesVersion: latest.version,
          overrides: liveOverrides.current.overrides,
          overridesVersion: liveOverrides.current.version })
          .then(saved => { if (saved) setSnapshotAt(Date.now()) })
          .catch(() => {})
      }
      return latest
    } catch (error) {
      if (error.name !== 'AbortError') {
        // A connected iPhone can still lose its origin. Never keep a previous
        // edit authorization after a failed foreground/online revalidation.
        setServerRulesReady(false)
        setSettingsError('无法读取排班设置，当前显示上次已获取或内置规则。请重新加载后再修改。')
      }
    } finally {
      if (!signal?.aborted) setLoadingSettings(false)
    }
  }, [])
  const reloadDayShifts = useCallback(async signal => {
    setLoadingDayShifts(true)
    setDayShiftsError('')
    try {
      const loaded = await loadDayShifts(signal)
      if (signal?.aborted) return
      const latest = liveOverrides.current && liveOverrides.current.version > loaded.version
        ? liveOverrides.current : loaded
      liveOverrides.current = latest
      setServerOverridesReady(true)
      setDayShifts(current => current.version === null || latest.version >= current.version ? latest : current)
      if (liveRules.current) {
        saveCalendarSnapshot({ rules: liveRules.current.rules, rulesVersion: liveRules.current.version,
          overrides: latest.overrides, overridesVersion: latest.version })
          .then(saved => { if (saved) setSnapshotAt(Date.now()) })
          .catch(() => {})
      }
      return latest
    } catch (error) {
      if (error.name !== 'AbortError') {
        setServerOverridesReady(false)
        setDayShiftsError('无法读取单日调整，请重新加载后再修改。')
      }
    } finally {
      if (!signal?.aborted) setLoadingDayShifts(false)
    }
  }, [])
  useEffect(() => {
    if (!active) { setSettingsOpen(false); return }
    const controller = new AbortController()
    // Versions loaded from IDB are only a display snapshot; require both
    // responses from the current network cycle before enabling any mutation.
    setServerRulesReady(false)
    setServerOverridesReady(false)
    liveRules.current = null
    liveOverrides.current = null
    lastOnlineSync.current = Date.now()
    reloadSettings(controller.signal)
    reloadDayShifts(controller.signal)
    const refresh = event => {
      if (document.visibilityState === 'hidden' || !navigator.onLine) return
      // Network recovery refreshes immediately. Foreground/focus refresh is
      // throttled because iPhone frequently changes app visibility.
      if (event?.type !== 'online' && Date.now() - lastOnlineSync.current < 60_000) return
      lastOnlineSync.current = Date.now()
      reloadSettings(controller.signal)
      reloadDayShifts(controller.signal)
    }
    window.addEventListener('online', refresh)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      controller.abort()
      window.removeEventListener('online', refresh)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [active, reloadSettings, reloadDayShifts])
  useEffect(() => {
    if (!loadingSettings && !loadingDayShifts) { setShowPending(false); return }
    const timer = setTimeout(() => setShowPending(true), 220)
    return () => clearTimeout(timer)
  }, [loadingSettings, loadingDayShifts])

  const confirmed = settings.version !== null && dayShifts.version !== null
  const canAdjust = active && online && serverRulesReady && serverOverridesReady &&
    !settingsError && !dayShiftsError && !loadingSettings && !loadingDayShifts && confirmed
  const shiftFor = day => {
    const override = dayShifts.overrides[dateKey(day)]
    return override?.shift || getShift(day, settings.rules)
  }
  const selectedOverride = dayShifts.overrides[dateKey(selectedDate)]
  const baseShift = getShift(selectedDate, settings.rules)
  const currentShift = shiftFor(selectedDate)

  const adjustDay = day => {
    if (!canAdjust) return
    gestureBlocked.current = true
    resetSwipeTransform()
    swipeStart.current = null
    setSelectedDate(day)
    setDayEditor({
      date: dateKey(day),
      baseShift: getShift(day, settings.rules),
      snapshot: { ...dayShifts, overrides: { ...dayShifts.overrides } },
    })
  }
  const onTouchStart = event => {
    if (!active) return
    gestureBlocked.current = Boolean(dayEditor)
    const touch = event.touches[0]
    if (!touch || event.touches.length !== 1) return
    resetSwipeTransform()
    swipeStart.current = {
      x: touch.clientX, y: touch.clientY, axis: null,
      edge: touch.clientX <= 24 || touch.clientX >= window.innerWidth - 24,
    }
  }
  const onTouchMove = event => {
    const start = swipeStart.current
    if (!active || gestureBlocked.current || dayEditor || !start || start.edge) return
    const touch = event.touches[0]
    if (!touch || event.touches.length !== 1) return
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (!start.axis) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
      start.axis = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical'
    }
    if (start.axis !== 'horizontal') return
    scheduleSwipeTransform(Math.max(-120, Math.min(120, dx * 0.45)))
  }
  const onTouchEnd = event => {
    const start = swipeStart.current
    swipeStart.current = null
    if (!active || gestureBlocked.current || dayEditor || !start || start.edge || start.axis === 'vertical') {
      resetSwipeTransform(); return
    }
    const touch = event.changedTouches[0]
    if (!touch) { resetSwipeTransform(); return }
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (Math.abs(dx) <= 50 || Math.abs(dx) <= Math.abs(dy) * 1.25) {
      resetSwipeTransform(); return
    }
    // Commit the new month before dropping the old month's translated pixels.
    // Touchmove remains rAF-only and does not render React each frame.
    flushSync(() => moveMonth(dx < 0 ? 1 : -1, false))
    resetSwipeTransform()
  }
  const onTouchCancel = () => { swipeStart.current = null; resetSwipeTransform() }
  const moveMonth = (offset, reset = true) => {
    if (reset) resetSwipeTransform()
    const target = currentMonth.clone().add(offset, 'month')
    const nextDay = Math.min(selectedDate.date(), target.daysInMonth())
    setCurrentMonth(target)
    setSelectedDate(target.clone().date(nextDay))
  }
  const handleSlidePrevious = () => moveMonth(-1)
  const handleSlideNext = () => moveMonth(1)
  const jumpToToday = () => {
    const now = moment().startOf('day')
    resetSwipeTransform()
    setTodayKey(dateKey(now))
    setCurrentMonth(firstOfMonth(now))
    setSelectedDate(now)
  }
  const handleDateClick = day => {
    setSelectedDate(day)
    if (!day.isSame(currentMonth, 'month')) setCurrentMonth(firstOfMonth(day))
  }
  // Roving focus supports arrows, Home/End, PgUp/PgDn without modifying
  // a 42-cell calendar during any touchmove.
  const onCalendarKeyDown = event => {
    const target = event.target.closest?.('button.day')
    if (!target) return
    const focusDay = moment(target.dataset.date, 'YYYY-MM-DD', true)
    if (!focusDay.isValid()) return
    const steps = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7 }
    let next
    if (Object.prototype.hasOwnProperty.call(steps, event.key)) next = focusDay.clone().add(steps[event.key], 'days')
    else if (event.key === 'Home') next = focusDay.clone().startOf('week')
    else if (event.key === 'End') next = focusDay.clone().endOf('week')
    else if (event.key === 'PageUp') next = focusDay.clone().subtract(1, 'month')
    else if (event.key === 'PageDown') next = focusDay.clone().add(1, 'month')
    else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); handleDateClick(focusDay); return
    } else return
    event.preventDefault()
    setSelectedDate(next)
    if (!next.isSame(currentMonth, 'month')) setCurrentMonth(firstOfMonth(next))
    window.requestAnimationFrame?.(() => {
      calendarRef.current?.querySelector('[data-date="' + dateKey(next) + '"]')?.focus()
    })
  }

  const generateCalendar = () => {
    const first = currentMonth.clone().startOf('month').startOf('week')
    // Exactly six rows: month switches never push the selected-day panel around.
    return Array.from({ length: 42 }, (_, index) => {
      const day = first.clone().add(index, 'days')
      const isCurrentMonth = day.isSame(currentMonth, 'month')
      const isToday = day.isSame(today, 'day')
      const isSelected = day.isSame(selectedDate, 'day')
      const shift = shiftFor(day)
      const override = dayShifts.overrides[dateKey(day)]
      return <CalendarDay
        key={dateKey(day)}
        className={'day' + (isToday ? ' today' : '') + (isSelected ? ' selected' : '') + (!isCurrentMonth ? ' other-month' : '')}
        data-date={dateKey(day)}
        aria-label={day.format('YYYY年MM月DD日') + ' ' + WEEKDAYS[day.day()] + ' ' + shift +
          (isToday ? '，今天' : '') + (isSelected ? '，已选中' : '') +
          (override?.kind === 'swap' ? '，换班' : '')}
        aria-current={isToday ? 'date' : undefined}
        aria-pressed={isSelected}
        tabIndex={isSelected || (!selectedDate.isSame(currentMonth, 'month') && day.isSame(currentMonth, 'day')) ? 0 : -1}
        canAdjust={canAdjust}
        onSelect={() => handleDateClick(day)}
        onAdjust={() => adjustDay(day)}
      >
        <span className="date">{day.format('D')}</span>
        <span className={'shift ' + shift} style={shiftStyle(shift)}>{shift}</span>
        {override?.kind === 'swap' && <span className="day-adjustment-mark" aria-hidden="true">换</span>}
      </CalendarDay>
    })
  }

  return <Box className="schedule-screen" aria-label="排班日历">
    <div className="calendar-container">
      <header className="schedule-topbar">
        <Button startIcon={<SettingsOutlined />} onClick={() => setSettingsOpen(true)}
          disabled={!online || loadingSettings || !serverRulesReady}
          aria-label="排班设置">排班设置</Button>
      </header>

      <div className="header">
        <IconButton onClick={handleSlidePrevious} aria-label="上个月"><ChevronLeft /></IconButton>
        <h2 aria-live="polite"><button className="schedule-month-button" type="button"
          aria-label="选择年月" onClick={() => setMonthPickerOpen(true)}>
          {currentMonth.format('YYYY年MM月')}
        </button></h2>
        <IconButton onClick={handleSlideNext} aria-label="下个月"><ChevronRight /></IconButton>
        <Button startIcon={<TodayOutlined />} onClick={jumpToToday} variant="text" className="schedule-today-button">今天</Button>
      </div>

      {snapshotAt && (!serverRulesReady || !serverOverridesReady || !online) &&
        <Alert severity="warning" className="schedule-unverified" role="status"
          action={online && (settingsError || dayShiftsError) ?
            <Button color="inherit" onClick={() => { reloadSettings(); reloadDayShifts() }}>重试</Button> : undefined}>
          {settingsError || dayShiftsError ? '无法读取排班设置或单日调整，当前显示' :
            online ? '正在核对服务器，暂时显示' : '离线只读：当前显示'}上次确认的排班快照
          （{new Date(snapshotAt).toLocaleString('zh-CN')}）。
          可能不是最新排班，联网核实前不允许修改。
        </Alert>}
      {!snapshotAt && !confirmed && (!online || showPending || settingsError || dayShiftsError) &&
        <Alert severity={!online || settingsError || dayShiftsError ? 'warning' : 'info'}
          className="schedule-unverified" role="status"
          action={online && (settingsError || dayShiftsError) ?
            <Button color="inherit" onClick={() => { reloadSettings(); reloadDayShifts() }}>重试</Button> : undefined}>
          {settingsError || dayShiftsError ? '无法读取排班设置或单日调整，且本机没有已确认快照' :
            online ? '尚未核对服务器排班' : '离线且本机没有已确认的排班快照'}；
          当前仅显示内置示例，不能修改。
        </Alert>}
      {confirmed && showPending && (loadingSettings || loadingDayShifts) && !settingsError && !dayShiftsError &&
        <Typography variant="caption" color="text.secondary" className="schedule-loading">正在核对最新排班…</Typography>}

      <div className="calendar" role="group" aria-label={currentMonth.format('YYYY年MM月') + '排班月历，方向键可移动日期'}
        ref={calendarRef} onKeyDown={onCalendarKeyDown}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd} onTouchCancel={onTouchCancel}>
        {['日', '一', '二', '三', '四', '五', '六'].map(day => <div key={day} className="weekday" aria-hidden="true">{day}</div>)}
        {generateCalendar()}
      </div>

      <section className="selected-date-info" aria-label="选中日期详情">
        <div className="selected-date-header">
          <div className="selected-date-heading">
            <Typography component="h3">{selectedDate.format('YYYY年MM月DD日') + ' ' + WEEKDAYS[selectedDate.day()]}</Typography>
          </div>
          <span className="selected-shift" style={shiftStyle(currentShift)}>{currentShift}</span>
        </div>
        {selectedOverride?.kind && <div className="selected-adjustment">
          <Typography variant="body2">原排班：{baseShift} · 当天调整：{selectedOverride.kind === 'swap' ? '换班' : '备班'}</Typography>
          {selectedOverride.kind === 'swap' &&
            <Typography variant="body2">{selectedOverride.partner ? '与 ' + selectedOverride.partner + ' 换班' : '已换班'}</Typography>}
          {selectedOverride.note && <p className="day-adjustment-note">{selectedOverride.note}</p>}
        </div>}
        <div className="selected-date-footer">
          <Typography variant="caption" color="text.secondary">在一起第 {getDaysTogether(selectedDate)} 天</Typography>
          <Button variant="contained" onClick={() => adjustDay(selectedDate)} disabled={!canAdjust}>调整当天排班</Button>
        </div>
      </section>
    </div>
    <MonthPicker open={monthPickerOpen} month={currentMonth} onClose={() => setMonthPickerOpen(false)}
      onConfirm={(year, month) => {
        const target = moment({ year, month: month - 1, day: 1 }).startOf('month')
        setCurrentMonth(target)
        setSelectedDate(target.clone().date(Math.min(selectedDate.date(), target.daysInMonth())))
      }} />
    <ShiftSettings open={settingsOpen} settings={settings} onClose={() => setSettingsOpen(false)}
      onReload={() => reloadSettings()} onSaved={saved => {
        setSettings(saved)
        liveRules.current = saved
        if (liveOverrides.current) saveCalendarSnapshot({
          rules: saved.rules, rulesVersion: saved.version,
          overrides: liveOverrides.current.overrides, overridesVersion: liveOverrides.current.version,
        }).then(wrote => { if (wrote) setSnapshotAt(Date.now()) }).catch(() => {})
      }} />
    {dayEditor && <DayShiftEditor key={dayEditor.date} {...dayEditor} open={active}
      onCancel={() => setDayEditor(null)} onReload={reloadDayShifts}
      onSaved={saved => {
        setDayShifts(current => current.version === null || saved.version >= current.version ? saved : current)
        liveOverrides.current = saved
        if (liveRules.current) saveCalendarSnapshot({
          rules: liveRules.current.rules, rulesVersion: liveRules.current.version,
          overrides: saved.overrides, overridesVersion: saved.version,
        }).then(wrote => { if (wrote) setSnapshotAt(Date.now()) }).catch(() => {})
        setDayEditor(null)
      }} />}
  </Box>
}
