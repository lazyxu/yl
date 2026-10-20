// Keep a newly launched PWA's background in sync with the module before
// React mounts. App.jsx continues managing live system/theme changes.
(() => {
  try {
    const view = new URLSearchParams(window.location.search).get('view') || '日历'
    const supportsDark = view === '日历' || view === '花园'
    const dark = supportsDark && Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches)
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', dark ? '#101914' : '#f7faf7')
  } catch { /* Preserve light defaults on older clients. */ }
})()
