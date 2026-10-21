
import React, { useMemo, useState } from 'react'
import { Box, IconButton, Menu, MenuItem, Typography } from '@mui/material'
import { DeleteOutline, EditOutlined, MoreHoriz, YardOutlined } from '@mui/icons-material'
import { gardenPhoto, displayDate } from '../gardenApi'
import OfflinePhoto from '../offline/OfflinePhoto'

export default function GrowthTimeline({ entries, photos, onEdit, onDelete, onOpenPhoto, readOnly = false }) {
  const [menuState, setMenuState] = useState(null)
  const indices = useMemo(() => new Map(photos.map((photo, index) => [photo.id, index])), [photos])
  let previousMonth = ''
  if (!entries.length) return <div className="garden-empty" role="status">
    <YardOutlined sx={{ fontSize: 46, color: '#91b59b' }}/>
    <Typography fontWeight={750}>{readOnly ? '本机没有可查看的成长记录' : '还没有成长日记'}</Typography>
    <Typography variant="body2" color="text.secondary">
      {readOnly ? '离线数据可能不完整，不代表这株花没有成长日记；联网后可查看最新内容。' :
        '记录第一次发芽或开花的瞬间吧。'}
    </Typography>
  </div>
  return <div aria-label="成长日记列表">
    {entries.map(entry => {
      const date = new Date(entry.observed_at)
      const month = Number.isFinite(date.getTime())
        ? date.getFullYear() + ' 年 ' + (date.getMonth() + 1) + ' 月'
        : '未知日期'
      const showMonth = month !== previousMonth
      previousMonth = month
      return <React.Fragment key={entry.id}>
        {showMonth && <div className="garden-timeline-month">{month}</div>}
        <article className="garden-timeline-entry" aria-label={displayDate(entry.observed_at)}>
          <Box display="flex" alignItems="center" justifyContent="space-between" gap={1}>
            <Box minWidth={0}>
              <div className="garden-timeline-date">{displayDate(entry.observed_at)}</div>
              {entry.author_name && <Typography variant="caption" color="text.secondary">记录者：{entry.author_name}</Typography>}
            </Box>
            {!readOnly && <IconButton aria-label="日记操作"
              onClick={event => setMenuState({ anchor: event.currentTarget, entry })}>
              <MoreHoriz/>
            </IconButton>}
          </Box>
          {entry.note && <p className="garden-timeline-note">{entry.note}</p>}
          <Box display="grid" gridTemplateColumns={(entry.photos || []).length === 1 ? '1fr' : 'repeat(2, minmax(0, 1fr))'}
            gap={1} mt={entry.note ? 1 : 1.5}>
            {(entry.photos || []).map(photo => <button type="button" className="garden-picture-button" key={photo.id}
              aria-label={'查看照片：' + photo.name} onClick={() => onOpenPhoto(indices.get(photo.id))}>
              <OfflinePhoto src={gardenPhoto(photo.id)} alt={photo.name} loading="lazy" />
            </button>)}
          </Box>
        </article>
      </React.Fragment>
    })}
    <Menu open={Boolean(menuState)} anchorEl={menuState?.anchor} onClose={() => setMenuState(null)}>
      <MenuItem aria-label="编辑日记" onClick={() => { onEdit(menuState.entry); setMenuState(null) }}>
        <EditOutlined fontSize="small" sx={{ mr: 1 }}/>编辑日记
      </MenuItem>
      <MenuItem aria-label="删除日记" sx={{ color: 'error.main' }}
        onClick={() => { onDelete(menuState.entry); setMenuState(null) }}>
        <DeleteOutline fontSize="small" sx={{ mr: 1 }}/>删除日记
      </MenuItem>
    </Menu>
  </div>
}
