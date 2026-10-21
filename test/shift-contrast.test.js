import { shiftStyle } from '../src/shifts'

const luminance = hex => {
  const pieces = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255)
  const [r, g, b] = pieces.map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

test.each(['白班', '夜班', '休息', '备班'])('%s 日历、规则与编辑器共用对比度合格的白字状态标签', shift => {
  const style = shiftStyle(shift)
  expect(style.color.toLowerCase()).toBe('#ffffff')
  expect(style.backgroundColor).toMatch(/^#[0-9a-fA-F]{6}$/)
  const contrast = 1.05 / (luminance(style.backgroundColor) + 0.05)
  expect(contrast).toBeGreaterThanOrEqual(4.5)
})

test('未知班次保留无色标签，避免白字盖在透明底上', () => {
  expect(shiftStyle('其他')).toEqual({})
})
