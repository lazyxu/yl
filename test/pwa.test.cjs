const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const root = path.resolve(__dirname, '..')
const dist = path.join(root, 'dist')

test('production PWA has manifest, SVG/PNG icons and service worker without offline API caching', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(dist, 'manifest.webmanifest'), 'utf8'))
  assert.equal(manifest.display, 'standalone')
  assert.equal(manifest.start_url, '/')
  const sizes = [192, 512]
  for (const size of sizes) {
    const icon = fs.readFileSync(path.join(dist, 'icon-' + size + '.png'))
    assert.equal(icon.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
    assert.equal(icon.readUInt32BE(16), size)
    assert.equal(icon.readUInt32BE(20), size)
    assert.ok(manifest.icons.some(i => i.sizes === size + 'x' + size))
  }
  assert.ok(fs.existsSync(path.join(dist, 'app-icon.svg')))
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8')
  assert.match(html, /manifest\.webmanifest/)
  assert.match(html, /pwa-theme-init\.js/)
  const init = fs.readFileSync(path.join(dist, 'pwa-theme-init.js'), 'utf8')
  assert.match(init, /prefers-color-scheme: dark/)
  assert.match(init, /view === '日历' \|\| view === '花园'/)
  assert.equal(manifest.theme_color, '#f7faf7')
  const sw = fs.readFileSync(path.join(dist, 'sw.js'), 'utf8')
  assert.match(sw, /\byl-shell-/)
  assert.match(sw, /caches\.open/)
  assert.match(sw, /caches\.delete\(CACHE_NAME\)/)
  assert.match(sw, /request\.method !== 'GET'/)
  assert.match(sw, /caches\.match\(url\.pathname\)/)
  assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)/)
  assert.match(sw, /SKIP_WAITING/)
  assert.doesNotMatch(sw, /__YL_MANIFEST__|__YL_VERSION__/)
  const manifestData = JSON.parse(fs.readFileSync(path.join(dist, 'pwa-precache.json'), 'utf8'))
  assert.ok(manifestData.entries > 2)
  assert.ok(manifestData.bytes < 18 * 1024 * 1024)
  assert.ok(manifestData.manifest.some(item => item.url === '/index.html'))
  assert.ok(manifestData.manifest.some(item => item.url.endsWith('.js')))
  assert.ok(manifestData.manifest.every(item => !item.url.startsWith('/api/') && !/\.(wasm|heic)$/i.test(item.url)))
})


test('Morning Garden brand icons and standalone cache builder recover missing PNG on Windows paths', () => {
  const svg = fs.readFileSync(path.join(root, 'public', 'app-icon.svg'), 'utf8')
  assert.match(svg, /晨光花园/)
  assert.match(svg, /id="red"/)
  assert.match(svg, /id="pink"/)
  assert.match(svg, /id="leaf"/)
  const icon192 = path.join(dist, 'icon-192.png')
  const icon512 = path.join(dist, 'icon-512.png')
  const first192 = fs.readFileSync(icon192)
  const first512 = fs.readFileSync(icon512)
  try {
    fs.rmSync(icon192)
    fs.rmSync(icon512)
    // Reproduces the reported ENOENT when invoked without npm prebuild.
    execFileSync(process.execPath, ['scripts/build-pwa-shell.mjs'], {
      cwd: root, encoding: 'utf8', stdio: 'pipe',
    })
    assert.deepEqual(fs.readFileSync(icon192), first192)
    assert.deepEqual(fs.readFileSync(icon512), first512)
    const precache = JSON.parse(fs.readFileSync(path.join(dist, 'pwa-precache.json'), 'utf8'))
    assert.ok(precache.manifest.some(entry => entry.url === '/icon-192.png'))
    assert.ok(precache.manifest.some(entry => entry.url === '/icon-512.png'))
    assert.ok(precache.manifest.some(entry => entry.url === '/app-icon.svg'))
  } finally {
    if (!fs.existsSync(icon192)) fs.writeFileSync(icon192, first192)
    if (!fs.existsSync(icon512)) fs.writeFileSync(icon512, first512)
  }
})
