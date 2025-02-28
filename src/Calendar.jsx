import moment from 'moment';
import React, { useEffect, useRef, useState } from 'react';
import './Calendar.css';
import { getMenstrualState, getShift } from './utils';

// window.moment = moment;
// window.moment('2025-02-01').isSame(window.moment(), 'day');
const Calendar = () => {
  const today = moment();
  const [currentMonth, setCurrentMonth] = useState(moment().startOf('month'));
  const [transitionBuffer, setTransitionBuffer] = useState(false); // 用于过渡动画
  const [targetMonth, setTargetMonth] = useState(currentMonth.format('YYYY-MM'));
  const [startX, setStartX] = useState(0);
  const containerRef = useRef(null); // 滑动容器引用

  const onTouchStart = (e) => {
    setStartX(e.touches[0].clientX);
  };

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
  };

  const handleSlidePrevious = () => {
    setTransitionBuffer(true);
    setTimeout(() => {
      setCurrentMonth(currentMonth.clone().subtract(1, 'month'));
    }, 0); // 等待动画结束
  };

  const handleSlideNext = () => {
    setTransitionBuffer(true);
    setTimeout(() => {
      setCurrentMonth(currentMonth.clone().add(1, 'month'));
    }, 0); // 等待动画结束
  };

  useEffect(() => {
    setTransitionBuffer(false); // 动画结束后恢复状态
  }, [currentMonth]);

  // 生成月份日历
  const generateCalendar = () => {
    const startOfMonth = currentMonth.clone().startOf('month');
    const endOfMonth = currentMonth.clone().endOf('month');
    const weeks = [];
    let currentDay = startOfMonth.clone().startOf('week');

    while (currentDay.isBefore(endOfMonth, 'day') || weeks.length < 6) {
      const days = [];
      for (let i = 0; i < 7; i++) {
        const day = currentDay.clone();
        const isCurrentMonth = day.month() === currentMonth.month();
        const isToday = day.isSame(today, 'day');
        const shift = getShift(day);
        const isMenstrual = getMenstrualState(day); // 获取经期状态

        weeks.push(
          <div
            key={day.format('YYYY-MM-DD')}
            className={`day ${isToday ? shift : ''} ${isMenstrual ? 'menstrual-day' : '' // 添加经期样式
              }`}
          >
            <div
              className={`date ${isCurrentMonth ? '' : 'grayed'} ${isMenstrual ? 'menstrual-date' : '' // 经期日期样式
                }`}
            >
              {day.format('D')}
            </div>
            <div
              className={`shift ${shift}`}
              style={isCurrentMonth ? {} : { opacity: 0.5 }}
            >
              {shift}
            </div>
          </div>
        );
        currentDay.add(1, 'day');
      }
      // weeks.push(<div key={currentDay.format()} className="week">{days}</div>);
    }
    return weeks;
  };

  const jumpToMonth = () => {
    const parsedDate = moment(targetMonth, 'YYYY-MM');
    if (parsedDate.isValid()) {
      setCurrentMonth(parsedDate.startOf('month'));
    } else {
      alert('请输入有效的月份，格式为 YYYY-MM');
    }
  };

  return (
    <div className="calendar-container">
      <div className="header">
        <button onClick={handleSlidePrevious}>
          ←
        </button>
        <h2>{currentMonth.format('YYYY年MM月')}</h2>
        {/* <div className="jump-to-month">
          <input
            type="text"
            value={targetMonth}
            onChange={(e) => setTargetMonth(e.target.value)}
            placeholder="请输入月份，格式为YYYY-MM"
          />
          <button onClick={jumpToMonth}>
            跳转到该月份
          </button>
        </div> */}
        <button onClick={handleSlideNext}>
          →
        </button>
      </div>
      <div className="calendar" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {/* <div className="weekdays"> */}
        {['日', '一', '二', '三', '四', '五', '六'].map(day => (
          <div key={day} className="weekday">
            {day}
          </div>
        ))}
        {/* </div> */}
        {generateCalendar()}
      </div>
    </div>
  );
};

export default Calendar;
