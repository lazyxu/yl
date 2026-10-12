const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

module.exports = sequelize.define('AppSetting', {
  key: { type: DataTypes.STRING(64), primaryKey: true },
  value: { type: DataTypes.JSON, allowNull: false },
  version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
}, {
  tableName: 'app_settings',
  underscored: true,
  timestamps: true,
});
