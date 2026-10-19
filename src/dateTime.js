// datetime-local controls have no timezone suffix. Keep wall-clock values local
// while continuing to store moments as ISO 8601 UTC timestamps.
const pad = number => String(number).padStart(2, '0')

export function toDatetimeLocal(timestamp) {
  const date = new Date(timestamp)
  if (!Number.isFinite(date.getTime())) return ''
  return [
    date.getFullYear(), '-',
    pad(date.getMonth() + 1), '-', pad(date.getDate()),
    'T', pad(date.getHours()), ':', pad(date.getMinutes()),
  ].join('')
}

export function fromDatetimeLocal(value) {
  const parts = typeof value === 'string'
    ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
    : null
  if (!parts) throw new Error('请选择有效的本地日期和时间')
  const date = new Date(value)
  if (!Number.isFinite(date.getTime()) ||
    date.getFullYear() !== Number(parts[1]) ||
    date.getMonth() + 1 !== Number(parts[2]) ||
    date.getDate() !== Number(parts[3]) ||
    date.getHours() !== Number(parts[4]) ||
    date.getMinutes() !== Number(parts[5])) {
    throw new Error('请选择有效的本地日期和时间')
  }
  return date.toISOString()
}
