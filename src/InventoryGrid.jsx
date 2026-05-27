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

  React.useEffect(() => {
    // sync when groupedInventory changes: default to first column only
    const first = groupedInventory.length ? groupedInventory[0][0] : undefined
    setVisibleGroups(first ? new Set([first]) : new Set())
  }, [groupedInventory])

  function toggleGroup(letter){
    setVisibleGroups(prev => {
      const next = new Set(prev)
      if (next.has(letter)) next.delete(letter)
      else next.add(letter)
      return next
    })
  }

  return (
    <Box sx={{ pr:0, width: '100%' }}>
      {/* 如果只有一个分组且名称为 '全部'，隐藏列选择复选行 */}
      {!(letters.length === 1 && letters[0] === '全部') && (
        <Box sx={{ mb:1 }}>
          <FormGroup row>
            {letters.map(letter => (
              <FormControlLabel
                key={letter}
                control={<Checkbox size="small" checked={visibleGroups.has(letter)} onChange={() => toggleGroup(letter)} />}
                label={letter}
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
