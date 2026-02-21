import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as sqlite from 'sqlite';
const { open: openDb } = sqlite;
import sqlite3 from 'sqlite3';
import crypto from 'node:crypto';

const uploadDir = path.join(path.resolve('./uploads'));
const dbPath = path.resolve('./uploads/photos.db');

const initDb = async () => {
  await mkdir(path.dirname(dbPath), { recursive: true });

  const db = await openDb({
    filename: dbPath,
    driver: sqlite3.Database,
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      album TEXT NOT NULL,
      mediaType TEXT NOT NULL,
      type TEXT NOT NULL,
      size INTEGER NOT NULL,
      sha256 TEXT UNIQUE NOT NULL,
      createdAt TEXT NOT NULL
    );
  `);

  return db;
};

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

  const fileBuffer = Buffer.from(base64, 'base64');
  const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  const safeName = name.replace(/[\\/:*?"<>|]/g, '_');
  const filePath = path.join('./uploads', sha256);

  await writeFile(filePath, fileBuffer);

  const photo = {
    id: randomUUID(),
    name: safeName,
    album,
    mediaType: mimeType.startsWith('video/') ? 'video' : 'photo',
    type: mimeType,
    size: fileBuffer.length,
    sha256,
    createdAt: new Date().toISOString(),
  };

  await writePhoto(photo);
  return photo;
};

export const normalizeMedia = (media = {}) => {
  const defaults = {
    id: String(media.id || randomUUID()),
    name: String(media.name || '').trim() || 'Untitled',
    album: String(media.album || '未分类'),
    mediaType: media.mediaType || (String(media.type || '').startsWith('video/') ? 'video' : 'photo'),
    type: String(media.type || ''),
    size: Number(media.size ?? 0),
    sha256: String(media.sha256 || ''),
    createdAt: media.createdAt || new Date().toISOString(),
  };

  return { ...defaults, ...media };
};

export const ensureStorage = async () => {
  await mkdir(uploadDir, { recursive: true });
};

export const readPhotos = async () => {
  const db = await initDb();
  const photos = await db.all('SELECT * FROM photos');
  return photos;
};

export const writePhoto = async (photo) => {
  const db = await initDb();
  await db.run(
    `INSERT INTO photos (name, album, mediaType, type, size, sha256, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    photo.name,
    photo.album,
    photo.mediaType,
    photo.type,
    photo.size,
    photo.sha256,
    photo.createdAt
  );
};

export const deletePhoto = async (sha256) => {
  const db = await initDb();
  await db.run('DELETE FROM photos WHERE sha256 = ?', sha256);
};
