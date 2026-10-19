import React from 'react'
import { Alert, FormControl, Grid, InputLabel, MenuItem, Paper, Select, Stack, Typography } from '@mui/material'
import { gardenPhoto, displayDate } from '../gardenApi'

export default function GrowthComparison({ shots, first, second, onFirst, onSecond }) {
  const compareA = first < 0 ? shots.length - 1 : first
  const compareB = second < 0 ? 0 : second
  return (<Paper sx={{ p: 2.5 }}>
      <Typography variant="h6" mb={1}>见证生长变化</Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>选择不同日期的两张照片，观察花儿是怎样长大的。</Typography>
      {shots.length < 2 ? <Alert severity="info">至少需要两张成长照片才可以对比。</Alert> :
        <><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          {[first, second].map((value, idx) => <FormControl key={idx} fullWidth><InputLabel>{idx === 0 ? '较早的照片' : '较新的照片'}</InputLabel>
            <Select label={idx === 0 ? '较早的照片' : '较新的照片'} value={value < 0 ? idx === 0 ? shots.length - 1 : 0 : value} onChange={e => idx === 0 ? onFirst(Number(e.target.value)) : onSecond(Number(e.target.value))}>
              {shots.map((s, i) => <MenuItem key={s.photo.id} value={i}>{displayDate(s.at)} · {s.photo.name}</MenuItem>)}
            </Select>
          </FormControl>)}
        </Stack>
          <Grid container spacing={1.5} mt={1}>{[compareA, compareB].map((idx, i) => <Grid key={i} item xs={6}>
            <img className="garden-compare-photo" src={gardenPhoto(shots[idx].photo.id, 'preview')} alt={'成长对比照片' + (i + 1)} />
            <Typography variant="caption" color="text.secondary">{displayDate(shots[idx].at)}</Typography>
          </Grid>)}</Grid>
        </>}
    </Paper>)
}
