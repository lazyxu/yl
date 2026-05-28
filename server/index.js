const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
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
// serve uploaded files (for debugging); consider securing or removing in production
app.use('/uploads', express.static(path.resolve(__dirname, '..', 'tmp', 'uploads')));

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
