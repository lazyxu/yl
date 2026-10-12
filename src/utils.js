import moment from 'moment';
import defaultShiftRules from '../server/config/shift-defaults.json';

export const getShift = (date, rules = defaultShiftRules) => {
  if (!Array.isArray(rules) || !rules.length) return '';
  const ordered = [...rules].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const day = moment(date).startOf('day');
  const rule = [...ordered].reverse().find(item => day.isSameOrAfter(moment(item.startDate, 'YYYY-MM-DD', true), 'day')) || ordered[0];
  const diffDays = day.diff(moment(rule.startDate, 'YYYY-MM-DD', true), 'days');
  return rule.shifts[(diffDays % rule.shifts.length + rule.shifts.length) % rule.shifts.length];
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
