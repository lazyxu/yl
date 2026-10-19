'use strict'

const { Op } = require('sequelize')
const sequelize = require('../sequelize')
const Reminder = require('../models/PindouReminder')
const { PindouInventory, PindouInventoryMeta } = require('../models/PindouInventory')

let readyPromise = null

function contributions(record, direction = 1) {
  const items = typeof record.items === 'string' ? JSON.parse(record.items) : record.items
  if (!Array.isArray(items)) throw new Error('Historical pindou record has invalid items')
  const sign = record.operation === '补豆' ? 1 : record.operation === '消耗' ? -1 : null
  if (sign == null) throw new Error('Historical pindou record has invalid operation')
  const changes = new Map()
  for (const item of items) {
    const color = item?.color
    const number = Number(item?.count)
    if (typeof color !== 'string' || color.length < 1 || color.length > 60 ||
        !Number.isSafeInteger(number) || number <= 0) {
      throw new Error('Historical pindou record has an invalid color or count')
    }
    const next = (changes.get(color) || 0) + direction * sign * number
    if (!Number.isSafeInteger(next)) throw new Error('Pindou stock total exceeds safe integer range')
    changes.set(color, next)
  }
  return changes
}

function mergeChanges(target, source) {
  for (const [color, delta] of source) {
    const next = (target.get(color) || 0) + delta
    if (!Number.isSafeInteger(next)) throw new Error('Pindou stock total exceeds safe integer range')
    target.set(color, next)
  }
}

async function applyChanges(changes, transaction) {
  const rows = [...changes.entries()].filter(([, delta]) => delta !== 0)
    .sort(([a], [b]) => a.localeCompare(b))
  if (!rows.length) return
  const replacements = {}
  const placeholders = rows.map(([color, delta], index) => {
    replacements['color' + index] = color
    replacements['delta' + index] = delta
    return '(:color' + index + ', :delta' + index + ')'
  })
  // INSERT ... ON DUPLICATE KEY is atomic across concurrent requests.
  await sequelize.query(
    'INSERT INTO pindou_inventory (color, quantity) VALUES ' + placeholders.join(', ') +
    ' ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)',
    { replacements, transaction },
  )
}

async function initialize() {
  // Seed existing installations without overwriting their reminder history.
  // The state row also serializes concurrent initializers.
  await sequelize.query('INSERT IGNORE INTO pindou_inventory_meta (id, initialized) VALUES (1, 0)')
  await sequelize.transaction(async transaction => {
    const state = await PindouInventoryMeta.findByPk(1, {
      transaction, lock: transaction.LOCK.UPDATE,
    })
    if (state.initialized) return
    const total = new Map()
    let after = 0
    while (true) {
      const batch = await Reminder.findAll({
        attributes: ['id', 'operation', 'items'],
        where: { id: { [Op.gt]: after } }, order: [['id', 'ASC']],
        raw: true, limit: 500, transaction,
      })
      if (!batch.length) break
      for (const row of batch) mergeChanges(total, contributions(row))
      after = batch[batch.length - 1].id
      if (batch.length < 500) break
    }
    // Failure rolls back both projection and metadata.
    await PindouInventory.destroy({ where: {}, transaction })
    const values = [...total].map(([color, quantity]) => ({ color, quantity }))
    for (let offset = 0; offset < values.length; offset += 500) {
      await PindouInventory.bulkCreate(values.slice(offset, offset + 500), { transaction })
    }
    await state.update({ initialized: true }, { transaction })
  })
}

function ensureInventory() {
  if (!readyPromise) readyPromise = initialize().catch(error => { readyPromise = null; throw error })
  return readyPromise
}

async function listInventory() {
  await ensureInventory()
  const entries = await PindouInventory.findAll({
    attributes: ['color', 'quantity'], order: [['color', 'ASC']], raw: true,
  })
  return entries.map(record => {
    const count = Number(record.quantity)
    if (!Number.isSafeInteger(count)) throw new Error('Pindou stock count exceeds safe integer range')
    return { color: record.color, count }
  })
}

async function createReminder(data) {
  await ensureInventory()
  return sequelize.transaction(async transaction => {
    const record = await Reminder.create(data, { transaction })
    await applyChanges(contributions(record), transaction)
    return record
  })
}

async function updateReminder(id, data) {
  await ensureInventory()
  return sequelize.transaction(async transaction => {
    const record = await Reminder.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE })
    if (!record) return null
    const changes = contributions(record, -1)
    mergeChanges(changes, contributions(data))
    await record.update(data, { transaction })
    await applyChanges(changes, transaction)
    return record
  })
}

async function deleteReminder(id) {
  await ensureInventory()
  return sequelize.transaction(async transaction => {
    const record = await Reminder.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE })
    if (!record) return false
    const changes = contributions(record, -1)
    await record.destroy({ transaction })
    await applyChanges(changes, transaction)
    return true
  })
}

module.exports = {
  ensureInventory, listInventory, createReminder, updateReminder, deleteReminder,
  contributions, mergeChanges,
}
