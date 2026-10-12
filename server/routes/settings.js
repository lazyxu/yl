const express = require('express');
const sequelize = require('../sequelize');
const AppSetting = require('../models/AppSetting');
const { normalizeShiftRules, defaultRules } = require('../services/shift-settings');
const router = express.Router();
router.use(express.json({ limit: '1mb' }));
const settingKey = 'shift-rules';

async function initializeShiftSettings() {
  const [setting] = await AppSetting.findOrCreate({
    where: { key: settingKey },
    defaults: { value: defaultRules, version: 0 },
  });
  return setting;
}

function response(setting) {
  return { rules: setting.value, version: setting.version };
}

function reportError(res, error) {
  if (error.status) return res.status(error.status).json({ error: error.message });
  console.error('Shift settings request failed', error);
  return res.status(500).json({ error: '排班设置暂时无法访问，请稍后重试' });
}

router.get('/', async (req, res) => {
  try { res.json(response(await initializeShiftSettings())); }
  catch (error) { reportError(res, error); }
});

router.put('/', async (req, res) => {
  try {
    const rules = normalizeShiftRules(req.body?.rules);
    const version = req.body?.version;
    if (!Number.isInteger(version) || version < 0) {
      return res.status(400).json({ error: '请重新加载排班设置后再保存' });
    }
    await initializeShiftSettings();
    const saved = await sequelize.transaction(async transaction => {
      const setting = await AppSetting.findByPk(settingKey, { transaction, lock: transaction.LOCK.UPDATE });
      if (setting.version !== version) {
        const error = new Error('排班设置已在其他位置更新，请重新加载后再修改');
        error.status = 409;
        throw error;
      }
      setting.value = rules;
      setting.version += 1;
      await setting.save({ transaction });
      return response(setting);
    });
    res.json(saved);
  } catch (error) { reportError(res, error); }
});

router.initializeShiftSettings = initializeShiftSettings;
module.exports = router;
