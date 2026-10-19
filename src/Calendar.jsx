import moment from 'moment';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import './Calendar.css';
import { getDaysTogether, getMenstrualState, getShift } from './utils';
import { Alert, Box, Button } from '@mui/material';
import defaultRules from '../server/config/shift-defaults.json';
import ShiftSettings from './ShiftSettings';
import { loadShiftSettings } from './shiftSettingsApi';
import { shiftStyle } from './shifts';
import CalendarDay from './CalendarDay';
import DayShiftEditor from './DayShiftEditor';
import { loadDayShifts } from './shiftSettingsApi';

const 经期状态映射 = {
  经期: '腰酸、烦躁、疲惫、压力大',
  卵泡期: '心情愉悦、头脑清醒、充满干劲',
  排卵期: '粘人精，要贴贴',
  黄体期: '精力下降、情绪波动、emo',
}

const Calendar = ({ active = true }) => {
  const today = moment();
  const [currentMonth, setCurrentMonth] = useState(moment().startOf('month'));
  const calendarRef = useRef(null);
  const swipeStart = useRef(null);
  const swipeFrame = useRef(null);
  const swipeDelta = useRef(0);
  const [selectedDate, setSelectedDate] = useState(today);
  const [settings, setSettings] = useState({ rules: defaultRules, version: null });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [settingsError, setSettingsError] = useState('');
  const [dayShifts, setDayShifts] = useState({ overrides: {}, version: null });
  const [loadingDayShifts, setLoadingDayShifts] = useState(true);
  const [dayShiftsError, setDayShiftsError] = useState('');
  const [dayEditor, setDayEditor] = useState(null);
  const gestureBlocked = useRef(false);
  // Touch moves only mutate a compositor transform once per animation frame.
  // The month grid must never re-render on every touchmove.
  function resetSwipeTransform() {
    if (swipeFrame.current !== null) {
      if (typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(swipeFrame.current);
      else clearTimeout(swipeFrame.current);
      swipeFrame.current = null;
    }
    swipeDelta.current = 0;
    if (calendarRef.current) calendarRef.current.style.transform = '';
  }
  function scheduleSwipeTransform(pixels) {
    swipeDelta.current = pixels;
    if (swipeFrame.current !== null) return;
    const paint = () => {
      swipeFrame.current = null;
      if (calendarRef.current) calendarRef.current.style.transform =
        'translate3d(' + swipeDelta.current + 'px, 0, 0)';
    };
    swipeFrame.current = typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame(paint)
      : setTimeout(paint, 16);
  }
  useEffect(() => () => {
    resetSwipeTransform();
  }, []);


  const reloadSettings = useCallback(async signal => {
    setLoadingSettings(true);
    setSettingsError('');
    try {
      const loaded = await loadShiftSettings(signal);
      setSettings(current => current.version === null || loaded.version >= current.version ? loaded : current);
      return loaded;
    } catch (error) {
      if (error.name !== 'AbortError') setSettingsError('无法读取排班设置，当前按已加载的规则显示。请重新加载后再修改。');
    } finally {
      if (!signal?.aborted) setLoadingSettings(false);
    }
  }, []);

  const reloadDayShifts = useCallback(async signal => {
    setLoadingDayShifts(true); setDayShiftsError('');
    try {
      const loaded = await loadDayShifts(signal);
      setDayShifts(current => current.version === null || loaded.version >= current.version ? loaded : current);
      return loaded;
    } catch (error) {
      if (error.name !== 'AbortError') setDayShiftsError('无法读取单日调整，请重新加载后再修改。');
    } finally { if (!signal?.aborted) setLoadingDayShifts(false); }
  }, []);

  useEffect(() => {
    if (!active) { setSettingsOpen(false); return }
    const controller = new AbortController();
    reloadSettings(controller.signal);
    reloadDayShifts(controller.signal);
    return () => controller.abort();
  }, [active, reloadSettings, reloadDayShifts]);

  const canAdjust = active && !loadingSettings && !loadingDayShifts && settings.version !== null && dayShifts.version !== null;
  const shiftFor = day => {
    const override = dayShifts.overrides[day.format('YYYY-MM-DD')];
    return override?.shift || getShift(day, settings.rules);
  };
  const selectedOverride = dayShifts.overrides[selectedDate.format('YYYY-MM-DD')];
  const adjustDay = day => {
    if (!canAdjust) return;
    gestureBlocked.current = true;
    resetSwipeTransform();
    swipeStart.current = null;
    setSelectedDate(day);
    setDayEditor({ date: day.format('YYYY-MM-DD'), baseShift: getShift(day, settings.rules), snapshot: { ...dayShifts, overrides: { ...dayShifts.overrides } } });
  };

  const onTouchStart = (event) => {
    if (!active) return;
    gestureBlocked.current = Boolean(dayEditor);
    const touch = event.touches[0];
    if (!touch) return;
    resetSwipeTransform();
    swipeStart.current = {
      x: touch.clientX, y: touch.clientY, axis: null,
      edge: touch.clientX <= 24 || touch.clientX >= window.innerWidth - 24,
    };
  };
  const onTouchMove = (event) => {
    const start = swipeStart.current;
    if (!active || gestureBlocked.current || dayEditor || !start || start.edge) return;
    const touch = event.touches[0];
    if (!touch || event.touches.length !== 1) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (!start.axis) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      start.axis = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
    }
    if (start.axis !== 'horizontal') return;
    scheduleSwipeTransform(Math.max(-120, Math.min(120, dx * 0.45)));
  };
  const onTouchEnd = (event) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    resetSwipeTransform();
    if (!active || gestureBlocked.current || dayEditor || !start || start.edge || start.axis === 'vertical') return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) <= 50 || Math.abs(dx) <= Math.abs(dy) * 1.25) return;
    if (dx < 0) handleSlideNext();
    else handleSlidePrevious();
  };
  const onTouchCancel = () => {
    swipeStart.current = null;
    resetSwipeTransform();
  };
  const handleSlidePrevious = () => {
    resetSwipeTransform();
    setCurrentMonth(month => month.clone().subtract(1, 'month'));
  };
  const handleSlideNext = () => {
    resetSwipeTransform();
    setCurrentMonth(month => month.clone().add(1, 'month'));
  };

  const handleDateClick = (day) => {
    setSelectedDate(day);
  };

  // 生成月份日历
  const generateCalendar = () => {
    const startOfMonth = currentMonth.clone().startOf('month');
    const endOfMonth = currentMonth.clone().endOf('month').endOf('week');
    const days = [];
    let currentDay = startOfMonth.clone().startOf('week');

    while (currentDay.isSameOrBefore(endOfMonth, 'day')) {
      const day = currentDay.clone();
      const isCurrentMonth = day.month() === currentMonth.month();
      const isToday = day.isSame(today, 'day');
      const isSelected = day.isSame(selectedDate, 'day');
      const shift = shiftFor(day);
      const override = dayShifts.overrides[day.format('YYYY-MM-DD')];
      // const menstrualState = getMenstrualState(day); // 获取经期状态

      days.push(
        <CalendarDay
          key={day.format('YYYY-MM-DD')}
          style={isCurrentMonth ? {} : { opacity: 0.5 }}
          className={`day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
          data-date={day.format('YYYY-MM-DD')}
          aria-label={`${day.format('YYYY年MM月DD日')} ${shift}${override?.kind === 'swap' ? '，换班' : ''}`}
          canAdjust={canAdjust}
          onSelect={() => handleDateClick(day)}
          onAdjust={() => adjustDay(day)}
        >
          <div
            className={`date`}
          >
            {day.format('D')}
          </div>
          <div
            className={`shift ${shift}`}
            style={shiftStyle(shift)}
          >
            {shift}
          </div>
          {override?.kind === 'swap' && <span className="day-adjustment-mark" aria-hidden="true">换</span>}
        </CalendarDay>
      );
      currentDay.add(1, 'day');
    }
    return days;
  };
  // const state = getMenstrualState(selectedDate).split(' ')[0];
  return (
    <Box sx={{ p: 1 }}>
      <div
        className="calendar-container">
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button size="small" onClick={() => setSettingsOpen(true)} disabled={loadingSettings || settings.version === null}>排班设置</Button>
        </Box>
        {loadingSettings && <Alert severity="info">正在加载排班设置…</Alert>}
        {settingsError && <Alert severity="warning" action={<Button color="inherit" onClick={() => reloadSettings()}>重新加载</Button>}>{settingsError}</Alert>}
        {dayShiftsError && <Alert severity="warning" action={<Button color="inherit" onClick={() => reloadDayShifts()}>重新加载单日调整</Button>}>{dayShiftsError}</Alert>}
        <div className="header">
          <button onClick={handleSlidePrevious}>
            ←
          </button>
          <h2>{currentMonth.format('YYYY年MM月')}</h2>
          <button onClick={handleSlideNext}>
            →
          </button>
        </div>
        <div className="calendar"
          ref={calendarRef}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchCancel}
        >
          {['日', '一', '二', '三', '四', '五', '六'].map(day => (
            <div key={day} className="weekday">
              {day}
            </div>
          ))}
          {generateCalendar()}
        </div>
        <div className="selected-date-info">
          <p>{selectedDate.format('YYYY年MM月DD日')} {shiftFor(selectedDate)}</p>
          {selectedOverride?.kind === 'swap' && <p>{selectedOverride.partner ? `与 ${selectedOverride.partner} 换班` : '已换班'}</p>}
          {selectedOverride?.note && <p className="day-adjustment-note">{selectedOverride.note}</p>}
          <Button onClick={() => adjustDay(selectedDate)} disabled={!canAdjust}>调整当天排班</Button>
          <p>第 {getDaysTogether(selectedDate)} 天</p>
          {/* <p>{经期状态映射[state]}</p> */}
        </div>
      </div>
      <ShiftSettings open={settingsOpen} settings={settings} onClose={() => setSettingsOpen(false)} onReload={() => reloadSettings()} onSaved={setSettings} />
      {dayEditor && <DayShiftEditor key={dayEditor.date} {...dayEditor} open={active} onCancel={() => setDayEditor(null)} onReload={reloadDayShifts}
        onSaved={saved => { setDayShifts(current => current.version === null || saved.version >= current.version ? saved : current); setDayEditor(null); }} />}
    </Box>
  );
};

export default Calendar;
