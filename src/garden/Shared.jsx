import React, { useEffect, useState } from 'react'
import { Box } from '@mui/material'
import { LocalFloristOutlined, BrokenImageOutlined } from '@mui/icons-material'
import { gardenPhoto } from '../gardenApi'
import OfflinePhoto from '../offline/OfflinePhoto'

// No photo and a failed photo are different states. A failed request can be
// retried without reopening a plant, keeping the cover's aspect ratio stable.
export function Cover({ id, height = 178, label = '花卉照片', className = '' }) {
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => { setFailed(false); setRetry(0) }, [id])
  const retryable = Boolean(id && failed)
  const onRetry = event => {
    if (!retryable) return
    event.preventDefault()
    event.stopPropagation()
    setFailed(false)
    setRetry(value => value + 1)
  }
  return <Box className={'garden-cover ' + className}
    data-retryable={retryable ? 'true' : undefined}
    title={retryable ? '照片加载失败，轻触重试' : undefined}
    onClick={onRetry}
    sx={height == null ? undefined : { height }}>
    {id && !failed ? <OfflinePhoto src={gardenPhoto(id) + (retry ? '?retry=' + retry : '')}
      alt={label} loading="lazy" onError={() => setFailed(true)} /> :
      <Box display="flex" alignItems="center" justifyContent="center" flexDirection="column">
        {retryable
          ? <BrokenImageOutlined aria-hidden="true" sx={{ fontSize: 42, color: '#83a68c' }}/>
          : <LocalFloristOutlined aria-hidden="true" sx={{ fontSize: 54, color: '#83a68c' }}/>}
        {retryable && <span className="garden-cover-failure">照片加载失败 · 轻触重试</span>}
      </Box>}
  </Box>
}
