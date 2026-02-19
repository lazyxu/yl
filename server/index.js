import express from 'express';
import cors from 'cors';
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import apiRoutes from './routes/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const uploadDir = path.join(rootDir, 'uploads');
const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || '0.0.0.0';
const MAX_BODY_BYTES = 25 * 1024 * 1024;

const app = express();
app.use(cors());
app.use(express.json({ limit: `${MAX_BODY_BYTES}b` }));

app.use('/uploads', express.static(uploadDir));
app.use('/api', apiRoutes);

app.listen(port, host, () => {
  console.log(`Express server running at http://${host}:${port}/`);
});