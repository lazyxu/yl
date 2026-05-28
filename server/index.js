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

const app = express();
const corsOptions = {
  origin: true, // 允许所有来源（配合 credentials 时会反射请求来源）
  credentials: true,
};
app.use(cors(corsOptions));
app.use(express.json());

app.use('/api/reminders', remindersRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/upload', uploadRouter);

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
  res.status(500).json({ error: err && err.message ? err.message : 'internal server error' });
});

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await sequelize.authenticate();
    // sync with alter to add new nullable columns like image_path
    await sequelize.sync({ alter: true });
    app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
  } catch (err) {
    console.error('Failed to start server', err);
    process.exit(1);
  }
}

start();
