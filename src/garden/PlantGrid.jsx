import React from 'react'
import { Grid, Card, CardActionArea, CardContent, Typography } from '@mui/material'
import { plantedDays } from '../gardenApi'
import { Cover } from './Shared'

export default function PlantGrid({ items, onSelect }) {
    return <Grid container spacing={1.5}>{items.map(plant => <Grid item xs={6} sm={4} md={3} key={plant.id}>
      <Card variant="outlined" sx={{ height: '100%', borderRadius: 3, overflow: 'hidden' }}><CardActionArea sx={{ height: '100%' }} onClick={() => onSelect(plant.id)}>
        <Cover id={plant.latest_photo_id} height={165} label={plant.name} />
        <CardContent sx={{ p: 1.5 }}>
          <Typography fontWeight={750} noWrap>{plant.name}</Typography>
          <Typography variant="caption" color="text.secondary" display="block" noWrap>{plant.species_name || '未分类'} {plant.location ? '· ' + plant.location : ''}</Typography>
          <Typography variant="caption" sx={{ color: '#4a8258' }}>{plantedDays(plant.planted_on) ? '种植第 ' + plantedDays(plant.planted_on) + ' 天' : plant.photo_count + ' 张照片'}</Typography>
        </CardContent>
      </CardActionArea></Card>
    </Grid>)}</Grid>
}