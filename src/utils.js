import moment from 'moment';

const startDateList = [
  { startDate: moment('2024-12-27'), shifts: ['白班', '白班', '夜班', '休息', '休息', '夜班', '休息', '休息'] },
  { startDate: moment('2025-11-20'), shifts: ['白班', '白班', '休息', '夜班', '夜班', '休息', '休息', '休息'] },
  { startDate: moment('2026-01-24'), shifts: ['白班', '白班', '休息', '夜班', '夜班', '休息', '休息', '休息'] },
  { startDate: moment('2026-10-05'), shifts: ['白班', '白班', '休息', '夜班', '夜班', '休息', '休息', '休息'] },
];

export const getShift = (date) => {
  for (let i = startDateList.length - 1; i >= 0; i--) {
    if (date.isSameOrAfter(startDateList[i].startDate, 'day')) {
      const { startDate, shifts } = startDateList[i];
      const diffDays = date.diff(startDate, 'days');
      return shifts[(diffDays % 8 + 8) % 8];
    }
  }
  // 如果日期早于所有已知起始日期，使用第一个起始日期计算
  const { startDate, shifts } = startDateList[0];
    const diffDays = date.diff(startDate, 'days');
    return shifts[(diffDays % 8 + 8) % 8];
};

// moment('2025-01-14')
// moment('2025-01-15')
// moment('2025-01-16')
// moment('2025-01-17')

// moment('2025-02-09')
// moment('2025-02-10')
// moment('2025-02-11')
// moment('2025-02-12')

// moment('2025-03-14') ?
// moment('2025-03-15')
// moment('2025-03-16')
// moment('2025-03-17')

const 经期起始日期 = moment('2025-02-09'); // 基准起始日期
const 经期周期 = 28; // 21-35 天
const 经期持续天数 = 4; // 2-7 天
const 卵泡期持续天数 = 9;
const 排卵期持续天数 = 5;
const 黄体期持续天数 = 10;

const togetherStartDate = moment('2025-01-26'); // 在一起的起始日期

export const getDaysTogether = (date) => {
  return date.diff(togetherStartDate, 'days');
};

// 检查当前日期是否处于经期
export const getMenstrualState = (date) => {
  const daysPassed = date.diff(经期起始日期, 'days');
  const cycleDay = (daysPassed % 经期周期 + 经期周期) % 经期周期;

  if (cycleDay < 经期持续天数) {
    return '经期 ' + (cycleDay === 0 ? 'first' : cycleDay === (经期持续天数 - 1) ? 'last' : '');
  } else if (cycleDay < 经期持续天数 + 卵泡期持续天数) {
    return '卵泡期 ' + (cycleDay === 经期持续天数 ? 'first' : cycleDay === (经期持续天数 + 卵泡期持续天数 - 1) ? 'last' : '');
  } else if (cycleDay < 经期持续天数 + 卵泡期持续天数 + 排卵期持续天数) {
    return '排卵期 ' + (cycleDay === (经期持续天数 + 卵泡期持续天数) ? 'first' : cycleDay === (经期持续天数 + 卵泡期持续天数 + 排卵期持续天数 - 1) ? 'last' : '');
  } else {
    return '黄体期 ' + (cycleDay === (经期持续天数 + 卵泡期持续天数 + 排卵期持续天数) ? 'first' : cycleDay === (经期持续天数 + 卵泡期持续天数 + 排卵期持续天数 + 黄体期持续天数 - 1) ? 'last' : '');
  }
};
