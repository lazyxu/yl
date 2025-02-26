import moment from 'moment';
import { getShift } from './utils';

describe('getShift函数测试', () => {
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