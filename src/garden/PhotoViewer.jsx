import React, { useEffect, useState } from 'react'
import { Box, Dialog, IconButton, Stack, Typography } from '@mui/material'
import { ChevronLeft, ChevronRight, Close, DownloadOutlined } from '@mui/icons-material'
import { gardenPhoto } from '../gardenApi'


export default function Viewer({ photos, current, onClose }) {
  const [index, setIndex] = useState(current)
  useEffect(() => setIndex(current), [current])
  const selected = photos[index]
  if (!selected) return null
  return <Dialog open fullScreen onClose={onClose} PaperProps={{ sx: { bgcolor: '#111914', color: '#fff' } }}>
    <Stack direction="row" alignItems="center" px={2} sx={{ minHeight: 60 }}>
      <IconButton onClick={onClose} aria-label="关闭" sx={{ color: 'white' }}><Close /></IconButton>
      <Typography flex={1} textAlign="center">{index + 1} / {photos.length}</Typography>
      <IconButton component="a" href={gardenPhoto(selected.id, 'original') + '?download=1'} aria-label="下载原图" sx={{ color: 'white' }}><DownloadOutlined /></IconButton>
    </Stack>
    <Stack direction="row" alignItems="center" flex={1} minHeight={0}>
      <IconButton onClick={() => setIndex(i => i - 1)} aria-label="上一张" disabled={index === 0} sx={{ color: '#fff' }}><ChevronLeft /></IconButton>
      <Box flex={1} minWidth={0} display="grid" sx={{ placeItems: 'center' }}>
        <img className="garden-large-photo" src={gardenPhoto(selected.id, 'preview')} alt={selected.name} />
      </Box>
      <IconButton onClick={() => setIndex(i => i + 1)} aria-label="下一张" disabled={index === photos.length - 1} sx={{ color: '#fff' }}><ChevronRight /></IconButton>
    </Stack>
    <Typography textAlign="center" variant="caption" sx={{ py: 1.5, opacity: .7 }}>{selected.name}</Typography>
  </Dialog>
}
