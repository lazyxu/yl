const express = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs')

const router = express.Router()

const UPLOAD_DIR = path.resolve(__dirname, '..', '..', 'tmp', 'uploads')
console.log('UPLOAD_DIR:', UPLOAD_DIR)
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
  // 返回仅包含文件名，前端可使用专门的接口获取图片
  res.json({ ok: true, filename: req.file.filename })
})

// GET /api/upload/:filename - 返回图片文件（前端可通过该接口加载图片）
router.get('/:filename', (req, res) => {
  const filename = req.params.filename
  if (!filename) return res.status(400).json({ ok: false, error: 'missing filename' })
  const filePath = path.resolve(UPLOAD_DIR, filename)
  if (!fs.existsSync(filePath)) return res.status(404).json({ ok: false, error: 'not found' })
  // 直接发送文件；Express 会自动设置 Content-Type
  res.sendFile(filePath)
})

module.exports = router
