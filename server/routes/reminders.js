const express = require('express');
const router = express.Router();
const PindouReminder = require('../models/PindouReminder');
const { createReminder, updateReminder, deleteReminder } = require('../services/pindou-inventory');

function validateBody(body) {
  const { operation, items, occurred_at } = body || {};
  if (!operation || (operation !== '补豆' && operation !== '消耗')) return 'operation must be 补豆 or 消耗';
  if (!Array.isArray(items) || items.length === 0) return 'items must be non-empty array';
  for (const it of items) {
    if (typeof it?.color !== 'string' || !it.color || it.color.length > 60 || !it.count) return 'each item must have a valid color and count';
    if (!Number.isSafeInteger(Number(it.count)) || Number(it.count) <= 0) return 'count must be positive safe integer';
  }
  if (!occurred_at || isNaN(new Date(occurred_at).getTime())) return 'occurred_at must be valid date';
  return null;
}

router.get('/', async (req, res) => {
  try {
    const items = await PindouReminder.findAll({ order: [['occurred_at', 'DESC']], limit: 200 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const errMsg = validateBody(req.body);
    if (errMsg) return res.status(400).json({ error: errMsg });

    const { operation, items, occurred_at, note, image_path } = req.body;
    const rec = await createReminder({ operation, items, occurred_at, note, image_path });
    // ensure we send plain JSON (Sequelize instances implement toJSON)
    res.status(201).json(rec && typeof rec.toJSON === 'function' ? rec.toJSON() : rec);
  } catch (err) {
    console.error('Error in POST /api/reminders', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const deleted = await deleteReminder(id);
    if (!deleted) return res.status(404).json({ error: 'not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const errMsg = validateBody(req.body);
    if (errMsg) return res.status(400).json({ error: errMsg });

    const { operation, items, occurred_at, note, image_path } = req.body;
    const rec = await updateReminder(id, { operation, items, occurred_at, note, image_path });
    if (!rec) return res.status(404).json({ error: 'not found' });
    res.json(rec && typeof rec.toJSON === 'function' ? rec.toJSON() : rec);
  } catch (err) {
    console.error('Error in PUT /api/reminders/:id', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
