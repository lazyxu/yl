import React, { useState } from 'react'
import { Button, Dialog, DialogContent, DialogTitle, IconButton, useMediaQuery } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import moment from 'moment'
import { shiftStyle } from './shifts'
import ShiftRuleEditor from './ShiftRuleEditor'
import './ShiftSettings.css'

export default function ShiftSettings({ open, settings, onClose, onSaved, onReload }) {
  const [editor, setEditor] = useState(null)
  const fullScreen = useMediaQuery('(max-width:600px), (max-height:480px) and (pointer:coarse)')
  const ordered = [...settings.rules].sort((a, b) => b.startDate.localeCompare(a.startDate))
  const today = moment().format('YYYY-MM-DD')
  const active = ordered.find(rule => rule.startDate <= today)
  function edit(rule = null) {
    setEditor({ rule: rule && { ...rule, shifts: [...rule.shifts] }, snapshot: { version: settings.version, rules: settings.rules.map(item => ({ ...item, shifts: [...item.shifts] })) } })
  }
  function interval(index) { return index ? `至 ${moment(ordered[index - 1].startDate).subtract(1, 'day').format('YYYY.MM.DD')}` : '持续生效，直到下一条排班开始' }
  return <>
    <Dialog open={open} onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="sm" className="shift-settings-dialog" aria-labelledby="shift-settings-title">
      <DialogTitle id="shift-settings-title" className="shift-settings-heading"><span>排班设置</span><IconButton aria-label="关闭排班设置" onClick={onClose}><CloseIcon /></IconButton></DialogTitle>
      <DialogContent className="shift-settings-content">
        <div className="shift-settings-toolbar">
          <Button variant="contained" disableElevation onClick={() => edit()}
            disabled={settings.rules.length >= 100}>新增排班</Button>
        </div>
        {active && <div className="shift-current-summary" aria-label="当前生效排班">
          <span className="shift-current-eyebrow">当前生效</span>
          <div className="shift-current-heading">{moment(active.startDate).format('YYYY年MM月DD日')} 起 · {active.shifts.length} 天循环</div>
          <div className="shift-cycle">{active.shifts.map((shift, day) => <span key={day} className="shift-cycle-day">
            <span className="shift-day-number">第 {day + 1} 天</span>
            <span className="shift-cycle-chip" style={shiftStyle(shift)}>{shift}</span>
          </span>)}</div>
        </div>}
        <h3 className="shift-settings-section-title">排班生效时间线</h3>
        <div className="shift-timeline">{ordered.map((rule, index) => <section key={rule.startDate} data-start-date={rule.startDate} className={`shift-timeline-rule ${rule === active ? 'shift-rule-active' : ''}`}>
          <div className="shift-rule-header"><div><div className="shift-rule-date">{moment(rule.startDate).format('YYYY.MM.DD')}<span className="shift-rule-status">{rule === active ? '当前生效' : rule.startDate > today ? '待生效' : '历史排班'}</span></div><div className="shift-rule-interval">{interval(index)} · {rule.shifts.length} 天循环</div></div><Button onClick={() => edit(rule)}>编辑</Button></div>
          <div className="shift-cycle" aria-label={`${rule.startDate} 循环班次`}>{rule.shifts.map((shift, day) => <span className="shift-cycle-day" key={day}><span className="shift-day-number">{day + 1}</span><span className="shift-cycle-chip" data-shift={shift} style={shiftStyle(shift)}>{shift}</span></span>)}</div>
        </section>)}</div>
      </DialogContent>
    </Dialog>
    {editor && <ShiftRuleEditor {...editor} open={open} onCancel={() => setEditor(null)} onSaved={saved => { onSaved(saved); setEditor(null) }} onReload={onReload} />}
  </>
}
