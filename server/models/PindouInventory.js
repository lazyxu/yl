'use strict'

const { DataTypes } = require('sequelize')
const sequelize = require('../sequelize')

// A materialized projection of the immutable-ish pindou_reminders ledger.
// Each write updates both ledger and projection in a single MySQL transaction.
const PindouInventory = sequelize.define('PindouInventory', {
  color: { type: DataTypes.STRING(60), primaryKey: true, allowNull: false },
  quantity: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
}, { tableName: 'pindou_inventory', timestamps: false })

// Seeding is a one-time operation. Never re-sum the ledger on every page load.
const PindouInventoryMeta = sequelize.define('PindouInventoryMeta', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true },
  initialized: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
}, { tableName: 'pindou_inventory_meta', timestamps: false })

module.exports = { PindouInventory, PindouInventoryMeta }
