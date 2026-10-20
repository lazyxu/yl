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
  // datetime-local values carry the user's wall time but no timezone suffix.
  // Convert using the browser timezone, then send RFC 3339 at second precision:
  // older deployed yl servers reject the millisecond suffix from toISOString().
  const parts = typeof input === 'string'
    ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(input)
    : null
  const date = parts ? new Date(input) : new Date(NaN)
  if (!Number.isFinite(date.getTime()) ||
    date.getFullYear() !== Number(parts?.[1]) ||
    date.getMonth() + 1 !== Number(parts?.[2]) ||
    date.getDate() !== Number(parts?.[3]) ||
    date.getHours() !== Number(parts?.[4]) ||
    date.getMinutes() !== Number(parts?.[5]) ||
    (parts?.[6] != null && date.getSeconds() !== Number(parts[6]))) {
    throw new Error('记录时间无效，请重新选择日期和时间')
  }
  return {
    observed_at: date.toISOString().replace(/\.\d{3}Z$/, 'Z'),
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

/**
 * XHR offers native iOS upload progress; the API and validation are unchanged.
 * Node callers without XMLHttpRequest keep fetch semantics.
 */
export function gardenUpload(formData, onProgress = () => {}) {
  if (typeof XMLHttpRequest === 'undefined') {
    return gardenRequest('/entries', { method: 'POST', body: formData })
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', BASE + '/entries')
    xhr.responseType = 'json'
    xhr.upload.addEventListener('progress', event => {
      if (event.lengthComputable && event.total > 0) onProgress(Math.round(event.loaded / event.total * 100))
    })
    xhr.onload = () => {
      let body = xhr.response
      if (!body || typeof body !== 'object') {
        try { body = JSON.parse(xhr.responseText) } catch { body = {} }
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body)
      else reject(new Error(body?.error || '花园请求失败（' + xhr.status + '）'))
    }
    xhr.onerror = () => reject(new Error('网络连接失败，成长记录未保存，请重试'))
    xhr.onabort = () => reject(new DOMException('上传已取消', 'AbortError'))
    xhr.send(formData)
  })
}
