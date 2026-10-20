
import React from 'react'
import { Grid, Card, CardActionArea } from '@mui/material'
import { plantedDays } from '../gardenApi'
import { Cover } from './Shared'

export default function PlantGrid({ items, onSelect }) {
  return <Grid container spacing={{ xs: 1.4, sm: 2 }} className="garden-card-grid">
    {items.map(plant => <Grid item xs={6} sm={4} md={3} key={plant.id}>
      <Card elevation={0} className="garden-card">
        <CardActionArea onClick={() => onSelect(plant.id)} aria-label={'查看花卉：' + plant.name}>
          <Cover id={plant.latest_photo_id} height={null} className="garden-card-cover" label={plant.name} />
          <div className="garden-card-info">
            <div className="garden-card-title">{plant.name}</div>
            <div className="garden-card-meta">{plant.species_name || '未分类'}{plant.location ? ' · ' + plant.location : ''}</div>
            <div className="garden-card-meta">{plantedDays(plant.planted_on)
              ? '种植第 ' + plantedDays(plant.planted_on) + ' 天'
              : plant.photo_count + ' 张照片'}</div>
          </div>
        </CardActionArea>
      </Card>
    </Grid>)}
  </Grid>
}
