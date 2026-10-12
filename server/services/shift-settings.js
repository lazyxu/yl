const defaultRules = require('../config/shift-defaults.json');
const shiftNames = new Set(['白班', '夜班', '休息']);

function invalid(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

function normalizeShiftRules(rules) {
  if (!Array.isArray(rules) || !rules.length) invalid('至少保留一条排班规则');
  if (rules.length > 100) invalid('排班规则不能超过 100 条');
  const dates = new Set();
  return rules.map(rule => {
    if (!rule || typeof rule.startDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(rule.startDate)) invalid('请填写有效的生效日期');
    const date = new Date(`${rule.startDate}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== rule.startDate) invalid('请填写有效的生效日期');
    if (dates.has(rule.startDate)) invalid('排班规则的生效日期不能重复');
    dates.add(rule.startDate);
    if (!Array.isArray(rule.shifts) || !rule.shifts.length || rule.shifts.length > 366) invalid('每条规则需设置 1 至 366 天的循环班次');
    if (rule.shifts.some(shift => !shiftNames.has(shift))) invalid('班次只能选择白班、夜班或休息');
    return { startDate: rule.startDate, shifts: [...rule.shifts] };
  }).sort((a, b) => a.startDate.localeCompare(b.startDate));
}

module.exports = { normalizeShiftRules, defaultRules };
