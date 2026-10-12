async function requestSettings(options) {
  const response = await fetch('/api/settings/shifts', options);
  let data;
  try { data = await response.json(); }
  catch { throw new Error('排班设置暂时无法访问，请稍后重试'); }
  if (!response.ok) {
    const error = new Error(data.error || '排班设置暂时无法访问，请稍后重试');
    error.status = response.status;
    throw error;
  }
  if (!Array.isArray(data.rules) || !data.rules.length || !Number.isInteger(data.version)) {
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
