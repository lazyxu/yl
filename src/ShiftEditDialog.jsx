import React, { useEffect, useRef, useState } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, useMediaQuery } from '@mui/material'
import useKeyboardViewport from './useKeyboardViewport'

export default function ShiftEditDialog({
  open = true, title, titleId, saving, onCancel, onConfirm, children,
  confirmDisabled = false, dirty = false,
}) {
  const fullScreen = useMediaQuery('(max-width:600px), (max-height:480px) and (pointer:coarse)')
  const viewport = useKeyboardViewport()
  const keyboardOpen = fullScreen && viewport.keyboardOpen
  const [discardOpen, setDiscardOpen] = useState(false)
  const pendingNavigation = useRef(null)

  useEffect(() => {
    if (!open) { setDiscardOpen(false); pendingNavigation.current = null }
  }, [open]))
  useEffect(() => {
    if (!open || !dirty) return
    const warn = event => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [open, dirty])

  useEffect(() => {
    if (!open || !dirty || saving) return
    const intercept = event => {
      event.preventDefault()
      pendingNavigation.current = event.detail?.proceed || null
      setDiscardOpen(true)
    }
    window.addEventListener('yl:navigation-intent', intercept)
    return () => window.removeEventListener('yl:navigation-intent', intercept)
  }, [open, dirty, saving])
  function requestClose() {
    if (saving) return
    if (dirty) setDiscardOpen(true)
    else onCancel()
  }
  return <>
    <Dialog open={open} fullWidth maxWidth="sm" fullScreen={fullScreen}
      className="shift-settings-dialog shift-edit-dialog"
      aria-labelledby={titleId} data-keyboard-open={keyboardOpen}
      onClose={requestClose}
      PaperProps={{ style: keyboardOpen ? { height: viewport.height, maxHeight: viewport.height } : undefined }}>
      <DialogTitle component="div" className="shift-settings-heading shift-editor-toolbar">
        <Button onClick={requestClose} disabled={saving}>取消</Button>
        <h2 id={titleId}>{title}</h2>
        <Button variant="contained" disableElevation onClick={onConfirm}
          disabled={saving || confirmDisabled}>
          {saving ? '正在保存…' : '确认'}
        </Button>
      </DialogTitle>
      <DialogContent className="shift-settings-content">{children}</DialogContent>
    </Dialog>
    <Dialog open={discardOpen} onClose={() => setDiscardOpen(false)}
      aria-labelledby="shift-discard-title" className="shift-settings-dialog shift-discard-dialog"
      maxWidth="xs" fullWidth>
      <DialogTitle id="shift-discard-title">放弃未保存的修改？</DialogTitle>
      <DialogContent>
        <DialogContentText>当前编辑的排班尚未保存，放弃后不会修改原排班数据。</DialogContentText>
      </DialogContent>
      <DialogActions className="shift-confirm-actions">
        <Button onClick={() => { pendingNavigation.current = null; setDiscardOpen(false) }}>继续编辑</Button>
        <Button color="error" variant="contained" onClick={() => {
          const proceed = pendingNavigation.current
          pendingNavigation.current = null
          setDiscardOpen(false); onCancel(); proceed?.()
        }}>放弃更改</Button>
      </DialogActions>
    </Dialog>
  </>
}
