'use strict'

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const multer = require('multer')
const sharp = require('sharp')
const {
  MAX_PHOTOS, MAX_PHOTO_BYTES, MAX_ENTRY_BYTES, badRequest, identifyPhoto, safeFilename,
} = require('./garden-validation')

const uploadRoot = path.resolve(__dirname, '..', 'uploads', 'garden')
const dirs = {
  tmp: path.join(uploadRoot, 'tmp'),
  originals: path.join(uploadRoot, 'originals'),
  thumbs: path.join(uploadRoot, 'thumbs'),
  previews: path.join(uploadRoot, 'previews'),
}
for (const dir of Object.values(dirs)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 })

// Image decoding is CPU/memory intensive; bound active work and the waiting
// queue. Raw uploads remain on disk while waiting and route cleanup owns them.
const MAX_ACTIVE_IMAGES = 2
const MAX_QUEUED_IMAGES = 8
let activeImages = 0
const waitingImages = []
function withMediaSlot(task) {
  return new Promise((resolve, reject) => {
    if (activeImages >= MAX_ACTIVE_IMAGES && waitingImages.length >= MAX_QUEUED_IMAGES) {
      const busy = new Error('图片处理繁忙，请稍后重试')
      busy.status = 503
      return reject(busy)
    }
    const start = () => {
      activeImages++
      Promise.resolve().then(task).then(
        value => { activeImages--; waitingImages.shift()?.(); resolve(value) },
        error => { activeImages--; waitingImages.shift()?.(); reject(error) },
      )
    }
    if (activeImages < MAX_ACTIVE_IMAGES) start()
    else waitingImages.push(start)
  })
}


const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dirs.tmp),
    filename: (_req, _file, cb) => cb(null, crypto.randomUUID() + '.tmp'),
  }),
  limits: { files: MAX_PHOTOS, fileSize: MAX_PHOTO_BYTES, fields: 6, fieldSize: 8000, parts: MAX_PHOTOS + 6 },
}).array('photos', MAX_PHOTOS)

function uploadPhotos(req, res, next) {
  upload(req, res, err => {
    if (err) {
      cleanupTemporary(req.files)
      return res.status(err.code?.startsWith('LIMIT_') ? 413 : 400).json({ error: '上传限制：最多 8 张、单张 20 MiB、总计 90 MiB' })
    }
    next()
  })
}
function cleanupTemporary(files = []) {
  for (const file of files) try { fs.unlinkSync(file.path) } catch { /* already moved */ }
}
function inside(kind, filename) {
  if (!Object.hasOwn(dirs, kind) || !/^[0-9a-f-]{36}\.(jpe?g|png|webp|heic)$/i.test(filename)) {
    throw badRequest('文件路径无效')
  }
  return path.join(dirs[kind], filename)
}
async function processImage(file) {
  const fd = await fs.promises.open(file.path, 'r')
  const signatureBytes = Buffer.alloc(32)
  let read
  try { read = await fd.read(signatureBytes, 0, 32, 0) } finally { await fd.close() }
  const type = identifyPhoto(signatureBytes.subarray(0, read.bytesRead))
  if (!type) throw badRequest('仅支持 JPEG、PNG、WEBP 和 HEIC 照片')
  const name = crypto.randomUUID() + type.ext
  const original = inside('originals', name)
  await fs.promises.rename(file.path, original)
  let thumbName = null
  let previewName = null
  let previewCandidate = null
  let thumbCandidate = null
  try {
    const meta = await sharp(original, { limitInputPixels: 60000000 }).metadata()
    if (meta.width > 0 && meta.height > 0 && meta.width * meta.height <= 60000000) {
      // Decode the full-resolution original once for the 2048px preview,
      // then derive the small 560px thumbnail from that bounded preview.
      previewCandidate = crypto.randomUUID() + '.jpg'
      await sharp(original, { limitInputPixels: 60000000 }).rotate().resize({
        width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true,
      }).jpeg({ quality: 85 }).toFile(inside('previews', previewCandidate))
      previewName = previewCandidate
      thumbCandidate = crypto.randomUUID() + '.jpg'
      await sharp(inside('previews', previewCandidate)).resize({
        width: 560, height: 560, fit: 'inside', withoutEnlargement: true,
      }).jpeg({ quality: 82 }).toFile(inside('thumbs', thumbCandidate))
      thumbName = thumbCandidate
    } else if (type.mime !== 'image/heic') throw badRequest('图片分辨率不符合要求')
  } catch (err) {
    // A failed encoder can leave a partially-written output.
    if (previewCandidate && previewCandidate !== previewName) {
      try { fs.unlinkSync(inside('previews', previewCandidate)) } catch { /* missing */ }
    }
    if (thumbCandidate && thumbCandidate !== thumbName) {
      try { fs.unlinkSync(inside('thumbs', thumbCandidate)) } catch { /* missing */ }
    }
    if (type.mime !== 'image/heic') {
      cleanupStored([{ storage_name: name, thumb_name: thumbName, preview_name: previewName }])
      throw badRequest('图片无法解码或超过像素限制')
    }
    // On hosts lacking the optional HEIC codec, retain the original for iOS.
    console.warn('garden HEIC preview unavailable; original preserved:', err.message)
  }
  return {
    storage_name: name, thumb_name: thumbName, preview_name: previewName,
    original_name: safeFilename(file.originalname), mime: type.mime, size_bytes: file.size,
  }
}
function savedImage(file) { return withMediaSlot(() => processImage(file)) }
function cleanupStored(photos) {
  for (const p of photos) {
    for (const [kind, field] of [['originals', 'storage_name'], ['thumbs', 'thumb_name'], ['previews', 'preview_name']]) {
      if (!p[field]) continue
      try { fs.unlinkSync(inside(kind, p[field])) } catch { /* an orphan will be harmless and retained in backups */ }
    }
  }
}
function photoLocation(photo, variant) {
  if (variant === 'original') return { path: inside('originals', photo.storage_name), mime: photo.mime }
  if (variant === 'thumb' && photo.thumb_name) return { path: inside('thumbs', photo.thumb_name), mime: 'image/jpeg' }
  if (variant === 'thumb' && photo.preview_name) return { path: inside('previews', photo.preview_name), mime: 'image/jpeg' }
  if (variant === 'preview' && photo.preview_name) return { path: inside('previews', photo.preview_name), mime: 'image/jpeg' }
  if (photo.mime === 'image/heic') return { path: inside('originals', photo.storage_name), mime: photo.mime }
  return { path: inside('originals', photo.storage_name), mime: photo.mime }
}
module.exports = { dirs, MAX_ENTRY_BYTES, uploadPhotos, cleanupTemporary, savedImage, cleanupStored, photoLocation, withMediaSlot }
