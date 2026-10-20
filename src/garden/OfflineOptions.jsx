import React, { useEffect, useState } from 'react'
import { Alert, Box, Button, FormControlLabel, Switch, Typography } from '@mui/material'
import { clearGardenOffline, estimateOfflineStorage, gardenOfflineEnabled,
  saveGardenIndex, setGardenOfflineEnabled } from '../offline/data'

export default function OfflineOptions({ items, total, species, query, notify }) {
  const [enabled, setEnabled] = useState(gardenOfflineEnabled)
  const [working, setWorking] = useState(false)
  const [usage, setUsage] = useState(null)
  useEffect(() => {
    estimateOfflineStorage().then(setUsage)
  }, [enabled])
  async function toggle(checked) {
    if (working) return
    setWorking(true)
    try {
      const ok = await setGardenOfflineEnabled(checked)
      if (!ok) { notify('此浏览器没有可用的离线存储，未开启缓存', true); return }
      setEnabled(checked)
      if (checked && !query && items.length) {
        await saveGardenIndex({ items, total, species })
      }
      notify(checked ? '已开启花园离线浏览，只保存已访问内容' : '已清除花园离线数据')
      setUsage(await estimateOfflineStorage())
    } catch (error) { notify(error.message || '离线设置失败', true) }
    finally { setWorking(false) }
  }
  async function clear() {
    if (working) return
    setWorking(true)
    try {
      await clearGardenOffline()
      setEnabled(false)
      setUsage(await estimateOfflineStorage())
      notify('花园本地离线数据已清除')
    } catch (error) { notify(error.message || '清理失败', true) }
    finally { setWorking(false) }
  }
  return <details className="garden-offline-options">
    <summary>离线浏览设置</summary>
    <Box sx={{ py: 1.5 }}>
      <FormControlLabel label="将已浏览的花园内容保存在此设备"
        control={<Switch checked={enabled} disabled={working} onChange={(_, checked) => toggle(checked)}
          inputProps={{ 'aria-label': '开启花园离线浏览' }}/>} />
      <Typography color="text.secondary" fontSize={13}>
        仅限只读：最多 200 株花卉摘要、30 个已浏览详情、每株 100 条成长日记，以及
        最多 60 张、总计 12 MiB 缩略图；不保存原图、不允许离线修改。
        此处清除的是花园专用离线数据，浏览器普通 HTTP 图片缓存仍由 Safari 自行管理。
      </Typography>
      <Alert severity="warning" sx={{ my: 1 }}>
        本地离线内容可能被使用此设备的其他人查看；请只在个人设备上开启。清除浏览器数据也可能清除快照。
      </Alert>
      {usage && <Typography fontSize={12} color="text.secondary" mb={1}>
        浏览器报告的本站点总存储约 {(usage.totalUsage / 1048576).toFixed(1)} MiB
        （包含浏览器管理的其他站点数据类别；并非花园独占额度）。
      </Typography>}
      <Button size="small" variant="outlined" disabled={working || !enabled}
        onClick={clear}>清除花园离线数据</Button>
    </Box>
  </details>
}
