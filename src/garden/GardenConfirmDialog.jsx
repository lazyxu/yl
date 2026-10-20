
import React from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, useMediaQuery } from '@mui/material'

export default function GardenConfirmDialog({ open, title, description, confirmText = '删除', busy = false, onCancel, onConfirm, destructive = true }) {
  const phone = useMediaQuery('(max-width:599.95px), (max-height:480px) and (pointer:coarse)')
  return <Dialog open={Boolean(open)} onClose={busy ? undefined : onCancel} maxWidth="xs" fullWidth
    sx={phone ? { '& .MuiDialog-container': { alignItems: 'flex-end' } } : undefined}
    PaperProps={{ sx: phone ? {
      m: 0, width: '100%', maxWidth: '100%', borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
      borderTopLeftRadius: 20, borderTopRightRadius: 20,
      pb: 'max(8px, env(safe-area-inset-bottom, 0px))',
    } : undefined }}
    aria-labelledby="garden-confirm-title" aria-describedby="garden-confirm-description">
    <DialogTitle id="garden-confirm-title">{title}</DialogTitle>
    <DialogContent><DialogContentText id="garden-confirm-description">{description}</DialogContentText></DialogContent>
    <DialogActions sx={{ p: 2, gap: 1 }}>
      <Button onClick={onCancel} disabled={busy}>取消</Button>
      <Button variant="contained" color={destructive ? 'error' : 'primary'} onClick={onConfirm} disabled={busy}>
        {busy ? '正在处理…' : confirmText}
      </Button>
    </DialogActions>
  </Dialog>
}
