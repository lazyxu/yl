import React, { useRef, useState } from 'react'
import { Alert, Button } from '@mui/material'
import moment from 'moment'
import ShiftEditDialog from './ShiftEditDialog'
import { shiftNames, shiftStyle } from './shifts'
import { saveDayShift } from './shiftSettingsApi'

export default function DayShiftEditor({ open = true, date, baseShift, snapshot, onCancel, onSaved, onReload }) {
  const existing = snapshot.overrides[date]
  const [kind, setKind] = useState(existing?.kind || 'normal')
  const [shift, setShift] = useState(existing?.kind === 'swap' ? existing.shift : baseShift)
  const [partner, setPartner] = useState(existing?.partner || '')
  const [note, setNote] = useState(existing?.note || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const busy = useRef(false)
  const locked = error?.status === 409
  const effective = kind === 'standby' ? '备班' : kind === 'swap' ? shift : baseShift
  function change(setter, value) { setter(value); setError(null) }
  async function confirm() {
    if (busy.current || locked) return
    const override = kind === 'normal' ? null : { kind, shift: effective, partner: kind === 'swap' ? partner.trim() : '', note: note.trim() }
    busy.current = true; setSaving(true); setError(null)
    try { onSaved(await saveDayShift(date, override, snapshot.version)) }
    catch (failure) { setError({ message: failure.message || '保存失败，草稿已保留，请重试', status: failure.status }) }
    finally { busy.current = false; setSaving(false) }
  }
  async function reload() {
    busy.current = true; setSaving(true)
    try { if (await onReload()) onCancel(); else setError({ message: '重新加载失败，请重试', status: 409 }) }
    catch { setError({ message: '重新加载失败，请重试', status: 409 }) }
    finally { busy.current = false; setSaving(false) }
  }
  return <ShiftEditDialog open={open} title="调整当天排班" titleId="day-shift-title" saving={saving} onCancel={onCancel} onConfirm={confirm} confirmDisabled={locked}>
    <p className="shift-day-title">{moment(date).format('YYYY年MM月DD日')}<span className="shift-cycle-chip" style={shiftStyle(effective)}>{effective}</span></p>
    <p className="shift-edit-hint">原排班：{baseShift}。本次调整只影响这一天。</p>
    {error && <Alert severity="error" action={locked ? <Button color="inherit" onClick={reload} disabled={saving}>重新加载</Button> : undefined}>{error.message}{locked && '。重新加载后关闭弹窗，请重新编辑。'}</Alert>}
    <label className="shift-date-field">调整类型<select aria-label="调整类型" value={kind} disabled={saving || locked} onChange={event => change(setKind, event.target.value)}><option value="normal">正常排班（还原）</option><option value="standby">备班</option><option value="swap">换班</option></select></label>
    {kind === 'swap' && <><label className="shift-date-field">换班对象（可选）<input aria-label="换班对象" value={partner} maxLength={80} disabled={saving || locked} placeholder="可不填写对方姓名" onChange={event => change(setPartner, event.target.value)} /></label>
      <label className="shift-date-field">换后的班次<select aria-label="换后的班次" value={shift} disabled={saving || locked} style={shiftStyle(shift)} onChange={event => change(setShift, event.target.value)}>{shiftNames.map(value => <option key={value}>{value}</option>)}</select></label></>}
    {kind !== 'normal' && <label className="shift-date-field">备注（可选）<textarea aria-label="备注（可选）" rows={3} value={note} maxLength={500} disabled={saving || locked} placeholder="可填写换班原因或其他说明" onChange={event => change(setNote, event.target.value)} /></label>}
  </ShiftEditDialog>
}
