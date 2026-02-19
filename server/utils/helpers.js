import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const uploadDir = path.join(path.resolve('./uploads'));
const dbPath = path.join(uploadDir, 'photos.json');
const MAX_BODY_BYTES = 25 * 1024 * 1024;

export const extByMime = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

export const sendJson = (res, statusCode, payload) => {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(payload));
};

export const sendFile = async (res, filePath) => {
  const ext = path.extname(filePath).toLowerCase();
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
  }[ext] || 'application/octet-stream';

  try {
    const buffer = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': mimeType,
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(buffer);
  } catch {
    sendJson(res, 404, { message: '文件不存在' });
  }
};

export const readJsonBody = (req) =>
  new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
        reject(new Error('请求体过大'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('JSON 格式错误'));
      }
    });
    req.on('error', reject);
  });

export const createPhoto = async (payload) => {
  const name = String(payload.name || '').trim();
  const album = String(payload.album || '未分类').trim() || '未分类';
  const type = String(payload.type || '').trim();
  const data = String(payload.data || '');

  if (!name || !type || (!data.startsWith('data:image/') && !data.startsWith('data:video/'))) {
    throw new Error('上传参数不完整');
  }

  const matched = data.match(/^data:((image|video)\/[-a-zA-Z0-9.+]+);base64,(.+)$/);
  if (!matched) {
    throw new Error('图片格式无效');
  }

  const mimeType = matched[1];
  const base64 = matched[3];
  const ext = extByMime[mimeType];
  if (!ext) {
    throw new Error(`不支持的图片类型：${mimeType}`);
  }

  const id = randomUUID();
  const fileName = `${id}.${ext}`;
  const safeName = name.replace(/[\\/:*?"<>|]/g, '_');
  const filePath = path.join(uploadDir, fileName);
  const fileBuffer = Buffer.from(base64, 'base64');
  await writeFile(filePath, fileBuffer);

  return {
    id,
    name: safeName,
    album,
    mediaType: mimeType.startsWith('video/') ? 'video' : 'photo',
    type: mimeType,
    size: fileBuffer.length,
    url: `/uploads/${fileName}`,
    createdAt: new Date().toISOString(),
  };
};

export const normalizeMedia = (media) => ({
  ...media,
  album: String(media.album || '未分类'),
  mediaType: media.mediaType || (String(media.type || '').startsWith('video/') ? 'video' : 'photo'),
});

export const ensureStorage = async () => {
  await mkdir(uploadDir, { recursive: true });
  try {
    await stat(dbPath);
  } catch {
    await writeFile(dbPath, '[]', 'utf8');
  }
};

export const readPhotos = async () => {
  await ensureStorage();
  const content = await readFile(dbPath, 'utf8');
  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed.map(normalizeMedia) : [];
  } catch {
    return [];
  }
};

export const writePhotos = async (photos) => {
  const photosWithoutData = photos.map(({ data, ...photo }) => photo);
  await ensureStorage();
  await writeFile(dbPath, JSON.stringify(photosWithoutData, null, 2), 'utf8');
};
