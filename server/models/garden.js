'use strict'
const { DataTypes } = require('sequelize')
const sequelize = require('../sequelize')

// The garden shares yl's existing MySQL and SSH/PM2 deployment.
// No accounts/sessions are introduced in this phase.
const GardenSpecies = sequelize.define('GardenSpecies', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(100), allowNull: false },
}, { tableName: 'garden_species', underscored: true, indexes: [
  // Explicit stable unique index prevents ALTER startup from adding name_2, name_3 ...
  { name: 'name', unique: true, fields: ['name'] },
] })

const GardenPlant = sequelize.define('GardenPlant', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(100), allowNull: false },
  species_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  planted_on: { type: DataTypes.DATEONLY, allowNull: true },
  location: { type: DataTypes.STRING(200), allowNull: false, defaultValue: '' },
  notes: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
  status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'active' },
}, { tableName: 'garden_plants', underscored: true, indexes: [
  { fields: ['species_id', 'status'] },
  { fields: ['created_at', 'id'] },
  { fields: ['status', 'created_at', 'id'] },
  { fields: ['species_id', 'created_at', 'id'] },
] })

const GardenEntry = sequelize.define('GardenEntry', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  plant_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  observed_at: { type: DataTypes.DATE, allowNull: false },
  observed_ts: { type: DataTypes.BIGINT, allowNull: false },
  local_date: { type: DataTypes.DATEONLY, allowNull: false },
  note: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
  author_name: { type: DataTypes.STRING(60), allowNull: false, defaultValue: '' },
}, { tableName: 'garden_entries', underscored: true, indexes: [
  { fields: ['plant_id', 'observed_ts'] },
  { fields: ['local_date'] },
  { fields: ['local_date', 'observed_ts', 'id'] },
  { fields: ['plant_id', 'local_date'] },
] })

const GardenPhoto = sequelize.define('GardenPhoto', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  entry_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  storage_name: { type: DataTypes.STRING(100), allowNull: false },
  thumb_name: { type: DataTypes.STRING(100), allowNull: true },
  preview_name: { type: DataTypes.STRING(100), allowNull: true },
  original_name: { type: DataTypes.STRING(160), allowNull: false },
  mime: { type: DataTypes.STRING(40), allowNull: false },
  size_bytes: { type: DataTypes.BIGINT, allowNull: false },
}, { tableName: 'garden_photos', underscored: true, indexes: [
  { fields: ['entry_id'] },
  { name: 'storage_name', unique: true, fields: ['storage_name'] },
] })

GardenPlant.belongsTo(GardenSpecies, { foreignKey: 'species_id', as: 'species', onDelete: 'SET NULL' })
GardenSpecies.hasMany(GardenPlant, { foreignKey: 'species_id', as: 'plants' })
GardenEntry.belongsTo(GardenPlant, { foreignKey: 'plant_id', as: 'plant', onDelete: 'CASCADE' })
GardenPlant.hasMany(GardenEntry, { foreignKey: 'plant_id', as: 'entries' })
GardenPhoto.belongsTo(GardenEntry, { foreignKey: 'entry_id', as: 'entry', onDelete: 'CASCADE' })
GardenEntry.hasMany(GardenPhoto, { foreignKey: 'entry_id', as: 'photos' })

module.exports = { GardenSpecies, GardenPlant, GardenEntry, GardenPhoto }
