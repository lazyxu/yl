/** @jest-environment jsdom */
import MARD from '../src/colorPalettes/mard.json'
import { findPalette, PALETTE_CODES } from '../src/palette'

test('indexed palette lookup keeps all original colors and references', () => {
  expect(PALETTE_CODES.size).toBe(new Set(MARD.map(item => item.code)).size)
  for (const item of MARD) {
    expect(PALETTE_CODES.has(item.code)).toBe(true)
    expect(findPalette(item.code)).toBe(MARD.find(entry => entry.code === item.code))
    expect(findPalette(item.code)?.hex).toBe(item.hex)
  }
  expect(findPalette('NOT-A-CODE')).toBeUndefined()
  expect(PALETTE_CODES.has('NOT-A-CODE')).toBe(false)
})
