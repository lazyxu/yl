'use strict'

const express = require('express')
const multer = require('multer')
const path = require('node:path')
const fs = require('node:fs')
const crypto = require('node:crypto')
const sharp = require('sharp')
const { identifyPhoto } = require('../services/garden-validation')

const router = express.Router()
const UPLOAD_DIR = process.env.PINDOU_UPLOAD_DIR ? path.resolve(process.env.PINDOU_UPLOAD_DIR) : path.resolve(__dirname, '..', 'uploads')
const PENDING = path.join(UPLOAD_DIR, '.pindou-pending')
const MAX_BYTES = 50 * 1024 * 1024
const MAX_PIXELS = 60 * 1000 * 1000
fs.mkdirSync(PENDING, { recursive: true, mode: 0o700 })

const uploader = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, PENDING),
    filename: (_req, _file, callback) => callback(null, crypto.randomUUID() + '.tmp'),
  }),
  // A client-supplied file extension or MIME type is not evidence of an image.
  limits: { fileSize: MAX_BYTES, files: 1, parts: 1 },
}).single('image')

function kind(bytes) {
  const type = identifyPhoto(bytes)
  if (type) return type
  if (bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6))) {
    return { mime: 'image/gif', ext: '.gif' }
  }
  return null
}

async function sniff(filename) {
  const fh = await fs.promises.open(filename, 'r')
  try {
    const header = Buffer.alloc(32)
    const result = await fh.read(header, 0, header.length, 0)
    return kind(header.subarray(0, result.bytesRead))
  } finally {
    await fh.close()
  }
}

function badImage(message) {
  const error = new Error(message)
  error.status = 415
  return error
}

async function remove(file) {
  if (!file) return
  try { await fs.promises.unlink(file) } catch (error) {
    if (error.code !== 'ENOENT') console.warn('Unable to remove temporary upload:', error)
  }
}

async function storeImage(input) {
  const claimedType = await sniff(input)
  if (!claimedType || claimedType.mime === 'image/gif') {
    throw badImage('仅支持 JPEG、PNG、WEBP、HEIC 的真实图片文件')
  }
  const options = { limitInputPixels: MAX_PIXELS, failOn: 'error' }
  let metadata
  try { metadata = await sharp(input, options).metadata() }
  catch { throw badImage('图片无法解码或超出允许的像素限制') }
  const actual = metadata.format === 'heif' ? 'heic' : metadata.format
  const expected = claimedType.ext === '.jpg' ? 'jpeg' : claimedType.ext.slice(1)
  if (actual !== expected || !metadata.width || !metadata.height ||
      metadata.width * metadata.height > MAX_PIXELS || metadata.pages > 1) {
    throw badImage('图片格式、签名或尺寸不符合要求')
  }

  // Strip active or untrusted metadata by re-encoding the image.
  // HEIC is converted to JPEG when the deployed sharp/libvips supports it.
  const format = actual === 'heic' ? 'jpeg' : actual
  const extension = format === 'jpeg' ? '.jpg' : '.' + format
  const name = crypto.randomUUID() + extension
  const staged = path.join(PENDING, crypto.randomUUID() + '.output')
  try {
    let pipeline = sharp(input, options).rotate()
    if (format === 'jpeg') pipeline = pipeline.jpeg({ quality: 90 })
    else if (format === 'png') pipeline = pipeline.png({ compressionLevel: 7 })
    else pipeline = pipeline.webp({ quality: 90 })
    await pipeline.toFile(staged)
    await fs.promises.rename(staged, path.join(UPLOAD_DIR, name))
    return name
  } catch (error) {
    if (error.status === 415) throw error
    throw badImage('图片解码或安全转换失败，请换用 JPEG、PNG 或 WEBP')
  } finally {
    await remove(staged)
  }
}

router.post('/', (req, res, next) => {
  uploader(req, res, error => {
    if (error) {
      return res.status(error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE' ? 413 : 400)
        .json({ ok: false, error: '图片上传无效：最多一张、大小不超过 50 MiB' })
    }
    next()
  })
}, async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: '请选择图片' })
  try {
    const name = await storeImage(req.file.path)
    res.json({ ok: true, filename: name })
  } catch (error) {
    const status = error.status || 500
    res.status(status).json({ ok: false, error: status === 500 ? '上传处理失败' : error.message })
  } finally {
    await remove(req.file.path)
  }
})

const filenamePattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.(?:jpg|jpeg|png|webp|heic|gif)$/i
router.get('/:filename', async (req, res, next) => {
  const name = req.params.filename
  if (!filenamePattern.test(name) || path.basename(name) !== name) {
    return res.status(404).json({ ok: false, error: '图片不存在' })
  }
  const filePath = path.join(UPLOAD_DIR, name)
  try {
    // Preserve existing generated upload URLs, but never render a legacy SVG,
    // HTML or a file whose extension disagrees with its actual image bytes.
    const type = await sniff(filePath)
    const ext = path.extname(name).toLowerCase()
    const expected = type?.ext === '.jpg' ? ['.jpg', '.jpeg'] : [type?.ext]
    if (!type || !expected.includes(ext)) return res.status(415).json({ ok: false, error: '不安全的历史文件格式' })

    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox")
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
    res.setHeader('Cache-Control', 'private, max-age=3600')
    res.setHeader('Content-Disposition', 'inline')
    res.type(type.mime)
    res.sendFile(filePath, error => {
      if (error && !res.headersSent) next(error)
    })
  } catch (error) {
    if (error.code === 'ENOENT') return res.status(404).json({ ok: false, error: '图片不存在' })
    next(error)
  }
})

module.exports = router
