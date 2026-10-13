// Calendar labels, timeline chips and editable fields share this palette.
const palette = {
  白班: { backgroundColor: '#DF7C7F', color: '#421B1D' },
  夜班: { backgroundColor: '#5DB9E2', color: '#123447' },
  休息: { backgroundColor: '#7AC252', color: '#20370F' },
  备班: { backgroundColor: '#BFA1EB', color: '#351851' },
}

export const shiftNames = ['白班', '夜班', '休息']
export function shiftStyle(shift) { return palette[shift] || {} }
