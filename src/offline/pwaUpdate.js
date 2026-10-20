const listeners = new Set()
let registration = null
let started = false
let reloadOnControl = false
let lastCheck = 0
function broadcast() {
  const ready = Boolean(registration?.waiting && navigator.serviceWorker?.controller)
  listeners.forEach(listener => listener(ready))
}
export function subscribePWAUpdate(listener) {
  listeners.add(listener)
  listener(Boolean(registration?.waiting && navigator.serviceWorker?.controller))
  return () => listeners.delete(listener)
}
export function applyPWAUpdate() {
  const waiting = registration?.waiting
  if (!waiting) return false
  reloadOnControl = true
  waiting.postMessage({ type: 'SKIP_WAITING' })
  return true
}
export function registerPWA() {
  if (started || !('serviceWorker' in navigator)) return
  started = true
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadOnControl) window.location.reload()
  })
  navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(current => {
    registration = current
    broadcast()
    current.addEventListener('updatefound', () => {
      const worker = current.installing
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed') broadcast()
      })
    })
    function check() {
      if (document.visibilityState === 'hidden' || !navigator.onLine) return
      if (Date.now() - lastCheck < 15 * 60 * 1000) return
      lastCheck = Date.now()
      current.update().catch(() => {})
    }
    document.addEventListener('visibilitychange', check)
    window.addEventListener('online', check)
    check()
  }).catch(error => console.warn('PWA registration failed:', error))
}
