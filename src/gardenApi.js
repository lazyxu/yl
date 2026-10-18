const BASE = '/api/garden'

export async function gardenRequest(path, options = {}) {
  const res = await fetch(BASE + path, options)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || '花园请求失败（' + res.status + '）')
  return body
}
export function gardenJSON(payload, method = 'POST') {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
}
export function gardenPhoto(id, variant = 'thumb') {
  return BASE + '/photos/' + id + '/' + variant
}
export function localInputTime(date = new Date()) {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
export function observedPayload(input, note, author) {
  return {
    observed_at: new Date(input).toISOString(),
    local_date: input.slice(0, 10),
    note: note || '',
    author_name: author || '',
  }
}
export function displayDate(value) {
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}
export function plantedDays(value) {
  if (!value) return null
  const day = new Date(value + 'T00:00:00')
  if (Number.isNaN(day.getTime())) return null
  return Math.max(1, Math.floor((Date.now() - day.getTime()) / 86400000) + 1)
}
