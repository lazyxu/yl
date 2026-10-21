'use strict'

const { Op, QueryTypes } = require('sequelize')
const sequelize = require('../sequelize')
const { GardenSpecies, GardenPlant, GardenEntry, GardenPhoto } = require('../models/garden')
const { badRequest, positiveId, text } = require('./garden-validation')

function decodeCursor(value, mode) {
  if (!value) return null
  if (typeof value !== 'string' || value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw badRequest('分页游标无效')
  }
  let decoded
  try { decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) }
  catch { throw badRequest('分页游标无效') }
  if (!Array.isArray(decoded) || decoded.length !== 3 || decoded[0] !== mode ||
      !positiveId(decoded[2])) throw badRequest('分页游标无效')
  if (mode === 'plants') {
    const date = new Date(decoded[1])
    if (typeof decoded[1] !== 'string' || !Number.isFinite(date.getTime()) ||
        date.toISOString() !== decoded[1]) throw badRequest('分页游标无效')
    return { date, id: Number(decoded[2]) }
  }
  if (typeof decoded[1] !== 'number' || !Number.isSafeInteger(decoded[1]) || decoded[1] < 0) {
    throw badRequest('分页游标无效')
  }
  return { milliseconds: decoded[1], id: Number(decoded[2]) }
}
function cursorFor(mode, item) {
  return Buffer.from(JSON.stringify(mode === 'plants'
    ? [mode, new Date(item.createdAt).toISOString(), item.id]
    : [mode, Number(item.observed_ts), item.id]), 'utf8').toString('base64url')
}
function pageParams(query, legacyLimit, defaultLimit, mode) {
  const paged = query.limit !== undefined || query.cursor !== undefined
  const limit = paged ? Number(query.limit ?? defaultLimit) : legacyLimit
  if (!Number.isInteger(limit) || limit < 1 || limit > (paged ? 100 : legacyLimit)) {
    throw badRequest('分页大小必须为 1–100')
  }
  return { paged, limit, cursor: paged ? decodeCursor(query.cursor, mode) : null }
}

// Bulk aggregation eliminates two extra SQL round-trips PER displayed plant.
async function summarizePlants(plants) {
  if (!plants.length) return []
  const ids = plants.map(p => p.id)
  // Count photo-bearing entries for the page in a single grouped pass, then
  // find the highest photo ID at the newest photo-bearing timestamp.
  // Equivalent to the old (observed_ts DESC, photo_id DESC) window ranking,
  // without sorting 60k individual photo rows on each plant detail request.
  const sql = [
    'SELECT stats.plant_id, stats.photo_count, MAX(p.id) AS latest_photo_id',
    'FROM (',
    ' SELECT e.plant_id, COUNT(*) AS photo_count, MAX(e.observed_ts) AS latest_observed_ts',
    ' FROM garden_entries e JOIN garden_photos p ON p.entry_id = e.id',
    ' WHERE e.plant_id IN (:ids) GROUP BY e.plant_id',
    ') stats',
    'JOIN garden_entries e ON e.plant_id = stats.plant_id',
    ' AND e.observed_ts = stats.latest_observed_ts',
    'JOIN garden_photos p ON p.entry_id = e.id',
    'GROUP BY stats.plant_id, stats.photo_count',
  ].join(' ')
  const rows = await sequelize.query(sql, { type: QueryTypes.SELECT, replacements: { ids } })
  const summaries = new Map(rows.map(row => [Number(row.plant_id), row]))
  return plants.map(instance => {
    const item = instance.get({ plain: true })
    const summary = summaries.get(Number(instance.id))
    return {
      ...item, species_name: item.species?.name || '',
      photo_count: Number(summary?.photo_count || 0),
      latest_photo_id: Number(summary?.latest_photo_id || 0),
    }
  })
}
async function listPlants(query) {
  const status = query.status || 'active'
  if (!['active', 'archived', 'all'].includes(status)) throw badRequest('花卉状态筛选无效')
  const keyword = text(query.q || '', 100, '搜索关键字')
  const filter = {}
  if (status !== 'all') filter.status = status
  if (keyword) {
    // Species names are searchable without changing the legacy query contract.
    const matches = await GardenSpecies.findAll({
      attributes: ['id'], where: { name: { [Op.like]: '%' + keyword + '%' } },
    })
    filter[Op.or] = [
      { name: { [Op.like]: '%' + keyword + '%' } },
      { location: { [Op.like]: '%' + keyword + '%' } },
      { species_id: { [Op.in]: matches.map(item => item.id) } },
    ]
  }
  if (query.species_id) {
    const speciesId = positiveId(query.species_id)
    if (!speciesId) throw badRequest('品种编号无效')
    filter.species_id = speciesId
  }
  const { paged, limit, cursor } = pageParams(query, 500, 36, 'plants')
  const where = { ...filter }
  if (cursor) {
    where[Op.and] = [{
      [Op.or]: [
        { createdAt: { [Op.lt]: cursor.date } },
        { createdAt: cursor.date, id: { [Op.lt]: cursor.id } },
      ],
    }]
  }
  const [rows, total] = await Promise.all([
    GardenPlant.findAll({
      where, include: [{ model: GardenSpecies, as: 'species', attributes: ['id', 'name'] }],
      order: [['createdAt', 'DESC'], ['id', 'DESC']], limit: limit + (paged ? 1 : 0),
    }),
    paged ? GardenPlant.count({ where: filter }) : Promise.resolve(null),
  ])
  const hasMore = paged && rows.length > limit
  const pageRows = rows.slice(0, limit)
  const items = await summarizePlants(pageRows)
  if (!paged) return items
  return { items, total, has_more: hasMore, next_cursor: hasMore ? cursorFor('plants', pageRows[pageRows.length - 1]) : null }
}
async function listDay(date, query) {
  const { paged, limit, cursor } = pageParams(query, 200, 40, 'day')
  const filter = { local_date: date }
  const where = { ...filter }
  if (cursor) {
    where[Op.and] = [{
      [Op.or]: [
        { observed_ts: { [Op.lt]: cursor.milliseconds } },
        { observed_ts: cursor.milliseconds, id: { [Op.lt]: cursor.id } },
      ],
    }]
  }
  const [rows, total] = await Promise.all([
    GardenEntry.findAll({
      where,
      include: [
        { model: GardenPlant, as: 'plant', attributes: ['id', 'name'] },
        { model: GardenPhoto, as: 'photos', attributes: ['id'] },
      ],
      order: [['observed_ts', 'DESC'], ['id', 'DESC']], limit: limit + (paged ? 1 : 0),
    }),
    paged ? GardenEntry.count({ where: filter }) : Promise.resolve(null),
  ])
  const hasMore = paged && rows.length > limit
  const pageRows = rows.slice(0, limit)
  const items = pageRows.map(row => ({
    id: row.id, plant_id: row.plant_id, plant_name: row.plant?.name || '',
    note: row.note, observed_at: row.observed_at, photo_id: row.photos?.[0]?.id || 0,
  }))
  if (!paged) return items
  return { items, total, has_more: hasMore, next_cursor: hasMore ? cursorFor('day', pageRows[pageRows.length - 1]) : null }
}

module.exports = { listPlants, listDay, summarizePlants, decodeCursor, cursorFor }
