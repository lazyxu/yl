import React, { useEffect, useState } from 'react'
import { Alert, Button, Snackbar } from '@mui/material'
import { applyPWAUpdate, subscribePWAUpdate } from './pwaUpdate'

export default function PWAUpdatePrompt({ currentView }) {
  const [ready, setReady] = useState(false)
  const [deferred, setDeferred] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => subscribePWAUpdate(value => {
    setReady(value)
    if (value) setDeferred(false)
  }), [])
  const update = () => {
    // Loading a new JS generation mid-submit can cause lost work. Editing,
    // upload and modal sheets all have priority over a PWA code refresh.
    const hasDialog = Boolean(document.querySelector('[role="dialog"]:not([aria-hidden="true"])'))
    if (hasDialog || ['补豆', '消耗', '历史'].includes(currentView)) {
      setMessage('请先完成或关闭当前编辑，再更新应用')
      return
    }
    if (!applyPWAUpdate()) setMessage('尚未检测到可安装的新版本，请联网后重试')
  }
  return <>
    <Snackbar open={ready && !deferred} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      sx={{ bottom: 'max(72px, env(safe-area-inset-bottom, 0px) + 68px) !important',
        pointerEvents: 'none', '& .MuiAlert-action button': { pointerEvents: 'auto' } }}>
      <Alert severity="info" variant="filled" sx={{ alignItems: 'center' }}
        action={<>
          <Button color="inherit" onClick={() => setDeferred(true)}>稍后</Button>
          <Button color="inherit" onClick={update}>更新</Button>
        </>}>
        新版本已准备好，保存当前编辑后可更新
      </Alert>
    </Snackbar>
    <Snackbar open={Boolean(message)} autoHideDuration={4300}
      onClose={() => setMessage('')} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      sx={{ pointerEvents: 'none', '& .MuiAlert-action button': { pointerEvents: 'auto' } }}>
      <Alert severity="warning" onClose={() => setMessage('')}>{message}</Alert>
    </Snackbar>
  </>
}
