import React, { useRef, useState } from 'react'
import { Alert, Button } from '@mui/material'
import moment from 'moment'
import ShiftEditDialog from './ShiftEditDialog'
import SortableShiftDays from './SortableShiftDays'
import { saveShiftSettings } from './shiftSettingsApi'

export default function ShiftRuleEditor({ open = true, rule, snapshot, onCancel, onSaved, onReload }) {
  const [startDate, setStartDate] = useState(rule?.startDate || '')
  const [days, setDays] = useState(() => (rule?.shifts || snapshot.rules[snapshot.rules.length - 1].shifts).map((shift, id) => ({ id, shift })))
  const nextId = useRef(days.length)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const busy = useRef(false)
  const locked = error?.status === 409
  function update(change) { change(); setError(null) }
  async function confirm(remove = false) {
    if (busy.current || locked) return
    if (!remove && !moment(startDate, 'YYYY-MM-DD', true).isValid()) { setError({ message: '请填写有效的生效日期' }); return }
    if (!remove && snapshot.rules.some(item => item.startDate === startDate && item.startDate !== rule?.startDate)) { setError({ message: '生效日期不能重复' }); return }
    const changed = { startDate, shifts: days.map(day => day.shift) }
    const rules = rule ? snapshot.rules.flatMap(item => item.startDate === rule.startDate ? remove ? [] : [changed] : [item]) : [...snapshot.rules, changed]
    busy.current = true; setSaving(true); setError(null)
    try { onSaved(await saveShiftSettings(rules, snapshot.version)) }
    catch (failure) { setError({ message: failure.message || '保存失败，草稿已保留，请重试', status: failure.status }) }
    finally { busy.current = false; setSaving(false) }
  }
  async function reload() {
    busy.current = true; setSaving(true)
    try { if (await onReload()) onCancel(); else setError({ message: '重新加载失败，草稿仍保留', status: 409 }) }
    catch { setError({ message: '重新加载失败，草稿仍保留', status: 409 }) }
    finally { busy.current = false; setSaving(false) }
  }
  return <ShiftEditDialog open={open} title={rule ? '编辑排班' : '新增排班'} titleId="shift-rule-editor-title" saving={saving} onCancel={onCancel} onConfirm={() => confirm()} confirmDisabled={locked || deleting}>
    {error && <Alert severity="error" action={locked ? <Button color="inherit" onClick={reload} disabled={saving}>重新加载</Button> : undefined}>{error.message}{locked && '。重新加载后关闭弹窗，请重新编辑。'}</Alert>}
    <label className="shift-date-field">生效日期<input type="date" aria-label="生效日期" value={startDate} disabled={saving || locked} onChange={event => update(() => setStartDate(event.target.value))} /></label>
    <p className="shift-edit-hint">长按左侧拖动柄调整顺序，确认后按新顺序循环。键盘可用 Alt＋方向键。</p>
    <SortableShiftDays days={days} disabled={saving || locked} onChange={value => update(() => setDays(value))} />
    <div className="shift-editor-actions"><Button disabled={saving || locked || days.length >= 366} onClick={() => update(() => setDays([...days, { id: nextId.current++, shift: '休息' }]))}>添加一天</Button>
      {rule && <Button color="error" disabled={saving || locked || snapshot.rules.length === 1} onClick={() => setDeleting(true)}>删除排班</Button>}</div>
    {deleting && <Alert severity="warning" action={<><Button color="inherit" disabled={saving} onClick={() => setDeleting(false)}>保留排班</Button><Button color="error" disabled={saving || locked} onClick={() => confirm(true)}>确认删除</Button></>}>删除后该时段将使用其他规则，确认删除后生效。</Alert>}
  </ShiftEditDialog>
}
