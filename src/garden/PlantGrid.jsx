import React, { useEffect, useRef, useState } from 'react'
import { Grid, Card, CardActionArea, useMediaQuery } from '@mui/material'
import { plantedDays } from '../gardenApi'
import { Cover } from './Shared'

function CardBody({ plant, onSelect }) {
  const days = plantedDays(plant.planted_on)
  return <Card elevation={0} className="garden-card">
    <CardActionArea onClick={() => onSelect(plant.id)} aria-label={'查看花卉：' + plant.name}>
      <Cover id={plant.latest_photo_id} height={null} className="garden-card-cover" label={plant.name} />
      <div className="garden-card-info">
        <div className="garden-card-title">{plant.name}</div>
        <div className="garden-card-meta">{plant.species_name || '未分类'}{plant.location ? ' · ' + plant.location : ''}</div>
        <div className="garden-card-meta">{days ? '种植第 ' + days + ' 天' : plant.photo_count + ' 张照片'}</div>
      </div>
    </CardActionArea>
  </Card>
}

// Small collections keep the regular responsive MUI grid (and DOM shape).
// Large ungrouped collections window by rows against the existing App scroll
// container to avoid rendering thousands of offscreen photos/cards on iOS.
export default function PlantGrid({ items, onSelect, virtualize = true }) {
  const desktop = useMediaQuery('(min-width:900px)')
  const tablet = useMediaQuery('(min-width:600px)')
  const columns = desktop ? 4 : tablet ? 3 : 2
  const windowed = virtualize && items.length > 72
  const root = useRef(null)
  const [metrics, setMetrics] = useState(() => ({
    width: typeof window !== 'undefined' ? Math.min(window.innerWidth - 28, 1080) : 350,
    scroll: 0, viewport: 700, top: 0,
  }))
  useEffect(() => {
    if (!windowed || !root.current) return
    const element = root.current
    const scroller = element.closest('.app-page')
    if (!scroller) return
    function measure() {
      const rectangle = element.getBoundingClientRect()
      const scrollRectangle = scroller.getBoundingClientRect()
      const next = {
        width: element.clientWidth, scroll: scroller.scrollTop, viewport: scroller.clientHeight,
        top: rectangle.top - scrollRectangle.top + scroller.scrollTop,
      }
      setMetrics(previous => Object.keys(next).every(key => Math.abs(previous[key] - next[key]) < 1) ? previous : next)
    }
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    resize?.observe(element)
    scroller.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
    measure()
    return () => { resize?.disconnect(); scroller.removeEventListener('scroll', measure); window.removeEventListener('resize', measure) }
  }, [windowed, columns, items.length])

  if (!windowed) return <Grid container spacing={{ xs: 1.4, sm: 2 }} className="garden-card-grid">
    {items.map(plant => <Grid item xs={6} sm={4} md={3} key={plant.id}>
      <CardBody plant={plant} onSelect={onSelect}/>
    </Grid>)}
  </Grid>

  const gap = tablet ? 16 : 12
  const width = Math.max(200, metrics.width)
  const cellWidth = (width - (columns - 1) * gap) / columns
  const rowHeight = cellWidth * 1.25 + 90 + gap
  const rows = Math.ceil(items.length / columns)
  const start = Math.max(0, Math.floor((metrics.scroll - metrics.top) / rowHeight) - 3)
  const end = Math.min(rows, Math.ceil((metrics.scroll + metrics.viewport - metrics.top) / rowHeight) + 3)
  const visible = []
  for (let row = start; row < end; row++) {
    for (let column = 0; column < columns; column++) {
      const index = row * columns + column
      if (index >= items.length) break
      visible.push(<div role="listitem" key={items[index].id}
        style={{ position: 'absolute', top: row * rowHeight, left: column * (cellWidth + gap),
          width: cellWidth, height: rowHeight - gap }}>
        <CardBody plant={items[index]} onSelect={onSelect}/>
      </div>)
    }
  }
  return <div ref={root} role="list" aria-label="全部花卉列表"
    className="garden-virtual-grid" style={{ position: 'relative', height: Math.max(0, rows * rowHeight - gap) }}>
    {visible}
  </div>
}
