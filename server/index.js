const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const sequelize = require('./sequelize');
const remindersRouter = require('./routes/reminders');
const inventoryRouter = require('./routes/inventory');

const app = express();
const corsOptions = {
  origin: true, // 允许所有来源（配合 credentials 时会反射请求来源）
  credentials: true,
};
app.use(cors(corsOptions));
app.use(express.json());

app.use('/api/reminders', remindersRouter);
app.use('/api/inventory', inventoryRouter);

const PORT = process.env.PORT || 4000;

async function start() {
  try {
    await sequelize.authenticate();
    await sequelize.sync();
    app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
  } catch (err) {
    console.error('Failed to start server', err);
    process.exit(1);
  }
}

start();
