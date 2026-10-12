export function createPindouDraft(rows = []) {
  const itemsMap = {}
  rows.forEach(row => { itemsMap[row.color] = Number(row.count) || 0 })
  return { itemsMap, selectedCodes: rows.map(row => row.color), applyCount: '', note: '', imgFile: null }
}
