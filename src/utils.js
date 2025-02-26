import moment from 'moment';

const shifts = ['白班', '白班', '夜班', '休息', '休息', '夜班', '休息', '休息'];

// 计算班次（起始日期为2024-12-27）
const startDate = moment('2024-12-27');

export const getShift = (date) => {
  const diffDays = date.diff(startDate, 'days');
  return shifts[(diffDays % 8 + 8) % 8];
};
