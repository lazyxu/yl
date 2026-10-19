import MARD from './colorPalettes/mard.json'

// A stable index shared by inventory, color selector, history and draft editor.
// The previous MARD.find() searched the whole palette on every color card.
const table = new Map()
for (const item of MARD) {
  if (!table.has(item.code)) table.set(item.code, item)
}
export const PALETTE_CODES = new Set(table.keys())
export function findPalette(code) { return table.get(code) }
