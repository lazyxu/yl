// Shared iPhone-friendly shift palette. White labels require deeper shades
// than the former pastels; all four meet WCAG AA contrast for small text.
const palette = {
  白班: { backgroundColor: '#B6424B', color: '#FFFFFF' },
  夜班: { backgroundColor: '#166A94', color: '#FFFFFF' },
  休息: { backgroundColor: '#347D36', color: '#FFFFFF' },
  备班: { backgroundColor: '#7750A9', color: '#FFFFFF' },
}

export const shiftNames = ['白班', '夜班', '休息']
export function shiftStyle(shift) { return palette[shift] || {} }
