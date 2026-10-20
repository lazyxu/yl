import React, { useCallback, useContext, useEffect, useState } from 'react'
import { UNSAFE_DataRouterContext, UNSAFE_DataRouterStateContext } from 'react-router-dom'
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material'

// react-router-dom@6.14.1 npm runtime does not ship the unstable_useBlocker
// named export, despite its source API. Reproduce its small upstream hook
// against the pinned @remix-run/router@1.7.1 contract (getBlocker/deleteBlocker).
// Only mounted under createBrowserRouter: MemoryRouter keeps legacy tests.
let blockerSequence = 0
const IDLE = { state: 'unblocked' }
function useNativeDataRouterBlocker(when) {
  const context = useContext(UNSAFE_DataRouterContext)
  const state = useContext(UNSAFE_DataRouterStateContext)
  const router = context?.router
  const [key, setKey] = useState('')
  const shouldBlock = useCallback(() => Boolean(when), [when])
  useEffect(() => {
    if (!router) return
    const assigned = 'yl-pwa-draft-' + (++blockerSequence)
    setKey(assigned)
    return () => router.deleteBlocker(assigned)
  }, [router])
  useEffect(() => {
    if (router && key) router.getBlocker(key, shouldBlock)
  }, [router, key, shouldBlock])
  return key ? (state?.blockers?.get(key) || IDLE) : IDLE
}

function ActiveDraftBlocker({ when, busy, onDiscard, title }) {
  const blocker = useNativeDataRouterBlocker(when)
  const blocked = blocker.state === 'blocked'
  useEffect(() => {
    if (blocked && busy) blocker.reset?.()
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
      <Button onClick={() => blocker.reset?.()}>继续编辑</Button>
      <Button color="error" variant="contained" onClick={() => {
        onDiscard()
        blocker.proceed?.()
      }}>放弃更改</Button>
    </DialogActions>
  </Dialog>
}

export default function RouterDraftGuard({ open, when, busy, onDiscard, title }) {
  const dataRouter = useContext(UNSAFE_DataRouterContext)
  if (!dataRouter || !open) return null
  return <ActiveDraftBlocker when={when} busy={busy} onDiscard={onDiscard} title={title} />
}
