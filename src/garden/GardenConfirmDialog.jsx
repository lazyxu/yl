
import React from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material'

export default function GardenConfirmDialog({ open, title, description, confirmText = '删除', busy = false, onCancel, onConfirm, destructive = true }) {
  return <Dialog open={Boolean(open)} onClose={busy ? undefined : onCancel} maxWidth="xs" fullWidth
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
