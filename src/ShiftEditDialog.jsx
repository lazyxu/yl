import React from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, useMediaQuery } from '@mui/material'
import useKeyboardViewport from './useKeyboardViewport'

export default function ShiftEditDialog({ open = true, title, titleId, saving, onCancel, onConfirm, children, confirmDisabled = false }) {
  const fullScreen = useMediaQuery('(max-width: 600px)')
  const viewport = useKeyboardViewport()
  const keyboardOpen = fullScreen && viewport.keyboardOpen
  return <Dialog open={open} fullWidth maxWidth="sm" fullScreen={fullScreen} className="shift-settings-dialog shift-edit-dialog" aria-labelledby={titleId}
    data-keyboard-open={keyboardOpen} onClose={() => { if (!saving) onCancel() }}
    PaperProps={{ style: keyboardOpen ? { height: viewport.height, maxHeight: viewport.height } : undefined }}>
    <DialogTitle id={titleId} className="shift-settings-heading">{title}</DialogTitle>
    <DialogContent className="shift-settings-content">{children}</DialogContent>
    <DialogActions className="shift-confirm-actions">
      <Button onClick={onCancel} disabled={saving}>取消</Button>
      <Button variant="contained" disableElevation onClick={onConfirm} disabled={saving || confirmDisabled}>{saving ? '正在保存…' : '确认'}</Button>
    </DialogActions>
  </Dialog>
}
