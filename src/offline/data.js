const DB_NAME = 'yl-offline-readonly'
const DB_VERSION = 1
const STORE = 'snapshots'
const GARDEN_CONSENT = 'yl-garden-offline-optin-v1'
const THUMB_CACHE = 'yl-garden-thumbs-v1'
const THUMB_LIMIT = 60
const THUMB_BUDGET = 12 * 1024 * 1024
const THUMB_SINGLE_MAX = 700 * 1024
const GARDEN_INDEX_MAX = 200
const GARDEN_DETAIL_MAX = 30
const GARDEN_DETAIL_ENTRIES_MAX = 100
let dbPromise

function getDB() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  if (dbPromise) return dbPromise
  dbPromise = new Promise(resolve => {
    let request
    try { request = indexedDB.open(DB_NAME, DB_VERSION) } catch { resolve(null); return }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE)
    }
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); dbPromise = undefined }
      resolve(request.result)
    }
    request.onerror = () => { dbPromise = undefined; resolve(null) }
    request.onblocked = () => { dbPromise = undefined; resolve(null) }
  })
  return dbPromise
}
async function transaction(mode, operation) {
  const db = await getDB()
  if (!db) return null
  return new Promise(resolve => {
    try {
      const tx = db.transaction(STORE, mode)
      const req = operation(tx.objectStore(STORE))
      let result = null
      req.onsuccess = () => { result = req.result }
      req.onerror = () => { result = null }
      tx.oncomplete = () => resolve(result)
      tx.onerror = () => resolve(null)
      tx.onabort = () => resolve(null)
    } catch { resolve(null) }
  })
}
const read = key => transaction('readonly', store => store.get(key))
const write = (key, value) => transaction('readwrite', store => store.put(value, key))
const remove = key => transaction('readwrite', store => store.delete(key))
const allKeys = () => transaction('readonly', store => store.getAllKeys())
const allRecords = () => transaction('readonly', store => store.getAll())

export async function readCalendarSnapshot() {
  const item = await read('calendar')
  if (item?.schema !== 1 || !Array.isArray(item.rules) ||
    !item.rules.length || !item.overrides || !Number.isInteger(item.rulesVersion) ||
    !Number.isInteger(item.overridesVersion) || !Number.isFinite(item.savedAt)) return null
  return item
}
export async function saveCalendarSnapshot({ rules, overrides, rulesVersion, overridesVersion }) {
  if (!Array.isArray(rules) || rules.length === 0 ||
    !overrides || typeof overrides !== 'object' ||
    !Number.isInteger(rulesVersion) || !Number.isInteger(overridesVersion)) return false
  return (await write('calendar', { schema: 1, rules, overrides, rulesVersion,
    overridesVersion, savedAt: Date.now() })) !== null
}

