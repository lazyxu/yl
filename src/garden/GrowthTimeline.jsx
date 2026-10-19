import React from 'react'
import { Box, Card, CardContent, Grid, IconButton, Paper, Stack, Typography } from '@mui/material'
import { EditOutlined, DeleteOutline, YardOutlined } from '@mui/icons-material'
import { gardenPhoto, displayDate } from '../gardenApi'

export default function GrowthTimeline({ entries, photos, onEdit, onDelete, onOpenPhoto }) {
  return (<Stack spacing={2.5}>
      {entries.length === 0 && <Paper sx={{ textAlign: 'center', py: 8, borderRadius: 3 }}><YardOutlined sx={{ fontSize: 56, color: '#9bbc96' }} /><Typography>还没有成长日记，拍下第一张照片吧。</Typography></Paper>}
      {entries.map(entry => <Box key={entry.id} sx={{ borderLeft: '3px solid #b5ceb3', pl: 2, position: 'relative' }}>
        <Card variant="outlined"><CardContent sx={{ p: 2 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="start" gap={1}>
            <Box flex={1}><Typography fontWeight={750}>{displayDate(entry.observed_at)}</Typography>
              {entry.author_name && <Typography color="text.secondary" variant="caption">记录者：{entry.author_name}</Typography>}
            </Box>
            <IconButton size="small" aria-label="编辑日记" onClick={() => onEdit(entry)}><EditOutlined fontSize="small" /></IconButton>
            <IconButton size="small" color="error" aria-label="删除日记" onClick={() => onDelete(entry)}><DeleteOutline fontSize="small" /></IconButton>
          </Stack>
          {entry.note && <Typography sx={{ whiteSpace: 'pre-wrap', my: 1.5 }}>{entry.note}</Typography>}
          <Grid container spacing={1} mt={.1}>{entry.photos.map(photo => <Grid key={photo.id} item xs={entry.photos.length === 1 ? 12 : 6} sm={4}>
            <button className="garden-picture-button" onClick={() => onOpenPhoto(photos.findIndex(p => p.id === photo.id))} aria-label={'查看照片：' + photo.name}>
              <img src={gardenPhoto(photo.id)} loading="lazy" alt={photo.name} />
            </button>
          </Grid>)}</Grid>
        </CardContent></Card>
      </Box>)}
    </Stack>)
}
