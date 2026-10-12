import React, { useEffect, useRef, useState } from 'react'
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, TextField, Typography } from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import moment from 'moment'
import { saveShiftSettings } from './shiftSettingsApi'

export default function ShiftSettings({ open, settings, onClose, onSaved, onReload }) {
  const [draft, setDraft] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const nextKey = useRef(0)

  useEffect(() => {
    if (open) {
      setDraft(settings.rules.map(rule => ({ ...rule, shifts: [...rule.shifts], rowKey: nextKey.current++ })))
      setError(null)
    }
  }, [open, settings])

  function changeRule(rowKey, update) {
    setDraft(current => current.map(rule => rule.rowKey === rowKey ? { ...rule, ...update } : rule))
    setError(null)
  }

  function addRule() {
    const shifts = draft[draft.length - 1]?.shifts || ['白班', '白班', '休息', '夜班', '夜班', '休息', '休息', '休息']
    const rowKey = nextKey.current++
    setDraft(current => [...current, { rowKey, startDate: moment().format('YYYY-MM-DD'), shifts: [...shifts] }])
    setError(null)
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const rules = draft.map(({ startDate, shifts }) => ({ startDate, shifts }))
      const saved = await saveShiftSettings(rules, settings.version)
      onSaved(saved)
    } catch (failure) {
      setError({ message: failure.message || '保存失败，请稍后重试', status: failure.status })
    } finally { setSaving(false) }
  }

  async function reload() {
    setSaving(true)
    try {
      const loaded = await onReload()
      if (!loaded) setError({ message: '重新加载失败，请稍后重试', status: 409 })
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onClose={() => { if (!saving) onClose() }} fullWidth maxWidth="md" aria-labelledby="shift-settings-title">
      <DialogTitle id="shift-settings-title">排班设置</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          从生效日期开始按班次顺序循环，直到下一条规则生效。保存后，下次打开日历仍会使用这些规则。
        </Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }} action={error.status === 409 ? <Button color="inherit" disabled={saving} onClick={reload}>重新加载</Button> : undefined}>{error.message}</Alert>}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {draft.map((rule, index) => (
            <Box key={rule.rowKey} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mb: 2 }}>
                <Typography variant="subtitle2" sx={{ mr: 1 }}>规则 {index + 1}</Typography>
                <TextField type="date" size="small" label="生效日期" value={rule.startDate} disabled={saving} InputLabelProps={{ shrink: true }} inputProps={{ 'aria-label': `规则${index + 1}生效日期` }} onChange={event => changeRule(rule.rowKey, { startDate: event.target.value })} />
                <Button color="error" size="small" disabled={saving || draft.length === 1} onClick={() => { setDraft(current => current.filter(item => item.rowKey !== rule.rowKey)); setError(null) }} aria-label={`删除规则${index + 1}`}>删除规则</Button>
              </Box>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
                {rule.shifts.map((shift, day) => (
                  <Box key={day} sx={{ display: 'flex', alignItems: 'center' }}>
                    <TextField select size="small" label={`第 ${day + 1} 天`} value={shift} disabled={saving} SelectProps={{ native: true }} inputProps={{ 'aria-label': `规则${index + 1}第${day + 1}天班次` }} sx={{ minWidth: 100 }} onChange={event => changeRule(rule.rowKey, { shifts: rule.shifts.map((value, i) => i === day ? event.target.value : value) })}>
                      {['白班', '夜班', '休息'].map(value => <option key={value} value={value}>{value}</option>)}
                    </TextField>
                    <IconButton size="small" disabled={saving || rule.shifts.length === 1} aria-label={`删除规则${index + 1}第${day + 1}天`} onClick={() => changeRule(rule.rowKey, { shifts: rule.shifts.filter((_, i) => i !== day) })}><DeleteIcon fontSize="small" /></IconButton>
                  </Box>
                ))}
              </Box>
              <Button size="small" sx={{ mt: 1 }} disabled={saving || rule.shifts.length >= 366} aria-label={`规则${index + 1}添加一天`} onClick={() => changeRule(rule.rowKey, { shifts: [...rule.shifts, '休息'] })}>添加一天</Button>
            </Box>
          ))}
        </Box>
        <Button variant="outlined" sx={{ mt: 2 }} onClick={addRule} disabled={saving || draft.length >= 100}>新增排班规则</Button>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>取消</Button>
        <Button variant="contained" onClick={save} disabled={saving || !draft.length}>{saving ? '正在处理…' : '保存设置'}</Button>
      </DialogActions>
    </Dialog>
  )
}