export function gardenOfflineEnabled() {
  try { return localStorage.getItem(GARDEN_CONSENT) === 'yes' }
  catch { return false }
}
export async function gardenOfflineSupported() {
  return Boolean(typeof caches !== 'undefined' && await getDB())
}
export async function setGardenOfflineEnabled(enabled) {
  if (enabled && !(await gardenOfflineSupported())) return false
  try {
    if (enabled) localStorage.setItem(GARDEN_CONSENT, 'yes')
    else localStorage.removeItem(GARDEN_CONSENT)
  } catch { return false }
  if (!enabled) await clearGardenOffline(false)
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('yl:garden-offline', { detail: { enabled } }))
  return true
}
export async function clearGardenOffline(removePreference = true) {
  const keys = await allKeys()
  for (const key of (keys || [])) if (typeof key === 'string' && key.startsWith('garden:')) await remove(key)
  if (typeof caches !== 'undefined') await caches.delete(THUMB_CACHE).catch(() => {})
  if (removePreference) {
    try { localStorage.removeItem(GARDEN_CONSENT) } catch { /* storage forbidden */ }
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('yl:garden-offline', { detail: { enabled: false } }))
  }
}
export async function saveGardenIndex({ items, total, species = [] }) {
  if (!gardenOfflineEnabled() || !Array.isArray(items)) return
  await write('garden:index', { schema: 1, savedAt: Date.now(),
    total: Number.isFinite(total) ? total : items.length,
    items: items.slice(0, GARDEN_INDEX_MAX),
    species: species.slice(0, 500),
  })
}
export async function readGardenIndex() {
  if (!gardenOfflineEnabled()) return null
  const index = await read('garden:index')
  return index?.schema === 1 && Array.isArray(index.items) ? index : null
}
export async function saveGardenDetail(plant, entries) {
  if (!gardenOfflineEnabled() || !Number.isSafeInteger(Number(plant?.id)) ||
    !Array.isArray(entries)) return
  await write('garden:detail:' + plant.id, { schema: 1, savedAt: Date.now(),
    plant, entries: entries.slice(0, GARDEN_DETAIL_ENTRIES_MAX),
  })
  const keys = (await allKeys() || []).filter(key => typeof key === 'string' && key.startsWith('garden:detail:'))
  if (keys.length <= GARDEN_DETAIL_MAX) return
  const records = (await allRecords() || []).filter(item => item?.schema === 1 && item.plant && item.entries)
    .sort((a, b) => a.savedAt - b.savedAt)
  for (const item of records.slice(0, Math.max(0, records.length - GARDEN_DETAIL_MAX))) {
    await remove('garden:detail:' + item.plant.id)
  }
}
export async function readGardenDetail(id) {
  if (!gardenOfflineEnabled()) return null
  const data = await read('garden:detail:' + id)
  return data?.schema === 1 && data.plant && Array.isArray(data.entries) ? data : null
}
export async function readGardenDay(date) {
  if (!gardenOfflineEnabled()) return null
  const records = (await allRecords() || []).filter(item => item?.schema === 1 && item.plant && item.entries)
  return records.flatMap(item => item.entries.filter(entry => entry.local_date === date).map(entry => ({
    id: entry.id, plant_id: item.plant.id, plant_name: item.plant.name,
    photo_id: entry.photos?.[0]?.id || null, note: entry.note, observed_at: entry.observed_at,
  }))).sort((a, b) => String(a.observed_at).localeCompare(String(b.observed_at)))
}

export async function rememberThumbnail(url) {
  if (!gardenOfflineEnabled() || typeof caches === 'undefined' ||
    typeof navigator !== 'undefined' && !navigator.onLine ||
    !/^\/api\/garden\/photos\/[0-9]+\/thumb$/.test(url)) return
  try {
    const cache = await caches.open(THUMB_CACHE)
    if (await cache.match(url)) return
    // Browser HTTP cache may already have the resource. No originals/previews
    // or authenticated/private JSON requests ever enter Cache Storage.
    const response = await fetch(url, { cache: 'force-cache', credentials: 'same-origin' })
    if (!response.ok || !response.headers.get('Content-Type')?.startsWith('image/')) return
    if (Number(response.headers.get('Content-Length')) > THUMB_SINGLE_MAX) return
    const blob = await response.blob()
    if (blob.size > THUMB_SINGLE_MAX) return
    await cache.put(url, new Response(blob, { headers: { 'Content-Type': blob.type } }))
    const entries = await cache.keys()
    let bytes = 0
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i]
      const image = await cache.match(entry)
      bytes += (await image?.blob())?.size || 0
      if (entries.length - i > THUMB_LIMIT || bytes > THUMB_BUDGET) await cache.delete(entry)
    }
  } catch { /* quotas or private browsing: never prevent online viewing */ }
}
export async function cachedThumbnail(url) {
  if (!gardenOfflineEnabled() || typeof caches === 'undefined') return null
  try {
    const cache = await caches.open(THUMB_CACHE)
    const response = await cache.match(url)
    return response ? await response.blob() : null
  } catch { return null }
}
export async function estimateOfflineStorage() {
  try {
    const estimate = await navigator.storage?.estimate()
    return { totalUsage: estimate?.usage || 0, totalQuota: estimate?.quota || 0,
      maximumThumbBytes: THUMB_BUDGET, maximumThumbCount: THUMB_LIMIT }
  } catch { return null }
}
