import React, { useContext, useEffect } from 'react'
import { UNSAFE_DataRouterContext, unstable_useBlocker } from 'react-router-dom'
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material'

// The existing React Router 6.14 BrowserRouter cannot block POP history entries.
// Mount this only under a data router. The nested editor remains the owner of
// the unsaved draft and controls whether the user may discard it.
function ActiveDraftBlocker({ when, busy, onDiscard, title }) {
  const blocker = unstable_useBlocker(Boolean(when))
  const blocked = blocker.state === 'blocked'
  useEffect(() => {
    if (blocked && busy) blocker.reset()
  }, [blocked, busy, blocker])
  return <Dialog open={blocked && !busy} fullWidth maxWidth="xs"
    aria-labelledby="yl-router-draft-title" aria-describedby="yl-router-draft-description">
    <DialogTitle id="yl-router-draft-title">{title}</DialogTitle>
    <DialogContent>
      <DialogContentText id="yl-router-draft-description">
        离开当前页面会丢失未保存的修改，是否确定放弃？
      </DialogContentText>
    </DialogContent>
    <DialogActions sx={{ p: 2, gap: 1 }}>
      <Button onClick={() => blocker.reset()}>继续编辑</Button>
      <Button color="error" variant="contained" onClick={() => {
        onDiscard()
        blocker.proceed()
      }}>放弃更改</Button>
    </DialogActions>
  </Dialog>
}

export default function RouterDraftGuard({ open, when, busy, onDiscard, title }) {
  const dataRouter = useContext(UNSAFE_DataRouterContext)
  if (!dataRouter || !open) return null
  return <ActiveDraftBlocker when={when} busy={busy} onDiscard={onDiscard} title={title} />
}
