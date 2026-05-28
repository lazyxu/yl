const express = require('express');
const router = express.Router();
const PindouReminder = require('../models/PindouReminder');

// Aggregate inventory by color: 补豆 adds, 消耗 subtracts
router.get('/', async (req, res) => {
  try {
    const records = await PindouReminder.findAll();
    const map = {};
    for (const r of records) {
      const op = r.operation;
      const items = r.items || [];
      for (const it of items) {
        const code = it.color;
        const cnt = Number(it.count) || 0;
        if (!map[code]) map[code] = 0;
        if (op === '补豆') map[code] += cnt;
        else if (op === '消耗') map[code] -= cnt;
      }
    }
    const result = Object.keys(map).map(code => ({ color: code, count: map[code] }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
