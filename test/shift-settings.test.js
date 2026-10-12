const { normalizeShiftRules } = require('../server/services/shift-settings');

describe('排班规则校验', () => {
  test('按生效日期排序并复制规则，不修改提交的数据', () => {
    const input = [
      { startDate: '2026-10-05', shifts: ['夜班', '休息'] },
      { startDate: '2024-02-29', shifts: ['白班'] },
    ];
    const result = normalizeShiftRules(input);
    expect(result.map(r => r.startDate)).toEqual(['2024-02-29', '2026-10-05']);
    expect(input[0].startDate).toBe('2026-10-05');
    result[1].shifts[0] = '白班';
    expect(input[0].shifts[0]).toBe('夜班');
  });

  test.each([
    null, [],
    [{ startDate: '2026-02-30', shifts: ['白班'] }],
    [{ startDate: '2026-10-05', shifts: [] }],
    [{ startDate: '2026-10-05', shifts: ['未知班次'] }],
    [{ startDate: '2026-10-05', shifts: ['白班'] }, { startDate: '2026-10-05', shifts: ['夜班'] }],
  ])('拒绝无效规则 %#', value => {
    expect(() => normalizeShiftRules(value)).toThrow();
  });
});
