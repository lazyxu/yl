const express = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs')

const router = express.Router()

const UPLOAD_DIR = path.resolve(__dirname, '..', 'uploads')
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

const upload = multer({ storage, fileFilter, limits: { fileSize: 50 * 1024 * 1024 } })

// POST /api/upload
router.post('/', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'no file' })
  // 返回仅包含文件名，前端可使用专门的接口获取图片
  res.json({ ok: true, filename: req.file.filename })
})

// GET /api/upload/:filename - 返回图片文件（前端可通过该接口加载图片）
// 受控下载：做简单路径归一化防护与缓存头，必要时在此处加入鉴权
router.get('/:filename', (req, res) => {
  const raw = req.params.filename
  if (!raw) return res.status(400).json({ ok: false, error: 'missing filename' })
  // 防止路径遍历：只保留 basename
  const name = path.basename(raw)
  const filePath = path.join(UPLOAD_DIR, name)
  if (!fs.existsSync(filePath)) return res.status(404).json({ ok: false, error: 'not found' })

  // 可在此处加鉴权示例：
  // if (!req.user) return res.status(401).json({ ok: false, error: 'unauthorized' })

  // 设置缓存头（可根据需求调整）
  res.setHeader('Cache-Control', 'public, max-age=3600')
  // 建议前端以 <img src="/api/upload/{filename}"> 直接加载
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error('sendFile error', err)
      if (!res.headersSent) res.status(500).end()
    }
  })
})

module.exports = router
