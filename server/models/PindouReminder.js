const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const PindouReminder = sequelize.define('PindouReminder', {
  operation: { type: DataTypes.STRING, allowNull: false },
  items: { type: DataTypes.JSON, allowNull: false },
  note: { type: DataTypes.STRING },
  // 可选的图片路径（相对或绝对），允许为 null
  image_path: { type: DataTypes.STRING, allowNull: true },
  occurred_at: { type: DataTypes.DATE, allowNull: false },
}, {
  tableName: 'pindou_reminders',
  underscored: true,
  timestamps: true,
});

module.exports = PindouReminder;
