// Installable PWA shell. Offline editing is deliberately unsupported;
// requests for /api and uploaded photographs are never intercepted or cached.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim())
})
