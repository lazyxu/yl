'use strict'

const DAY = /^\d{4}-\d{2}-\d{2}$/
const MAX_PHOTOS = 8
const MAX_PHOTO_BYTES = 20 * 1024 * 1024
const MAX_ENTRY_BYTES = 90 * 1024 * 1024

function badRequest(message) {
  const err = new Error(message)
  err.status = 400
  return err
}
function validDay(value) {
  if (typeof value !== 'string' || !DAY.test(value)) return false
  const date = new Date(value + 'T00:00:00Z')
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}
function positiveId(value) {
  const text = String(value ?? '')
  if (!/^[1-9]\d*$/.test(text)) return null
  const id = Number(text)
  return Number.isSafeInteger(id) ? id : null
}
function text(value, max, label, required = false) {
  if (value == null && !required) return ''
  if (typeof value !== 'string') throw badRequest(label + '必须是文字')
  const trimmed = value.trim()
  if ((required && !trimmed) || [...trimmed].length > max) throw badRequest(label + '长度不符合要求')
  return trimmed
}
function normalizePlant(payload) {
  const p = payload || {}
  const plantedOn = p.planted_on || null
  if (plantedOn !== null && !validDay(plantedOn)) throw badRequest('种植日期格式应为 YYYY-MM-DD')
  const speciesId = p.species_id == null || p.species_id === '' || String(p.species_id) === '0'
    ? null : positiveId(p.species_id)
  if (p.species_id && String(p.species_id) !== '0' && !speciesId) throw badRequest('品种编号无效')
  const status = p.status || 'active'
  if (!['active', 'archived'].includes(status)) throw badRequest('花卉状态无效')
  return {
    name: text(p.name, 100, '花卉名称', true),
    species_id: speciesId,
    planted_on: plantedOn,
    location: text(p.location, 200, '种植位置'),
    notes: text(p.notes, 3000, '花卉备注'),
    status,
  }
}
function normalizeEntry(payload) {
  const p = payload || {}
  const raw = p.observed_at
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/.test(raw)) {
    throw badRequest('记录时间应为带时区的 ISO 8601 时间')
  }
  const ms = Date.parse(raw)
  if (!Number.isFinite(ms) || ms > Date.now() + 86400000) throw badRequest('记录时间无效')
  const localDate = p.local_date || raw.slice(0, 10)
  if (!validDay(localDate)) throw badRequest('记录日期无效')
  return {
    observed_at: new Date(ms),
    observed_ts: ms,
    local_date: localDate,
    note: text(p.note, 5000, '成长备注'),
    author_name: text(p.author_name, 60, '记录者'),
  }
}
function identifyPhoto(bytes) {
  if (!Buffer.isBuffer(bytes)) return null
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: 'image/jpeg', ext: '.jpg' }
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { mime: 'image/png', ext: '.png' }
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return { mime: 'image/webp', ext: '.webp' }
  if (bytes.length >= 12 && bytes.toString('ascii', 4, 8) === 'ftyp' &&
    ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(bytes.toString('ascii', 8, 12))) {
    return { mime: 'image/heic', ext: '.heic' }
  }
  return null
}
function safeFilename(value) {
  const parts = String(value || 'photo').replace(/\\/g, '/').split('/')
  return parts[parts.length - 1].replace(/[\x00-\x1f\x7f]/g, '').slice(0, 160) || 'photo'
}
module.exports = {
  MAX_PHOTOS, MAX_PHOTO_BYTES, MAX_ENTRY_BYTES, badRequest, validDay, positiveId,
  text, normalizePlant, normalizeEntry, identifyPhoto, safeFilename,
}
