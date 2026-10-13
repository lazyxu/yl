const express = require('express');
const sequelize = require('../sequelize');
const AppSetting = require('../models/AppSetting');
const { normalizeDayOverride } = require('../services/day-shifts');
const router = express.Router();
router.use(express.json({ limit: '16kb' }));
const key = 'shift-day-overrides';
async function initialize() {
  const [setting] = await AppSetting.findOrCreate({ where: { key }, defaults: { value: {}, version: 0 } });
  return setting;
}
function response(setting) { return { overrides: setting.value, version: setting.version }; }
function report(res, error) {
  if (error.status) return res.status(error.status).json({ error: error.message });
  console.error('Day shift request failed', error);
  res.status(500).json({ error: '单日排班暂时无法访问，请稍后重试' });
}
router.get('/', async (req, res) => {
  try { res.json(response(await initialize())); }
  catch (error) { report(res, error); }
});
router.put('/:date', async (req, res) => {
  try {
    const override = normalizeDayOverride(req.params.date, req.body?.override);
    const version = req.body?.version;
    if (!Number.isInteger(version) || version < 0) return res.status(400).json({ error: '请重新加载单日排班后再确认' });
    await initialize();
    const saved = await sequelize.transaction(async transaction => {
      const setting = await AppSetting.findByPk(key, { transaction, lock: transaction.LOCK.UPDATE });
      if (setting.version !== version) { const error = new Error('单日排班已在其他位置更新，请重新加载后再修改'); error.status = 409; throw error; }
      const overrides = { ...setting.value };
      if (override === null) delete overrides[req.params.date];
      else overrides[req.params.date] = override;
      setting.value = overrides; setting.version += 1;
      await setting.save({ transaction });
      return response(setting);
    });
    res.json(saved);
  } catch (error) { report(res, error); }
});
module.exports = router;
