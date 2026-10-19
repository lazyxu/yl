import React from 'react'
import { Box, Stack, Typography } from '@mui/material'
import { LocalFloristOutlined } from '@mui/icons-material'
import { gardenPhoto } from '../gardenApi'


export function Cover({ id, height = 178, label = '花卉照片' }) {
  return <Box className="garden-cover" sx={{ height }}>
    {id ? <img src={gardenPhoto(id)} alt={label} loading="lazy" /> :
      <LocalFloristOutlined sx={{ fontSize: 58, color: '#9bbc96' }} />}
  </Box>
}
export function SectionTitle({ title, detail, action }) {
  return <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} mb={2}>
    <Box><Typography variant="h5" sx={{ fontWeight: 750, color: '#335d43' }}>{title}</Typography>
      {detail && <Typography variant="body2" color="text.secondary">{detail}</Typography>}
    </Box>{action}
  </Stack>
}
