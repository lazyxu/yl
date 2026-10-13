function invalid(message) { const error = new Error(message); error.status = 400; throw error; }
function normalizeDayOverride(date, value) {
  const parsed = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : null;
  if (!parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) invalid('请填写有效的调整日期');
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value) || !['standby', 'swap'].includes(value.kind)) invalid('请选择备班或换班');
  const note = value.note ?? '';
  if (typeof note !== 'string' || note.length > 500) invalid('备注不能超过 500 个字符');
  if (value.kind === 'standby') return { kind: 'standby', shift: '备班', partner: '', note: note.trim() };
  if (!['白班', '夜班', '休息'].includes(value.shift)) invalid('请选择换后的班次');
  if (typeof value.partner !== 'string' || !value.partner.trim() || value.partner.trim().length > 80) invalid('请填写换班对象，最多 80 个字符');
  return { kind: 'swap', shift: value.shift, partner: value.partner.trim(), note: note.trim() };
}
module.exports = { normalizeDayOverride };
