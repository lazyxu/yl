const path = require('path');
const fs = require('fs');
// 读取环境配置：优先使用当前目录下的 .env（便于发布后将 server 展开为顶层），否则回退到父目录的 .env
const envPaths = [path.resolve(__dirname, '.env'), path.resolve(__dirname, '..', '.env')];
for (const p of envPaths) {
  if (fs.existsSync(p)) {
    require('dotenv').config({ path: p });
    break;
  }
}
const express = require('express');
const cors = require('cors');
const sequelize = require('./sequelize');
const remindersRouter = require('./routes/reminders');
const inventoryRouter = require('./routes/inventory');
const uploadRouter = require('./routes/upload');
const gardenRouter = require('./routes/garden');
// Load garden Sequelize models and associations before the startup schema sync.
const settingsRouter = require('./routes/settings');
const dayShiftsRouter = require('./routes/day-shifts');
const mysql = require('mysql2/promise');

const app = express();
const corsOptions = {
  origin: true, // 允许所有来源（配合 credentials 时会反射请求来源）
  credentials: true,
};
app.use(cors(corsOptions));
app.use('/api/settings/shifts/overrides', dayShiftsRouter);
app.use('/api/settings/shifts', settingsRouter);
app.use(express.json());

app.use('/api/reminders', remindersRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/garden', gardenRouter);

// 如果存在前端构建产物，则让 Express 提供静态文件并回退到 index.html
// 优先使用 server/dist（便于在发布目录直接从 server 运行），否则回退到 ../dist
const serverDist = path.resolve(__dirname, 'dist');
const parentDist = path.resolve(__dirname, '..', 'dist');
let distPath = null;
if (fs.existsSync(serverDist)) distPath = serverDist;
else if (fs.existsSync(parentDist)) distPath = parentDist;

if (distPath) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// global error handler to ensure JSON responses on unexpected errors
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (res.headersSent) return next(err);
  if (err.type === 'entity.too.large') return res.status(413).json({ error: '请求内容过大，请减少设置后重试' });
  res.status(err.status === 400 ? 400 : 500).json({ error: err && err.message ? err.message : 'internal server error' });
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

async function start() {
  try {
    // 在尝试连接 Sequelize 之前，确保数据库存在（若有权限则创建）
    async function ensureDatabaseExists() {
      const dbName = process.env.DB_NAME;
      const dbUser = process.env.DB_USER;
      const dbPassword = process.env.DB_PASSWORD;
      const dbHost = process.env.DB_HOST || 'localhost';

      if (!dbName || !dbUser) {
        throw new Error('缺少环境变量 DB_NAME 或 DB_USER，无法创建数据库');
      }

      const connection = await mysql.createConnection({ host: dbHost, user: dbUser, password: dbPassword });
      await connection.query(
        `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
      );
      await connection.end();
    }

    await ensureDatabaseExists();
    await sequelize.authenticate();
    // sync with alter to add new nullable columns like image_path
    await sequelize.sync({ alter: true });
    await settingsRouter.initializeShiftSettings();
    return await new Promise((resolve, reject) => {
      const server = app.listen(PORT, HOST, () => {
        console.log(`Server started on ${HOST}:${server.address().port}`);
        resolve(server);
      });
      server.once('error', reject);
    });
  } catch (err) {
    console.error('Failed to start server', err);
    process.exit(1);
  }
}

if (require.main === module) start();
module.exports = { start };
