'use strict'
const express = require('express')
const fs = require('node:fs')
const sequelize = require('../sequelize')
const { GardenSpecies, GardenPlant, GardenEntry, GardenPhoto } = require('../models/garden')
const { badRequest, validDay, positiveId, text, normalizePlant, normalizeEntry } = require('../services/garden-validation')
const { MAX_ENTRY_BYTES, uploadPhotos, cleanupTemporary, savedImage, cleanupStored, photoLocation } = require('../services/garden-media')
const { listPlants, listDay, summarizePlants } = require('../services/garden-query')
const router = express.Router()
router.use(express.json({ limit: '128kb' }))

const wrap = fn => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next)
function reject(res, message, status = 400) { return res.status(status).json({ error: message }) }
async function requiredPlant(id) {
  const plant = await GardenPlant.findByPk(id, { include: [{ model: GardenSpecies, as: 'species', attributes: ['id', 'name'] }] })
  if (!plant) { const err = new Error('花卉不存在'); err.status = 404; throw err }
  return plant
}
async function plantSummary(plant) {
  return (await summarizePlants([plant]))[0]
}
function entryResponse(instance) {
  const value = instance.get({ plain: true })
  return { ...value, photos: (value.photos || []).map(p => ({
    id: p.id, name: p.original_name, mime: p.mime, size: Number(p.size_bytes),
  })) }
}
function validPagination(query) {
  const limit = query.limit === undefined ? 40 : Number(query.limit)
  const offset = query.offset === undefined ? 0 : Number(query.offset)
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 1000000) {
    throw badRequest('分页参数无效')
  }
  return { limit, offset }
}
function noCache(res) { res.setHeader('Cache-Control', 'private, no-store') }

router.get('/species', wrap(async (_req, res) => {
  const items = await GardenSpecies.findAll({ order: [['name', 'ASC']] })
  res.json(items)
}))
router.post('/species', wrap(async (req, res) => {
  const name = text(req.body?.name, 100, '品种名称', true)
  const [species, created] = await GardenSpecies.findOrCreate({ where: { name }, defaults: { name } })
  res.status(created ? 201 : 200).json(species)
}))
router.patch('/species/:id', wrap(async (req, res) => {
  const id = positiveId(req.params.id)
  if (!id) return reject(res, '品种编号无效')
  const name = text(req.body?.name, 100, '品种名称', true)
  const species = await GardenSpecies.findByPk(id)
  if (!species) return reject(res, '品种不存在', 404)
  await species.update({ name })
  res.json(species)
}))
router.delete('/species/:id', wrap(async (req, res) => {
  const id = positiveId(req.params.id)
  if (!id) return reject(res, '品种编号无效')
  const species = await GardenSpecies.findByPk(id)
  if (!species) return reject(res, '品种不存在', 404)
  // On-delete SET NULL keeps every plant and its journal.
  await species.destroy()
  res.json({ ok: true })
}))

router.get('/plants', wrap(async (req, res) => {
  res.json(await listPlants(req.query))
}))
router.post('/plants', wrap(async (req, res) => {
  const data = normalizePlant(req.body)
  if (data.species_id && !(await GardenSpecies.findByPk(data.species_id))) return reject(res, '品种不存在')
  const plant = await GardenPlant.create(data)
  res.status(201).json(await plantSummary(await requiredPlant(plant.id)))
}))
router.get('/plants/:id', wrap(async (req, res) => {
  const id = positiveId(req.params.id)
  if (!id) throw badRequest('花卉编号无效')
  res.json(await plantSummary(await requiredPlant(id)))
}))
router.patch('/plants/:id', wrap(async (req, res) => {
  const id = positiveId(req.params.id)
  if (!id) throw badRequest('花卉编号无效')
  const plant = await requiredPlant(id)
  const data = normalizePlant(req.body)
  if (data.species_id && !(await GardenSpecies.findByPk(data.species_id))) return reject(res, '品种不存在')
  await plant.update(data)
  res.json(await plantSummary(await requiredPlant(id)))
}))
router.delete('/plants/:id', wrap(async (req, res) => {
  const id = positiveId(req.params.id)
  if (!id) throw badRequest('花卉编号无效')
  const plant = await requiredPlant(id)
  const photos = await GardenPhoto.findAll({
    include: [{ model: GardenEntry, as: 'entry', attributes: [], required: true, where: { plant_id: id } }],
  })
  await plant.destroy()
  cleanupStored(photos)
  res.json({ ok: true })
}))

