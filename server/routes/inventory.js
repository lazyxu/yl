'use strict'
const express = require('express')
const { listInventory } = require('../services/pindou-inventory')
const router = express.Router()

// Reads the materialized inventory projection. Historical reminders are
// replayed only on first upgrade, not on each page load.
router.get('/', async (_req, res) => {
  try {
    res.json(await listInventory())
  } catch (error) {
    console.error('Pindou inventory lookup failed', error)
    res.status(500).json({ error: '库存暂时无法读取，请稍后重试' })
  }
})
module.exports = router
