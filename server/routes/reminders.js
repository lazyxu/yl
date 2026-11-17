const express = require('express');
const router = express.Router();
const PindouReminder = require('../models/PindouReminder');
const sequelize = require('../sequelize');
const { QueryTypes } = require('sequelize');
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

// The list intentionally retains its legacy 200-row response. Totals must
// instead include every ledger row, even when users have much older history.
router.get('/summary', async (_req, res) => {
  try {
    const rows = await sequelize.query(
      "SELECT r.operation, COALESCE(SUM(j.quantity), 0) AS total " +
      "FROM pindou_reminders AS r " +
      "JOIN JSON_TABLE(r.items, '$[*]' COLUMNS(quantity DECIMAL(30, 0) PATH '$.count')) AS j " +
      "GROUP BY r.operation",
      { type: QueryTypes.SELECT },
    );
    const totals = { added: 0, consumed: 0 };
    for (const row of rows) {
      const amount = Number(row.total);
      if (!Number.isSafeInteger(amount) || amount < 0) {
        return res.status(500).json({ error: 'history total exceeds supported range' });
      }
      if (row.operation === '补豆') totals.added = amount;
      if (row.operation === '消耗') totals.consumed = amount;
    }
    res.json(totals);
  } catch (err) {
    console.error('Error in GET /api/reminders/summary', err);
    res.status(500).json({ error: 'unable to summarize history' });
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
