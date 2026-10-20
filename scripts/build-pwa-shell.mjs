import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

const root = resolve('dist')
const candidates = []
function collect(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) { collect(path); continue }
    if (!entry.isFile()) continue
    const url = '/' + relative(root, path).split(sep).join('/')
    const size = statSync(path).size
    // No private API, uploaded originals, OCR model, WASM or huge runtime
    // assets. The standard Vite component chunks and shell are retained.
    if (url.startsWith('/assets/') && /\.(js|css|svg|woff2?|png)$/.test(url) &&
      size <= 3 * 1024 * 1024 && !/ocr|tesseract|worker|\.wasm/i.test(url)) {
      candidates.push({ url, bytes: size, file: path })
    }
  }
}
collect(join(root, 'assets'))
for (const name of ['index.html', 'pwa-theme-init.js', 'manifest.webmanifest',
  'icon-192.png', 'icon-512.png', 'app-icon.svg']) {
  const path = join(root, name)
  candidates.push({ url: '/' + name, bytes: statSync(path).size, file: path })
}
candidates.sort((a, b) => a.url.localeCompare(b.url))
const totalBytes = candidates.reduce((sum, item) => sum + item.bytes, 0)
if (totalBytes > 18 * 1024 * 1024) throw new Error('PWA precache over 18 MiB budget: ' + totalBytes)
if (!candidates.some(item => item.url === '/index.html') ||
  !candidates.some(item => /\/assets\/.+\.js$/.test(item.url))) {
  throw new Error('Incomplete PWA app shell manifest')
}
const manifest = candidates.map(item => ({
  url: item.url,
  revision: createHash('sha256').update(readFileSync(item.file)).digest('hex').slice(0, 16),
}))
const version = createHash('sha256').update(JSON.stringify(manifest)).digest('hex').slice(0, 16)
const source = readFileSync('public/sw.js', 'utf8')
if (!source.includes('__YL_MANIFEST__') || !source.includes('__YL_VERSION__')) {
  throw new Error('PWA manifest injection placeholder missing')
}
const target = source.replace('__YL_MANIFEST__', JSON.stringify(manifest))
  .replace('__YL_VERSION__', JSON.stringify(version))
writeFileSync(join(root, 'sw.js'), target)
writeFileSync(join(root, 'pwa-precache.json'), JSON.stringify({
  version, entries: manifest.length, bytes: totalBytes, manifest,
}, null, 2) + '\n')
console.log('PWA app shell:', manifest.length, 'assets,', Math.round(totalBytes / 1024), 'KiB,', version)
