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

    // Older uploads have timestamp-based names; retain access only if their
    // extension matches verified bytes. Never serve uploaded markup as HTML.
    fs.writeFileSync(path.join(directory, '1700000-abc.png'), png)
    assert.equal((await fetch(endpoint + '/1700000-abc.png')).status, 200)
    fs.writeFileSync(path.join(directory, '1700000-evil.jpg'), Buffer.from('<script>alert(1)</script>'))
    assert.equal((await fetch(endpoint + '/1700000-evil.jpg')).status, 415)
    fs.writeFileSync(path.join(directory, '1700000-evil.svg'), svg)
    assert.equal((await fetch(endpoint + '/1700000-evil.svg')).status, 404)
    assert.equal((await fetch(endpoint + '/missing.jpg')).status, 404)
  } finally {
    if (server) await new Promise(resolve => server.close(resolve))
    if (previous === undefined) delete process.env.PINDOU_UPLOAD_DIR
    else process.env.PINDOU_UPLOAD_DIR = previous
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
