const express = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs')

const router = express.Router()

const UPLOAD_DIR = path.resolve(__dirname, '..', '..', 'tmp', 'uploads')
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, UPLOAD_DIR) },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname)
    const name = Date.now() + '-' + Math.random().toString(36).slice(2,8) + ext
    cb(null, name)
  }
})

function fileFilter(req, file, cb){
  if (!file.mimetype.startsWith('image/')) return cb(new Error('只允许上传图片'), false)
  cb(null, true)
}

const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } })

// POST /api/upload
router.post('/', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'no file' })
  const relPath = path.join('tmp', 'uploads', req.file.filename)
  // 返回文件信息，后续可由服务器进一步处理（OCR）
  res.json({ ok: true, filename: req.file.filename, path: relPath, mimetype: req.file.mimetype, size: req.file.size })
})

module.exports = router
