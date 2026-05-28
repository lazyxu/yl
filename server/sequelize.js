require('dotenv').config();
const path = require('path');
const { Sequelize } = require('sequelize');

// Prefer explicit DB_DIALECT env, otherwise fall back to MySQL when DB_USER/DB_NAME present,
// else use SQLite for local development to avoid startup failures when MySQL isn't configured.
const envDialect = process.env.DB_DIALECT;
const useMysql = envDialect === 'mysql' || (envDialect !== 'sqlite' && process.env.DB_USER && process.env.DB_NAME);

let sequelize;
if (useMysql) {
    sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
        host: process.env.DB_HOST || 'localhost',
        dialect: 'mysql',
        logging: false,
    });
} else {
    const storagePath = path.resolve(__dirname, '..', 'tmp', 'dev.sqlite');
    sequelize = new Sequelize({ dialect: 'sqlite', storage: storagePath, logging: false });
}

module.exports = sequelize;
