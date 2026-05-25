const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const PindouReminder = sequelize.define('PindouReminder', {
  operation: { type: DataTypes.STRING, allowNull: false },
  items: { type: DataTypes.JSON, allowNull: false },
  note: { type: DataTypes.STRING },
  occurred_at: { type: DataTypes.DATE, allowNull: false },
}, {
  tableName: 'pindou_reminders',
  underscored: true,
  timestamps: true,
});

module.exports = PindouReminder;
