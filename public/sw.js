/* eslint-env serviceworker */
// Build-time injection by scripts/build-pwa-shell.mjs (Vite hashed precache).
// The build's manifest placeholder is replaced in dist/sw.js, never in dev.
const PRE_CACHE = __YL_MANIFEST__
const CACHE_NAME = 'yl-shell-' + __YL_VERSION__
const PREFIX = 'yl-shell-'
const precached = new Set(PRE_CACHE.map(item => new URL(item.url, self.location.origin).pathname))

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    // Install atomically. A failed precache leaves the previous SW running.
    try {
      await Promise.all(PRE_CACHE.map(async item => {
        const request = new Request(item.url, { cache: 'reload', credentials: 'same-origin' })
        const response = await fetch(request)
        if (!response.ok) throw new Error('Failed to precache ' + item.url)
        await cache.put(item.url, response)
      }))
    } catch (error) {
      // Keep the old worker active and do not strand a half-filled generation
      // when quota, a transient 404 or an interrupted deployment fails.
      await caches.delete(CACHE_NAME)
      throw error
    }
  })())
  // New versions do not skipWaiting until the user has completed editing.
})
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = (await caches.keys()).filter(name => name.startsWith(PREFIX))
    // Keep one previous app-shell generation so a second open tab can still
    // lazy-load its original hashed chunks during an upgrade.
    const keep = [CACHE_NAME, ...names.filter(name => name !== CACHE_NAME).slice(-1)]
    await Promise.all(names.filter(name => !keep.includes(name)).map(name => caches.delete(name)))
    await self.clients.claim()
  })())
})
self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => {
      const current = await caches.open(CACHE_NAME)
      return await current.match('/index.html') ||
        (await caches.match('/index.html')) ||
        Response.error()
    }))
    return
  }
  // During a new release older open tabs may still request lazy chunks
  // from the previous manifest. Only trusted hashed Vite assets are eligible
  // for fallback to the previous (already cached) generation.
  const hashedAsset = /^\/assets\/.+\.[A-Za-z0-9_-]{8,}\.(js|css|svg|png)$/.test(url.pathname)
  if (!precached.has(url.pathname) && !hashedAsset) return
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME)
    return await cache.match(url.pathname) ||
      (hashedAsset ? await caches.match(url.pathname) : undefined) ||
      await fetch(request)
  })())
})
