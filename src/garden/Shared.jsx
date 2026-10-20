
import React, { useEffect, useState } from 'react'
import { Box } from '@mui/material'
import { LocalFloristOutlined } from '@mui/icons-material'
import { gardenPhoto } from '../gardenApi'

export function Cover({ id, height = 178, label = '花卉照片', className = '' }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [id])
  return <Box className={'garden-cover ' + className} sx={height == null ? undefined : { height }}>
    {id && !failed ? <img src={gardenPhoto(id)} alt={label} loading="lazy" onError={() => setFailed(true)} /> :
      <LocalFloristOutlined aria-hidden="true" sx={{ fontSize: 54, color: '#83a68c' }} />}
  </Box>
}
