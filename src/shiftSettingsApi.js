async function requestSettings(options, url = '/api/settings/shifts', overrides = false) {
  const response = await fetch(url, options);
  let data;
  try { data = await response.json(); }
  catch { throw new Error('排班设置暂时无法访问，请稍后重试'); }
  if (!response.ok) {
    const error = new Error(data.error || '排班设置暂时无法访问，请稍后重试');
    error.status = response.status;
    throw error;
  }
  const validData = overrides ? data.overrides && typeof data.overrides === 'object' && !Array.isArray(data.overrides) : Array.isArray(data.rules) && data.rules.length;
  if (!validData || !Number.isInteger(data.version)) {
    throw new Error('暂时无法读取排班设置，请稍后重试');
  }
  return data;
}

export function loadShiftSettings(signal) {
  return requestSettings({ signal });
}

export function saveShiftSettings(rules, version) {
  return requestSettings({
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rules, version }),
  });
}

export function loadDayShifts(signal) {
  return requestSettings({ signal }, '/api/settings/shifts/overrides', true);
}
export function saveDayShift(date, override, version) {
  return requestSettings({ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ override, version }) }, `/api/settings/shifts/overrides/${encodeURIComponent(date)}`, true);
}
