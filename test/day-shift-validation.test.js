const { normalizeDayOverride } = require('../server/services/day-shifts')
test('备班和换班归一化，仅保留已验证字段', () => {
  expect(normalizeDayOverride('2026-10-13', { kind: 'standby', note: ' 值备班 ' })).toEqual({ kind: 'standby', shift: '备班', partner: '', note: '值备班' })
  expect(normalizeDayOverride('2026-10-13', { kind: 'swap', shift: '夜班', partner: ' 同事甲 ', note: '' })).toEqual({ kind: 'swap', shift: '夜班', partner: '同事甲', note: '' })
  expect(normalizeDayOverride('2026-10-13', null)).toBeNull()
})
test.each(['', '   ', undefined, null])('换班对象可留空或省略，统一保存为空字符串 %p', partner => {
  expect(normalizeDayOverride('2026-10-13', { kind: 'swap', shift: '夜班', partner, note: ' 临时调整 ' }))
    .toEqual({ kind: 'swap', shift: '夜班', partner: '', note: '临时调整' })
})

test('填写换班对象时允许最多 80 个字符', () => {
  expect(normalizeDayOverride('2026-10-13', { kind: 'swap', shift: '白班', partner: '甲'.repeat(80) }).partner).toBe('甲'.repeat(80))
})

test.each([
  ['2026-02-30', null], ['../bad', null],
  ['2026-10-13', { kind: 'swap', shift: '夜班', partner: '甲'.repeat(81) }],
  ['2026-10-13', { kind: 'swap', shift: '夜班', partner: 123 }],
  ['2026-10-13', { kind: 'swap', shift: '夜班', partner: false }],
  ['2026-10-13', { kind: 'swap', shift: '夜班', partner: {} }],
  ['2026-10-13', { kind: 'swap', shift: '夜班', partner: [] }],
  ['2026-10-13', { kind: 'swap', shift: '未知', partner: '甲' }],
  ['2026-10-13', { kind: 'other' }],
  ['2026-10-13', { kind: 'standby', note: 'x'.repeat(501) }],
  ['2026-10-13', { kind: 'standby', note: 123 }],
])('拒绝无效单日调整 %#', (date, value) => { expect(() => normalizeDayOverride(date, value)).toThrow() })
