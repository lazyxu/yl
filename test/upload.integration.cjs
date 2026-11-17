const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

test('pindou uploads reject active content, normalize raster files, and keep legacy URLs safe', async () => {
  const previous = process.env.PINDOU_UPLOAD_DIR
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'yl-pindou-secure-upload-'))
  process.env.PINDOU_UPLOAD_DIR = directory
  const express = require('../server/node_modules/express')
  const sharp = require('../server/node_modules/sharp')
  let server
  try {
    const app = express()
    app.use('/api/upload', require('../server/routes/upload'))
    server = await new Promise(resolve => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance))
    })
    const endpoint = 'http://127.0.0.1:' + server.address().port + '/api/upload'
    async function upload(bytes, originalName, mime = 'image/jpeg') {
      const form = new FormData()
      form.append('image', new Blob([bytes], { type: mime }), originalName)
      const res = await fetch(endpoint, { method: 'POST', body: form })
      return { status: res.status, body: await res.json() }
    }
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
    const xml = await upload(svg, 'payload.jpg', 'image/jpeg')
    assert.equal(xml.status, 415)
    assert.match(xml.body.error, /图片/)
    const html = await upload(Buffer.from('<!doctype html><script>alert(1)</script>'), 'payload.html', 'image/png')
    assert.equal(html.status, 415)
    const fakeJpg = await upload(Buffer.from([255, 216, 255, 0, 0, 0, 0]), 'fake.jpg')
    assert.equal(fakeJpg.status, 415)

    const png = await sharp({ create: { width: 30, height: 21, channels: 4, background: '#aabbcc' } }).png().toBuffer()
    const created = await upload(png, 'dangerous<script>.svg', 'image/svg+xml')
    assert.equal(created.status, 200)
    assert.match(created.body.filename, /^[0-9a-f-]{36}\.png$/)
    assert.ok(fs.existsSync(path.join(directory, created.body.filename)))
    const image = await fetch(endpoint + '/' + created.body.filename)
    assert.equal(image.status, 200)
    assert.match(image.headers.get('content-type'), /^image\/png/)
    assert.equal(image.headers.get('x-content-type-options'), 'nosniff')
    assert.match(image.headers.get('content-security-policy'), /sandbox/)
    assert.equal((await sharp(Buffer.from(await image.arrayBuffer())).metadata()).format, 'png')

    const derivativePath = path.join(directory, '.thumbs', created.body.filename + '.webp')
    assert.ok(fs.existsSync(derivativePath), 'upload publishes a bounded derivative')
    const thumbnail = await fetch(endpoint + '/' + created.body.filename + '/thumb')
    assert.equal(thumbnail.status, 200)
    assert.match(thumbnail.headers.get('content-type'), /^image\/webp/)
    assert.match(thumbnail.headers.get('cache-control'), /private/)
    assert.equal(thumbnail.headers.get('x-content-type-options'), 'nosniff')
    const thumbBytes = Buffer.from(await thumbnail.arrayBuffer())
    const thumbMetadata = await sharp(thumbBytes).metadata()
    assert.equal(thumbMetadata.format, 'webp')
    assert.ok(thumbMetadata.width <= 192 && thumbMetadata.height <= 192)
    assert.ok(!thumbBytes.equals(png), 'thumbnail is not the original response')
    const etag = thumbnail.headers.get('etag')
    assert.ok(etag)
    const unchanged = await fetch(endpoint + '/' + created.body.filename + '/thumb',
      { headers: { 'If-None-Match': etag } })
    assert.equal(unchanged.status, 304, 'derivative supports conditional GET')

    const largePhoto = await sharp({ create: { width: 800, height: 500, channels: 3,
      background: '#506070' } }).jpeg().toBuffer()
    const large = await upload(largePhoto, 'large.jpg', 'image/jpeg')
    assert.equal(large.status, 200)
    const largeThumb = await fetch(endpoint + '/' + large.body.filename + '/thumb')
    const dimensions = await sharp(Buffer.from(await largeThumb.arrayBuffer())).metadata()
    assert.equal(dimensions.width, 192)
    assert.equal(dimensions.height, 120)

    // Older uploads have timestamp-based names; retain access only if their
    // extension matches verified bytes. Never serve uploaded markup as HTML.
    fs.writeFileSync(path.join(directory, '1700000-abc.png'), png)
    assert.equal((await fetch(endpoint + '/1700000-abc.png')).status, 200)
    const legacyRequests = await Promise.all(Array.from({ length: 24 }, () =>
      fetch(endpoint + '/1700000-abc.png/thumb')))
    assert.ok(legacyRequests.every(response => response.status === 200),
      'simultaneous legacy requests coalesce and do not overflow the thumbnail queue')
    assert.equal((await sharp(Buffer.from(await legacyRequests[0].arrayBuffer())).metadata()).format, 'webp')
    assert.equal(fs.readdirSync(path.join(directory, '.thumbs')).filter(name =>
      name === '1700000-abc.png.webp').length, 1, 'one derivative per legacy original')
    fs.writeFileSync(path.join(directory, '1700000-evil.jpg'), Buffer.from('<script>alert(1)</script>'))
    assert.equal((await fetch(endpoint + '/1700000-evil.jpg')).status, 415)
    assert.equal((await fetch(endpoint + '/1700000-evil.jpg/thumb')).status, 415)
    fs.writeFileSync(path.join(directory, '1700000-evil.svg'), svg)
    assert.equal((await fetch(endpoint + '/1700000-evil.svg')).status, 404)
    assert.equal((await fetch(endpoint + '/missing.jpg')).status, 404)
    assert.equal((await fetch(endpoint + '/missing.jpg/thumb')).status, 404)
    assert.equal((await fetch(endpoint + '/1700000-evil.svg/thumb')).status, 415)
    assert.equal(fs.readdirSync(path.join(directory, '.thumbs')).some(name => name.endsWith('.tmp')), false)
  } finally {
    if (server) await new Promise(resolve => server.close(resolve))
    if (previous === undefined) delete process.env.PINDOU_UPLOAD_DIR
    else process.env.PINDOU_UPLOAD_DIR = previous
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
