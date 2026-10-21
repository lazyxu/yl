import React, { useState } from 'react'
import { Box, Button, FormControlLabel, Switch } from '@mui/material'
import { clearGardenOffline, gardenOfflineEnabled, saveGardenIndex,
  setGardenOfflineEnabled } from '../offline/data'

// Offline browsing is on by default. Keep a compact control for users who
// want to disable local retention or clear data on a shared device.
export default function OfflineOptions({ items, total, species, query, notify }) {
  const [enabled, setEnabled] = useState(gardenOfflineEnabled)
  const [working, setWorking] = useState(false)

  async function toggle(checked) {
    if (working) return
    // Reflect the tap immediately. Clearing IndexedDB/Cache Storage may be
    // asynchronous, especially on iOS; roll back if updating the preference
    // fails instead of leaving the switch visibly on during deletion.
    setEnabled(checked)
    setWorking(true)
    try {
      const ok = await setGardenOfflineEnabled(checked)
      if (!ok) {
        setEnabled(!checked)
        notify('此浏览器无法保存离线数据', true)
        return
      }
      if (checked && !query && items.length) {
        await saveGardenIndex({ items, total, species })
      }
      notify(checked ? '已开启离线缓存' : '已关闭并清除花园离线缓存')
    } catch (error) {
      setEnabled(!checked)
      notify(error.message || '离线设置失败', true)
    } finally { setWorking(false) }
  }

  async function clear() {
    if (working) return
    setWorking(true)
    try {
      await clearGardenOffline()
      setEnabled(false)
      notify('已清除并关闭花园离线缓存')
    } catch (error) { notify(error.message || '清理失败', true) }
    finally { setWorking(false) }
  }

  return <details className="garden-offline-options">
    <summary>离线缓存</summary>
    <Box sx={{ py: 1, display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
      <FormControlLabel label="保存已浏览内容"
        control={<Switch checked={enabled} disabled={working} onChange={(_, checked) => toggle(checked)}
          inputProps={{ 'aria-label': '开启花园离线浏览' }}/>} />
      <Button size="small" variant="outlined" disabled={working || !enabled}
        onClick={clear}>清除离线数据</Button>
    </Box>
  </details>
}
