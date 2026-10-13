import moment from 'moment';
import React, { useCallback, useEffect, useState } from 'react';
import './Calendar.css';
import { getDaysTogether, getMenstrualState, getShift } from './utils';
import { Alert, Box, Button } from '@mui/material';
import defaultRules from '../server/config/shift-defaults.json';
import ShiftSettings from './ShiftSettings';
import { loadShiftSettings } from './shiftSettingsApi';
import { shiftStyle } from './shifts';

const 经期状态映射 = {
  经期: '腰酸、烦躁、疲惫、压力大',
  卵泡期: '心情愉悦、头脑清醒、充满干劲',
  排卵期: '粘人精，要贴贴',
  黄体期: '精力下降、情绪波动、emo',
}

const Calendar = ({ active = true }) => {
  const today = moment();
  const [currentMonth, setCurrentMonth] = useState(moment().startOf('month'));
  const [transitionBuffer, setTransitionBuffer] = useState(false); // 过渡动画控制
  const [startX, setStartX] = useState(0);
  const [translateX, setTranslateX] = useState(0); // 用于水平拖拽偏移
  const [selectedDate, setSelectedDate] = useState(today);
  const [settings, setSettings] = useState({ rules: defaultRules, version: null });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [settingsError, setSettingsError] = useState('');

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

  useEffect(() => {
    if (!active) { setSettingsOpen(false); return }
    const controller = new AbortController();
    reloadSettings(controller.signal);
    return () => controller.abort();
  }, [active, reloadSettings]);

  // 开始触摸时记录起始 X 坐标
  const onTouchStart = (e) => {
    setStartX(e.touches[0].clientX);
  };

  // 拖拽过程中更新 X 轴偏移
  const onTouchMove = (e) => {
    const currentX = e.touches[0].clientX;
    const deltaX = currentX - startX;
    setTranslateX(deltaX);
  };

  // 释放触摸时根据水平滑动判断是否切换月份并复位偏移
  const onTouchEnd = (e) => {
    const endX = e.changedTouches[0].clientX;
    const threshold = 50; // 滑动距离阈值
    if (!transitionBuffer) {
      if (startX - endX > threshold) {
        handleSlideNext();
      } else if (endX - startX > threshold) {
        handleSlidePrevious();
      }
    }
    // 重置水平偏移，Y轴保持不变
    setTranslateX(0);
  };

  // 切换到上一个月
  const handleSlidePrevious = () => {
    setCurrentMonth(currentMonth.clone().subtract(1, 'month'));
    setTransitionBuffer(true);
  };

  // 切换到下一个月
  const handleSlideNext = () => {
    setCurrentMonth(currentMonth.clone().add(1, 'month'));
    setTransitionBuffer(true);
  };

  useEffect(() => {
    // 动画结束后恢复状态
    setTransitionBuffer(false);
  }, [currentMonth]);

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
      const shift = getShift(day, settings.rules);
      // const menstrualState = getMenstrualState(day); // 获取经期状态

      days.push(
        <div
          key={day.format('YYYY-MM-DD')}
          style={isCurrentMonth ? {} : { opacity: 0.5 }}
          className={`day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
          onClick={() => handleDateClick(day)}
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
        </div>
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
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          // 仅对 X 轴进行平移，Y轴没有变化
          style={{
            transform: `translate(${translateX}px)`,
            transition: transitionBuffer ? 'transform 0.3s ease' : 'none'
          }}
        >
          {['日', '一', '二', '三', '四', '五', '六'].map(day => (
            <div key={day} className="weekday">
              {day}
            </div>
          ))}
          {generateCalendar()}
        </div>
        <div className="selected-date-info">
          <p>{selectedDate.format('YYYY年MM月DD日')} {getShift(selectedDate, settings.rules)}</p>
          <p>第 {getDaysTogether(selectedDate)} 天</p>
          {/* <p>{经期状态映射[state]}</p> */}
        </div>
      </div>
      <ShiftSettings open={settingsOpen} settings={settings} onClose={() => setSettingsOpen(false)} onReload={() => reloadSettings()} onSaved={setSettings} />
    </Box>
  );
};

export default Calendar;
