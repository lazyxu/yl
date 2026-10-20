
import React, { useEffect, useState } from 'react'
import { Box, Button, Dialog, DialogContent, DialogTitle, useMediaQuery } from '@mui/material'
import GardenConfirmDialog from './GardenConfirmDialog'

export default function GardenFormDialog({ open, title, busy, dirty, onClose, onSave, children, saveLabel = '保存' }) {
  const phone = useMediaQuery('(max-width:599.95px)')
  const [discardConfirm, setDiscardConfirm] = useState(false)
  useEffect(() => {
    if (!open) setDiscardConfirm(false)
  }, [open])
  useEffect(() => {
    if (!open || !dirty) return
    const warn = event => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [open, dirty])
  const requestClose = () => {
    if (busy) return
    if (dirty) setDiscardConfirm(true)
    else onClose()
  }
  return <>
    <Dialog open={open} onClose={requestClose} fullScreen={phone} fullWidth maxWidth="sm"
      scroll="paper" aria-label={title}
      PaperProps={{ className: 'garden-editor-dialog', sx: { borderRadius: phone ? '0 !important' : 3 } }}>
      <DialogTitle sx={{ p: phone ? 'max(12px, env(safe-area-inset-top, 0px)) 12px 6px' : '8px 14px 4px' }}>
        <div className="garden-form-toolbar">
          <Button disabled={busy} onClick={requestClose}>取消</Button>
          <h2>{title}</h2>
          <Button disabled={busy} variant="contained" onClick={onSave} aria-label={saveLabel}>
            {busy ? '保存中…' : saveLabel}
          </Button>
        </div>
      </DialogTitle>
      <DialogContent sx={{ px: { xs: 2, sm: 3 }, pb: 'max(26px, env(safe-area-inset-bottom, 0px))' }}>
        <Box className="garden-form-section">{children}</Box>
      </DialogContent>
    </Dialog>
    <GardenConfirmDialog open={discardConfirm} title="放弃未保存的更改？"
      description="当前填写的内容尚未保存。返回后这些修改将丢失。"
      confirmText="放弃更改" destructive
      onCancel={() => setDiscardConfirm(false)}
      onConfirm={() => { setDiscardConfirm(false); onClose() }} />
  </>
}
