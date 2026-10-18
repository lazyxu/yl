const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
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
  const sw = fs.readFileSync(path.join(dist, 'sw.js'), 'utf8')
  assert.doesNotMatch(sw, /caches\.open|addAll|respondWith/)
})
