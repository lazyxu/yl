import { createServer as createHttpServer } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const uploadDir = path.join(rootDir, 'uploads')
const dbPath = path.join(uploadDir, 'photos.json')
const port = Number(process.env.PORT || 3001)
const host = process.env.HOST || '0.0.0.0'
const isHttpsEnabled = String(process.env.HTTPS || '').toLowerCase() === 'true'
const httpsKeyPath = process.env.HTTPS_KEY_PATH || path.join(__dirname, 'certs', 'localhost-key.pem')
const httpsCertPath = process.env.HTTPS_CERT_PATH || path.join(__dirname, 'certs', 'localhost-cert.pem')
const MAX_BODY_BYTES = 25 * 1024 * 1024

const extByMime = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
}

const normalizeMedia = (media) => ({
  ...media,
  album: String(media.album || '未分类'),
  mediaType: media.mediaType || (String(media.type || '').startsWith('video/') ? 'video' : 'photo'),
})

const ensureStorage = async () => {
  await mkdir(uploadDir, { recursive: true })
  try {
    await stat(dbPath)
  } catch {
    await writeFile(dbPath, '[]', 'utf8')
  }
}

const readPhotos = async () => {
  await ensureStorage()
  const content = await readFile(dbPath, 'utf8')
  try {
    const parsed = JSON.parse(content)
    return Array.isArray(parsed) ? parsed.map(normalizeMedia) : []
  } catch {
    return []
  }
}

const writePhotos = async (photos) => {
  await ensureStorage()
  await writeFile(dbPath, JSON.stringify(photos, null, 2), 'utf8')
}

const sendJson = (res, statusCode, payload) => {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  })
  res.end(JSON.stringify(payload))
}

const sendFile = async (res, filePath) => {
  const ext = path.extname(filePath).toLowerCase()
  const mimeType = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.heic': 'image/heic',
    '.heif': 'image/heif',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
  }[ext] || 'application/octet-stream'

  try {
    const buffer = await readFile(filePath)
    res.writeHead(200, {
      'Content-Type': mimeType,
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    })
    res.end(buffer)
  } catch {
    sendJson(res, 404, { message: '文件不存在' })
  }
}

const readJsonBody = (req) =>
  new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
      if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
        reject(new Error('请求体过大'))
      }
    })
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch {
        reject(new Error('JSON 格式错误'))
      }
    })
    req.on('error', reject)
  })

const createPhoto = async (payload) => {
  const name = String(payload.name || '').trim()
  const album = String(payload.album || '未分类').trim() || '未分类'
  const type = String(payload.type || '').trim()
  const data = String(payload.data || '')

  if (!name || !type || (!data.startsWith('data:image/') && !data.startsWith('data:video/'))) {
    throw new Error('上传参数不完整')
  }

  const matched = data.match(/^data:((image|video)\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
  if (!matched) {
    throw new Error('图片格式无效')
  }

  const mimeType = matched[1]
  const base64 = matched[3]
  const ext = extByMime[mimeType]
  if (!ext) {
    throw new Error(`不支持的图片类型：${mimeType}`)
  }

  const id = randomUUID()
  const fileName = `${id}.${ext}`
  const safeName = name.replace(/[\\/:*?"<>|]/g, '_')
  const filePath = path.join(uploadDir, fileName)
  const fileBuffer = Buffer.from(base64, 'base64')
  await writeFile(filePath, fileBuffer)

  return {
    id,
    name: safeName,
    album,
    mediaType: mimeType.startsWith('video/') ? 'video' : 'photo',
    type: mimeType,
    size: fileBuffer.length,
    url: `/uploads/${fileName}`,
    createdAt: new Date().toISOString(),
  }
}

const requestHandler = async (req, res) => {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host}`)
  const pathname = requestUrl.pathname

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    res.end()
    return
  }

  if (req.method === 'GET' && pathname === '/api/health') {
    sendJson(res, 200, { ok: true })
    return
  }

  if (req.method === 'GET' && pathname === '/api/photos') {
    const photos = await readPhotos()
    sendJson(res, 200, { photos })
    return
  }

  if (req.method === 'GET' && pathname.startsWith('/api/photos/')) {
    const id = pathname.split('/').pop()
    const photos = await readPhotos()
    const target = photos.find((photo) => photo.id === id)

    if (!target) {
      sendJson(res, 404, { message: '资源不存在' })
      return
    }

    sendJson(res, 200, { photo: target })
    return
  }

  if (req.method === 'POST' && pathname === '/api/photos') {
    try {
      const payload = await readJsonBody(req)
      const created = await createPhoto(payload)
      const photos = await readPhotos()
      photos.unshift(created)
      await writePhotos(photos)
      sendJson(res, 201, { photo: created })
    } catch (error) {
      const message = error instanceof Error ? error.message : '上传失败'
      const statusCode = message === '请求体过大' ? 413 : 400
      sendJson(res, statusCode, { message })
    }
    return
  }

  if (req.method === 'DELETE' && pathname === '/api/photos') {
    const photos = await readPhotos()
    await Promise.all(
      photos.map(async (photo) => {
        const filePath = path.join(rootDir, photo.url.replace(/^\//, ''))
        try {
          await unlink(filePath)
        } catch (error) {
          void error
        }
      }),
    )
    await writePhotos([])
    sendJson(res, 200, { ok: true })
    return
  }

  if (req.method === 'DELETE' && pathname.startsWith('/api/photos/')) {
    const id = pathname.split('/').pop()
    const photos = await readPhotos()
    const target = photos.find((photo) => photo.id === id)

    if (!target) {
      sendJson(res, 404, { message: '图片不存在' })
      return
    }

    const filePath = path.join(rootDir, target.url.replace(/^\//, ''))
    try {
      await unlink(filePath)
    } catch (error) {
      void error
    }

    await writePhotos(photos.filter((photo) => photo.id !== id))
    sendJson(res, 200, { ok: true })
    return
  }

  if (req.method === 'GET' && pathname.startsWith('/uploads/')) {
    const filePath = path.join(rootDir, pathname.replace(/^\//, ''))
    await sendFile(res, filePath)
    return
  }

  sendJson(res, 404, { message: '接口不存在' })
}

const createServerByMode = async () => {
  if (!isHttpsEnabled) {
    return {
      server: createHttpServer(requestHandler),
      protocol: 'http',
    }
  }

  const [key, cert] = await Promise.all([readFile(httpsKeyPath), readFile(httpsCertPath)])
  return {
    server: createHttpsServer({ key, cert }, requestHandler),
    protocol: 'https',
  }
}

ensureStorage()
  .then(createServerByMode)
  .then(({ server, protocol }) => {
    server.listen(port, host, () => {
      console.log(`Upload API running at ${protocol}://${host}:${port}`)
      if (protocol === 'https') {
        console.log(`HTTPS key: ${httpsKeyPath}`)
        console.log(`HTTPS cert: ${httpsCertPath}`)
      }
    })
  })
  .catch((error) => {
    console.error('Server start failed:', error)
    process.exit(1)
  })