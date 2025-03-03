import moment from 'moment';

const shifts = ['白班', '白班', '夜班', '休息', '休息', '夜班', '休息', '休息'];

// 计算班次（起始日期为2024-12-27）
const startDate = moment('2024-12-27');

export const getShift = (date) => {
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
const BASE_DATE = moment('2025-02-09'); // 基准起始日期
const CYCLE_LENGTH = 28; // 周期长度（天） 21-35
const 经期日长度 = 4; // 经期持续天数  2-7
const FOLLICULAR_PHASE_DAYS = 9; // 卵泡期持续天数
const OVULATION_PHASE_DAYS = 5; // 排卵期持续天数
const LUTEAL_PHASE_DAYS = 10; // 黄体期持续天数

// 检查当前日期是否处于经期
export const getMenstrualState = (date) => {
  const daysPassed = date.diff(BASE_DATE, 'days');
  const cycleDay = (daysPassed % CYCLE_LENGTH + CYCLE_LENGTH) % CYCLE_LENGTH;

  if (cycleDay < 经期日长度) {
    return '经期日';
  } else if (cycleDay < 经期日长度 + FOLLICULAR_PHASE_DAYS) {
    return '卵泡期';
  } else if (cycleDay < 经期日长度 + FOLLICULAR_PHASE_DAYS + OVULATION_PHASE_DAYS) {
    return '排卵期'; // 排卵期
  } else {
    return '黄体期'; // 黄体期
  }
};
