// Calendar labels, timeline chips and editable fields share this palette.
const palette = {
  白班: { backgroundColor: '#DF7C7F', color: '#421B1D' },
  夜班: { backgroundColor: '#5DB9E2', color: '#123447' },
  休息: { backgroundColor: '#7AC252', color: '#20370F' },
}

export const shiftNames = Object.keys(palette)
export function shiftStyle(shift) { return palette[shift] || {} }
