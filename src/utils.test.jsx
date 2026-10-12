import moment from 'moment';
import { getShift } from './utils';

describe('getShift函数测试', () => {
  test('使用设置中的循环长度和最新生效规则，不依赖固定八天', () => {
    const rules = [
      { startDate: '2026-10-10', shifts: ['夜班', '休息'] },
      { startDate: '2026-10-01', shifts: ['白班', '休息', '夜班'] },
    ];
    expect(getShift(moment('2026-10-02'), rules)).toBe('休息');
    expect(getShift(moment('2026-10-04'), rules)).toBe('白班');
    expect(getShift(moment('2026-10-10'), rules)).toBe('夜班');
    expect(getShift(moment('2026-10-13'), rules)).toBe('休息');
    expect(getShift(moment('2026-09-30'), rules)).toBe('夜班');
    expect(rules[0].startDate).toBe('2026-10-10');
  });

  test('getShift returns 白班 for 2024-12-27', () => {
    const date = moment('2024-12-27');
    expect(getShift(date)).toBe('白班');
  });

  test('getShift returns 白班 for 2024-12-28', () => {
    const date = moment('2024-12-28');
    expect(getShift(date)).toBe('白班');
  });

  test('getShift returns 夜班 for 2024-12-29', () => {
    const date = moment('2024-12-29');
    expect(getShift(date)).toBe('夜班');
  });
});
