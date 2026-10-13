import { useEffect, useRef, useState } from 'react'
import { saveShiftSettings } from './shiftSettingsApi'

function payload(draft) {
  const dates = new Set()
  return draft.filter(rule => !(rule.isNew && !rule.startDate)).map(({ startDate, shifts }) => {
    const date = new Date(`${startDate}T00:00:00Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== startDate) {
      throw new Error('请填写有效的生效日期，修改尚未同步')
    }
    if (dates.has(startDate)) throw new Error('生效日期不能重复，修改尚未同步')
    dates.add(startDate)
    return { startDate, shifts: [...shifts] }
  })
}
const signature = rules => JSON.stringify([...rules].sort((a, b) => a.startDate.localeCompare(b.startDate)))
const hasPendingRow = rows => rows.some(rule => rule.isNew && !rule.startDate)

export default function useShiftAutosave(open, settings, onSaved, onReload) {
  const [draft, setDraft] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [synced, setSynced] = useState(false)
  const nextKey = useRef(0)
  const state = useRef({ draft: [], revision: 0, savedRevision: 0, version: null, busy: false, blocked: false, uncertain: false, failureStatus: null, signature: '' })
  const wasOpen = useRef(false)
  const savedCallback = useRef(onSaved)
  savedCallback.current = onSaved

  function initialize(loaded) {
    const rows = loaded.rules.map(rule => ({ ...rule, shifts: [...rule.shifts], rowKey: nextKey.current++ }))
    Object.assign(state.current, { draft: rows, revision: 0, savedRevision: 0, version: loaded.version, blocked: false, uncertain: false, failureStatus: null, signature: signature(loaded.rules) })
    setDraft(rows); setError(null); setSynced(false)
  }

  useEffect(() => {
    const current = state.current
    // Parent acknowledgements must not replace newer edits or move focus.
    // Failed edits survive closing and reopening this mounted calendar.
    if (open && !wasOpen.current && !current.busy && !current.uncertain && !hasPendingRow(current.draft) && current.revision === current.savedRevision) initialize(settings)
    wasOpen.current = open
  }, [open, settings])

  useEffect(() => {
    function protectUnsynced(event) {
      const current = state.current
      if (current.busy || current.uncertain || current.revision !== current.savedRevision || hasPendingRow(current.draft)) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', protectUnsynced)
    return () => window.removeEventListener('beforeunload', protectUnsynced)
  }, [])

  async function flush() {
    const current = state.current
    if (current.busy || current.blocked) return
    let rules
    try { rules = payload(current.draft) }
    catch (failure) { setError({ message: failure.message, validation: true }); return }
    if (!current.uncertain && signature(rules) === current.signature) {
      current.savedRevision = current.revision
      setError(null)
      return
    }
    const revision = current.revision
    const submittedKeys = new Set(current.draft.filter(rule => rule.startDate).map(rule => rule.rowKey))
    current.busy = true
    setSaving(true); setError(null); setSynced(false)
    try {
      const saved = await saveShiftSettings(rules, current.version)
      current.version = saved.version
      current.signature = signature(saved.rules)
      current.savedRevision = revision
      current.uncertain = false
      current.failureStatus = null
      current.draft = current.draft.map(rule => submittedKeys.has(rule.rowKey) ? { ...rule, isNew: false } : rule)
      setDraft(current.draft)
      savedCallback.current(saved)
      setSynced(true)
    } catch (failure) {
      current.blocked = true
      current.uncertain = true
      current.failureStatus = failure.status
      setError({ message: failure.message || '同步失败，修改已保留，请重试', status: failure.status })
    } finally {
      current.busy = false
      setSaving(false)
      if (!current.blocked && current.revision !== current.savedRevision) flush()
    }
  }

  function update(transform) {
    const current = state.current
    if (current.blocked && current.failureStatus === 409) return
    current.draft = transform(current.draft)
    current.revision += 1
    current.blocked = false
    setDraft(current.draft); setError(null); setSynced(false)
    flush()
  }

  function add() {
    const current = state.current
    const newest = [...current.draft].filter(rule => rule.startDate).sort((a, b) => b.startDate.localeCompare(a.startDate))[0]
    const rowKey = nextKey.current++
    update(rows => [{ rowKey, isNew: true, startDate: '', shifts: [...(newest?.shifts || ['白班', '白班', '休息', '夜班', '夜班', '休息', '休息', '休息'])] }, ...rows])
    return rowKey
  }

  async function reload() {
    if (state.current.busy) return
    setSaving(true)
    try {
      const loaded = await onReload()
      if (loaded) initialize(loaded)
      else setError({ message: '重新加载失败，修改仍保留，请重试', status: 409 })
    } catch { setError({ message: '重新加载失败，修改仍保留，请重试', status: 409 }) }
    finally { setSaving(false) }
  }

  function retry() { state.current.blocked = false; flush() }
  return { draft, saving, error, synced, update, add, reload, retry }
}
