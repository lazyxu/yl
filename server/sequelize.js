require('dotenv').config();
const { Sequelize } = require('sequelize');

// 仅支持 MySQL：必须通过环境变量提供 DB_NAME、DB_USER、DB_PASSWORD（可选 DB_HOST，默认 localhost）
const dbName = process.env.DB_NAME;
const dbUser = process.env.DB_USER;
const dbPassword = process.env.DB_PASSWORD;
const dbHost = process.env.DB_HOST || 'localhost';

if (!dbName || !dbUser || !dbPassword) {
    throw new Error('数据库配置不完整：请设置环境变量 DB_NAME、DB_USER、DB_PASSWORD（可选 DB_HOST）。项目仅支持 MySQL。');
}

const sequelize = new Sequelize(dbName, dbUser, dbPassword, {
    host: dbHost,
    dialect: 'mysql',
    logging: false,
});

module.exports = sequelize;
