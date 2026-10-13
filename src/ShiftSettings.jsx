import React, { useState } from 'react'
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, useMediaQuery } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import moment from 'moment'
import { shiftNames, shiftStyle } from './shifts'
import useShiftAutosave from './useShiftAutosave'
import useKeyboardViewport from './useKeyboardViewport'
import './ShiftSettings.css'

export default function ShiftSettings({ open, settings, onClose, onSaved, onReload }) {
  const { draft, saving, error, synced, update, add, reload, retry } = useShiftAutosave(open, settings, onSaved, onReload)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const fullScreen = useMediaQuery('(max-width: 600px)')
  const viewport = useKeyboardViewport()
  const keyboardOpen = fullScreen && viewport.keyboardOpen
  const ordered = [...draft].sort((a, b) => Number(Boolean(b.isNew)) - Number(Boolean(a.isNew)) || b.startDate.localeCompare(a.startDate))
  const dated = [...draft].filter(rule => moment(rule.startDate, 'YYYY-MM-DD', true).isValid()).sort((a, b) => a.startDate.localeCompare(b.startDate))
  const today = moment().format('YYYY-MM-DD')
  const activeRule = [...dated].reverse().find(rule => rule.startDate <= today)
  const locked = error?.status === 409
  function change(rowKey, changes) { update(rows => rows.map(rule => rule.rowKey === rowKey ? { ...rule, ...changes } : rule)) }
  function remove(rule) {
    update(rows => rows.filter(item => item.rowKey !== rule.rowKey))
    setDeleting(null)
    if (editing === rule.rowKey) setEditing(null)
  }
  function interval(rule) {
    const next = dated[dated.findIndex(item => item.rowKey === rule.rowKey) + 1]
    return next ? `至 ${moment(next.startDate).subtract(1, 'day').format('YYYY.MM.DD')}` : '持续生效，直到下一条排班开始'
  }
  function close() { if (!saving) onClose() }

  return <>
    <Dialog open={open} onClose={close} fullScreen={fullScreen} fullWidth maxWidth="sm" className="shift-settings-dialog" aria-labelledby="shift-settings-title" data-keyboard-open={keyboardOpen}
      PaperProps={{ style: keyboardOpen ? { height: viewport.height, maxHeight: viewport.height } : undefined }}>
      <DialogTitle id="shift-settings-title" className="shift-settings-heading">
        <span>排班设置</span>
        <IconButton aria-label="关闭排班设置" onClick={close} disabled={saving}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent className="shift-settings-content">
        <div className="shift-settings-toolbar">
          <Button variant="contained" disableElevation onClick={() => setEditing(add())} disabled={locked || draft.length >= 100 || draft.some(rule => rule.isNew && !rule.startDate)}>新增排班</Button>
          <span role="status" aria-live="polite" className={error ? 'shift-sync-error' : ''}>{saving ? '正在同步…' : error ? '修改尚未同步' : draft.some(rule => rule.isNew && !rule.startDate) ? '新排班待填写日期' : synced ? '已自动保存' : '修改后自动保存'}</span>
        </div>
        <div className="shift-legend" aria-label="班次颜色">
          {shiftNames.map(shift => <span key={shift} className="shift-legend-item"><i style={shiftStyle(shift)} />{shift}</span>)}
        </div>
        {error && <Alert severity="error" className="shift-settings-error" action={!error.validation ? <Button color="inherit" disabled={saving} onClick={locked ? async () => { await reload(); setEditing(null) } : retry}>{locked ? '重新加载' : '重试同步'}</Button> : undefined}>
          {error.message}{locked ? '。重新加载会用数据库里的设置替换尚未同步的修改。' : '。当前修改已保留。'}
        </Alert>}
        <div className="shift-timeline">
          {ordered.map(rule => {
            const expanded = editing === rule.rowKey
            const isValidDate = moment(rule.startDate, 'YYYY-MM-DD', true).isValid()
            const status = rule.isNew ? '新增' : rule.rowKey === activeRule?.rowKey ? '当前生效' : rule.startDate > today ? '待生效' : '历史排班'
            const name = rule.startDate || '新排班'
            return <section className={`shift-timeline-rule ${rule.rowKey === activeRule?.rowKey ? 'shift-rule-active' : ''}`} key={rule.rowKey} data-start-date={rule.startDate}>
              <div className="shift-rule-header">
                <div><div className="shift-rule-date">{isValidDate ? moment(rule.startDate).format('YYYY.MM.DD') : '新增排班'}<span className="shift-rule-status">{status}</span></div>
                  <div className="shift-rule-interval">{isValidDate ? interval(rule) : '填写生效日期后自动保存'} · {rule.shifts.length} 天循环</div></div>
                <Button size="small" onClick={() => setEditing(expanded ? null : rule.rowKey)} aria-expanded={expanded} aria-controls={`shift-editor-${rule.rowKey}`}>{expanded ? '收起' : '编辑'}</Button>
              </div>
              <div className="shift-cycle" aria-label={`${name} 循环班次`}>
                {rule.shifts.map((shift, day) => <span className="shift-cycle-day" key={day}><span className="shift-day-number">{day + 1}</span><span className="shift-cycle-chip" data-shift={shift} style={shiftStyle(shift)}>{shift}</span></span>)}
              </div>
              {expanded && <div className="shift-rule-editor" id={`shift-editor-${rule.rowKey}`}>
                <label className="shift-date-field">生效日期<input type="date" value={rule.startDate} disabled={locked} aria-label={`${name} 生效日期`} onChange={event => change(rule.rowKey, { startDate: event.target.value })} /></label>
                <div className="shift-edit-days">
                  {rule.shifts.map((shift, day) => <div className="shift-edit-day" key={day}>
                    <label><span>第 {day + 1} 天</span><select value={shift} style={shiftStyle(shift)} disabled={locked} aria-label={`${name} 第${day + 1}天班次`} onChange={event => change(rule.rowKey, { shifts: rule.shifts.map((value, index) => index === day ? event.target.value : value) })}>{shiftNames.map(value => <option key={value}>{value}</option>)}</select></label>
                    <IconButton size="small" aria-label={`移除第${day + 1}天`} disabled={locked || rule.shifts.length === 1} onClick={() => change(rule.rowKey, { shifts: rule.shifts.filter((_, index) => index !== day) })}><DeleteOutlineIcon fontSize="small" /></IconButton>
                  </div>)}
                </div>
                <div className="shift-editor-actions">
                  <Button onClick={() => change(rule.rowKey, { shifts: [...rule.shifts, '休息'] })} disabled={locked || rule.shifts.length >= 366}>添加一天</Button>
                  <Button color="error" disabled={locked || (!rule.isNew && dated.length <= 1)} onClick={() => rule.isNew && !rule.startDate ? remove(rule) : setDeleting(rule)}>删除排班</Button>
                </div>
              </div>}
            </section>
          })}
        </div>
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(deleting) && open} onClose={() => setDeleting(null)} aria-labelledby="shift-delete-title">
      <DialogTitle id="shift-delete-title">删除这条排班？</DialogTitle>
      <DialogContent>删除 {deleting?.startDate} 起的排班后，该时段将按其他规则计算。删除会立即保存。</DialogContent>
      <DialogActions><Button onClick={() => setDeleting(null)}>保留排班</Button><Button color="error" onClick={() => remove(deleting)} disabled={locked}>确认删除</Button></DialogActions>
    </Dialog>
  </>
}
