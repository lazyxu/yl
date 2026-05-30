import React from 'react'
import Box from '@mui/material/Box'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormGroup from '@mui/material/FormGroup'
import ColorSwatch from './ColorSwatch'

const ColorCard = React.memo(function ColorCard({ it, findPalette }){
  const p = findPalette(it.color)
  const hex = p ? p.hex : '#fff'
  const cnt = it.count || 0
  return (
    <Box sx={{ position: 'relative', p: 0 }}>
      <Box role="listitem" aria-label={`${it.color}，${cnt} 颗`} sx={{ p:0, touchAction:'manipulation', border: 'none', borderRadius: 0, boxShadow: 'none' }}>
        <Box sx={{ p:0 }}>
          <Box sx={{ p:0, display:'flex', alignItems: 'center', gap:0.5 }}>
            <ColorSwatch code={it.color} hex={hex} />
            <Box sx={{ ml:0.5, p:0, display:'flex', alignItems:'center', fontWeight:700, fontSize:{xs:'10px', sm:'11px'}, opacity: cnt === 0 ? 0.5 : 1 }} aria-hidden>{cnt}</Box>
            <Box sx={{ flex:1, minWidth:0 }} />
          </Box>
        </Box>
      </Box>
    </Box>
  )
})

export default function InventoryGrid({ groupedInventory = [], findPalette = ()=>{}, showZero = false }){
  if (!Array.isArray(groupedInventory) || groupedInventory.length === 0) return null

  const letters = groupedInventory.map(([l]) => l)
  const firstLetter = letters.length ? letters[0] : undefined
  const [visibleGroups, setVisibleGroups] = React.useState(() => (firstLetter ? new Set([firstLetter]) : new Set()))

  const prevLettersRef = React.useRef(null)
  React.useEffect(() => {
    // 仅在分组键（letters）发生变化时重置 visibleGroups 为第一个分组。
    // 这样可以避免 items/count 变更（例如“应用到所选”）导致的重置。
    const newLetters = groupedInventory.map(([l]) => l)
    const prev = prevLettersRef.current
    const same = prev && prev.length === newLetters.length && prev.every((v, i) => v === newLetters[i])
    if (!same) {
      const first = groupedInventory.length ? groupedInventory[0][0] : undefined
      setVisibleGroups(first ? new Set([first]) : new Set())
    }
    prevLettersRef.current = newLetters
  }, [groupedInventory])

  function toggleGroup(letter){
    setVisibleGroups(prev => {
      const next = new Set(prev)
      if (next.has(letter)) next.delete(letter)
      else next.add(letter)
      return next
    })
  }

  function toggleAll(){
    setVisibleGroups(prev => {
      const allSelected = letters.length > 0 && letters.every(l => prev.has(l))
      return allSelected ? new Set() : new Set(letters)
    })
  }

  const groupCounts = React.useMemo(() => {
    const m = new Map()
    for (const [l, items] of groupedInventory) {
      const cnt = (items || []).reduce((s, it) => s + (Number(it.count) || 0), 0)
      m.set(l, cnt)
    }
    return m
  }, [groupedInventory])

  return (
    <Box sx={{ pr:0, width: '100%' }}>
      {/* 如果只有一个分组且名称为 '全部'，隐藏列选择复选行 */}
      {!(letters.length === 1 && letters[0] === '全部') && (
        <Box sx={{ mb:1 }}>
          <FormGroup row>
            {/* 全选 控件 */}
            {letters.length > 0 && (() => {
              const allSelected = letters.every(l => visibleGroups.has(l))
              const someSelected = letters.some(l => visibleGroups.has(l)) && !allSelected
              return (
                <FormControlLabel
                  key="__all__"
                  control={
                    <Checkbox
                      size="small"
                      checked={allSelected}
                      indeterminate={someSelected}
                      onChange={() => toggleAll()}
                    />
                  }
                  label="全选"
                />
              )
            })()}
            {letters.map(letter => (
              <FormControlLabel
                key={letter}
                control={<Checkbox size="small" checked={visibleGroups.has(letter)} onChange={() => toggleGroup(letter)} />}
                label={`${letter} (${groupCounts.get(letter) || 0})`}
              />
            ))}
          </FormGroup>
        </Box>
      )}

      <Box sx={{ display: 'flex', gap: 0, alignItems: 'flex-start', flexWrap: 'wrap', width: '100%' }}>
        {groupedInventory.filter(([letter]) => visibleGroups.has(letter)).map(([letter, items]) => (
          <Box key={letter} sx={{ display: 'flex', flexDirection: 'column', gap: 1,  flex: '1' }}>
            {items.filter(it => showZero || (Number(it.count) || 0) !== 0).map((it) => (
              <Box key={it.color} sx={{ p: 0, display: 'flex', alignItems: 'center', width: '100%' }}>
                <ColorCard it={it} findPalette={findPalette} />
              </Box>
            ))}
          </Box>
        ))}
      </Box>
    </Box>
  )
}