router.get('/entries', wrap(async (req, res) => {
  const plantId = positiveId(req.query.plant_id)
  if (!plantId) throw badRequest('缺少花卉编号')
  const { limit, offset } = validPagination(req.query)
  const rows = await GardenEntry.findAll({
    where: { plant_id: plantId }, include: [{ model: GardenPhoto, as: 'photos' }],
    order: [['observed_ts', 'DESC'], ['id', 'DESC']],
    limit: limit + 1, offset,
  })
  res.json({ items: rows.slice(0, limit).map(entryResponse), has_more: rows.length > limit })
}))
router.post('/entries', uploadPhotos, wrap(async (req, res) => {
  const created = []
  let transaction
  try {
    const plantId = positiveId(req.body.plant_id)
    if (!plantId) throw badRequest('花卉编号无效')
    await requiredPlant(plantId)
    const data = normalizeEntry(req.body)
    const files = req.files || []
    if (!files.length || files.length > 8) throw badRequest('每条日记须有 1–8 张照片')
    const bytes = files.reduce((total, file) => total + file.size, 0)
    if (bytes > MAX_ENTRY_BYTES) {
      const err = new Error('本次照片总大小不得超过 90 MiB')
      err.status = 413
      throw err
    }
    for (const file of files) created.push(await savedImage(file))
    transaction = await sequelize.transaction()
    const entry = await GardenEntry.create({ ...data, plant_id: plantId }, { transaction })
    await GardenPhoto.bulkCreate(created.map(photo => ({ ...photo, entry_id: entry.id })), { transaction })
    await transaction.commit()
    transaction = null
    res.status(201).json({ id: entry.id })
  } catch (err) {
    if (transaction) await transaction.rollback().catch(() => {})
    cleanupStored(created)
    throw err
  } finally {
    cleanupTemporary(req.files)
  }
}))
router.patch('/entries/:id', wrap(async (req, res) => {
  const id = positiveId(req.params.id)
  if (!id) throw badRequest('日记编号无效')
  const entry = await GardenEntry.findByPk(id)
  if (!entry) return reject(res, '日记不存在', 404)
  await entry.update(normalizeEntry(req.body))
  res.json({ ok: true })
}))
router.delete('/entries/:id', wrap(async (req, res) => {
  const id = positiveId(req.params.id)
  if (!id) throw badRequest('日记编号无效')
  const entry = await GardenEntry.findByPk(id, { include: [{ model: GardenPhoto, as: 'photos' }] })
  if (!entry) return reject(res, '日记不存在', 404)
  const photos = entry.photos || []
  await entry.destroy()
  cleanupStored(photos)
  res.json({ ok: true })
}))
router.get('/photos/:id/:variant', wrap(async (req, res) => {
  const id = positiveId(req.params.id)
  if (!id || !['original', 'thumb', 'preview'].includes(req.params.variant)) return reject(res, '照片不存在', 404)
  const photo = await GardenPhoto.findByPk(id)
  if (!photo) return reject(res, '照片不存在', 404)
  const location = photoLocation(photo, req.params.variant)
  noCache(res)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.type(location.mime)
  if (req.query.download === '1') return res.download(location.path, photo.original_name)
  res.sendFile(location.path)
}))

router.get('/calendar', wrap(async (req, res) => {
  const plantId = req.query.plant_id ? positiveId(req.query.plant_id) : null
  if (req.query.plant_id && !plantId) throw badRequest('花卉编号无效')
  const replacements = {}
  let sql = 'SELECT local_date AS day, COUNT(*) AS count FROM garden_entries'
  if (plantId) { sql += ' WHERE plant_id = :plantId'; replacements.plantId = plantId }
  sql += ' GROUP BY local_date ORDER BY local_date DESC'
  const rows = await sequelize.query(sql, { type: sequelize.QueryTypes.SELECT, replacements })
  res.json(rows)
}))
router.get('/calendar/day', wrap(async (req, res) => {
  if (!validDay(req.query.date)) throw badRequest('日历日期无效')
  res.json(await listDay(req.query.date, req.query))
}))
router.get('/export', wrap(async (_req, res) => {
  const archiver = require('archiver')
  const [species, plants, entries, photos] = await Promise.all([
    GardenSpecies.findAll({ raw: true }), GardenPlant.findAll({ raw: true }),
    GardenEntry.findAll({ raw: true }), GardenPhoto.findAll({ raw: true }),
  ])
  const manifest = {
    format: 'yl-garden-export-v1', exported_at: new Date().toISOString(),
    species, plants, entries, photos: photos.map(p => ({
      id: p.id, entry_id: p.entry_id, filename: p.original_name,
      archive_path: 'photos/' + p.id + '_' + p.storage_name, mime: p.mime,
    })),
  }
  noCache(res)
  res.attachment('yl-garden-' + new Date().toISOString().slice(0, 10) + '.zip')
  const archive = archiver('zip', { zlib: { level: 6 } })
  archive.on('error', err => { console.error('garden export:', err); res.destroy(err) })
  archive.pipe(res)
  archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' })
  for (const p of photos) {
    const location = photoLocation(p, 'original')
    if (fs.existsSync(location.path)) archive.file(location.path, { name: 'photos/' + p.id + '_' + p.storage_name })
  }
  await archive.finalize()
}))

router.use((err, _req, res, next) => {
  if (res.headersSent) return next(err)
  const code = err.status || (err.name === 'SequelizeUniqueConstraintError' ? 409 : 500)
  if (code >= 500) console.error('garden route:', err)
  res.status(code).json({ error: code >= 500 ? '花园暂时无法处理该操作' : err.message })
})

module.exports = router
