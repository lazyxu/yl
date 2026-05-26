import React from 'react'
import Box from '@mui/material/Box'

function getTextColor(hex){
  try{
    const c = (hex||'#ffffff').replace('#','')
    const r = parseInt(c.substr(0,2),16)
    const g = parseInt(c.substr(2,2),16)
    const b = parseInt(c.substr(4,2),16)
    const lum = (0.2126*r + 0.7152*g + 0.0722*b) / 255
    return lum > 0.6 ? '#000' : '#fff'
  }catch(e){ return '#000' }
}

export default function ColorSwatch({ code, hex = '#ffffff', size = 'sm', sx = {} }){
  const textColor = getTextColor(hex)
  const defaultSx = {
    p: 0.5,
    borderRadius: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: { xs: '10px', sm: '11px' }
  }

  // size can be 'sm'|'md'|'lg' or a numeric pixel width
  let width = 36, height = 20, fontWeight = 700
  if (size === 'md') { width = 44; height = 24 }
  else if (size === 'lg') { width = 56; height = 32 }
  else if (typeof size === 'number') { width = size; height = Math.round(size * 0.56) }
  return (
    <Box
      sx={{
        ...defaultSx,
        width,
        height,
        background: hex,
        border: '1px solid rgba(0,0,0,0.06)',
        color: textColor,
        fontWeight,
        ...sx
      }}
      title={`${code} ${hex}`}
    >
      <span aria-hidden>{code}</span>
    </Box>
  )
}
