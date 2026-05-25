import { useEffect, useState } from 'react'
import './PindouReminder.css'
import MARD from './colorPalettes/mard.json'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import { useTheme } from '@mui/material/styles'
import useMediaQuery from '@mui/material/useMediaQuery'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Stack from '@mui/material/Stack'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import InputLabel from '@mui/material/InputLabel'
import FormControl from '@mui/material/FormControl'
import Checkbox from '@mui/material/Checkbox'
import ListItemText from '@mui/material/ListItemText'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Autocomplete from '@mui/material/Autocomplete'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import DeleteIcon from '@mui/icons-material/Delete'
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'

// API base inlined as '/api'

function PindouReminder({ initialOperation, initialRows, onClose, onAdded }) {
  const [operation, setOperation] = useState('补豆')
  const [rows, setRows] = useState([{ color: '', count: '' }])
  const [bulkSelected, setBulkSelected] = useState([]) // will hold array of palette objects when using Autocomplete
  const [bulkCount, setBulkCount] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState('')
  const [timeOption, setTimeOption] = useState('now') // 'now' | 'custom'
  const [reminders, setReminders] = useState([])
  const [loading, setLoading] = useState(false)
  const [dragIndex, setDragIndex] = useState(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [confirmSummary, setConfirmSummary] = useState(null)
  const [notify, setNotify] = useState(null) // {type: 'success'|'error', msg}
  const [lastSync, setLastSync] = useState(null)
  const [filterColor, setFilterColor] = useState('')
  const [filterOp, setFilterOp] = useState('all')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  useEffect(() => {
    fetchReminders()
  }, [])

  const theme = useTheme()
  const isSmall = useMediaQuery(theme.breakpoints.down('sm'))

  function readableTextColor(hex){
    if(!hex) return '#000'
    const c = hex.replace('#','')
    const r = parseInt(c.substring(0,2),16)
    const g = parseInt(c.substring(2,4),16)
    const b = parseInt(c.substring(4,6),16)
    const yiq = (r*299 + g*587 + b*114) / 1000
    return yiq >= 128 ? '#000' : '#fff'
  }

  useEffect(() => {
    if (initialOperation) setOperation(initialOperation)
  }, [initialOperation])

  useEffect(() => {
    if (initialRows && Array.isArray(initialRows) && initialRows.length > 0) {
      // normalize counts to strings
      setRows(initialRows.map(r => ({ color: r.color, count: String(r.count) })))
    }
  }, [initialRows])

  async function fetchReminders() {
    try {
      setLoading(true)
      const res = await fetch('/api/reminders')
      const data = await res.json()
      setReminders(data)
      setLastSync(new Date())
      showNotify('同步成功', 'success')
    } catch (err) {
      console.error(err)
      showNotify('获取提醒失败：' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  function showNotify(msg, type = 'success', timeout = 4000) {
    setNotify({ msg, type })
    if (timeout) setTimeout(() => setNotify(null), timeout)
  }

  function updateRow(index, key, value) {
    setRows(prev => prev.map((r, i) => i === index ? { ...r, [key]: value } : r))
  }

  function addRow() {
    setRows(prev => [...prev, { color: '', count: '' }])
  }

  function applyBulkAdd() {
    const cnt = Number(bulkCount)
    if (!bulkSelected || bulkSelected.length === 0) return showNotify('请选择至少一个色号', 'error')
    if (!Number.isInteger(cnt) || cnt <= 0) return showNotify('数量需为大于 0 的整数', 'error')
    setRows(prev => {
      const existing = [...prev]
      for (const p of bulkSelected) {
        const color = p.code
        const idx = existing.findIndex(r => r.color === color)
        if (idx >= 0) {
          const prevCnt = Number(existing[idx].count) || 0
          existing[idx] = { ...existing[idx], count: String(prevCnt + cnt) }
        } else {
          existing.push({ color, count: String(cnt) })
        }
      }
      return existing
    })
    showNotify('已批量累加色号数量', 'success')
  }

  function duplicateRow(index) {
    setRows(prev => {
      const copy = { ...prev[index] }
      const arr = [...prev]
      arr.splice(index + 1, 0, copy)
      return arr
    })
  }

  function onDragStart(e, index) {
    setDragIndex(index)
    try { e.dataTransfer.effectAllowed = 'move' } catch (_) {}
  }

  function onDragOver(e) {
    e.preventDefault()
    try { e.dataTransfer.dropEffect = 'move' } catch (_) {}
  }

  function onDrop(e, index) {
    e.preventDefault()
    if (dragIndex === null) return
    setRows(prev => {
      const arr = [...prev]
      const [m] = arr.splice(dragIndex, 1)
      arr.splice(index, 0, m)
      return arr
    })
    setDragIndex(null)
  }

  function removeRow(index) {
    setRows(prev => prev.filter((_, i) => i !== index))
  }

  // Prepare: validate and show confirmation modal
  function prepareSubmit(e) {
    e.preventDefault()
    if (timeOption === 'custom' && !date) return alert('请选择时间')
    const items = rows.map(r => ({ color: r.color.trim(), count: Number(r.count) }))
    const invalid = items.some(it => !Number.isInteger(it.count) || it.count <= 0)
    if (invalid) return alert('请修正错误：每行数量必须为正整数')

    // aggregate totals per color
    const totals = {}
    for (const it of items) {
      if (!totals[it.color]) totals[it.color] = 0
      totals[it.color] += it.count
    }

    let occurred_at
    if (timeOption === 'now') occurred_at = new Date()
    else occurred_at = new Date(date)

    const summary = {
      operation,
      occurred_at: occurred_at.toISOString(),
      occurred_at_label: occurred_at.toLocaleString(),
      note,
      totals,
      items,
    }

    setConfirmSummary(summary)
    setShowConfirm(true)
  }

  // Confirmed: actually send payload
  async function confirmSubmit() {
    if (!confirmSummary) return
    const payload = {
      operation: confirmSummary.operation,
      items: confirmSummary.items,
      occurred_at: confirmSummary.occurred_at,
      note: confirmSummary.note,
    }
    try {
      setLoading(true)
      const res = await fetch('/api/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json()
        showNotify('添加失败：' + (err.error || res.statusText), 'error')
        return
      }
      const created = await res.json()
      // refresh list and update sync time
      await fetchReminders()
      setRows([{ color: '', count: '' }])
      setNote('')
      setDate('')
      setShowConfirm(false)
      setConfirmSummary(null)
      showNotify('添加成功', 'success')
      // 如果在 modal 中打开，调用 onClose
      if (typeof onClose === 'function') {
        try { onClose() } catch(_) {}
      }
      // 通知父组件已添加，用于刷新库存
      if (typeof onAdded === 'function') {
        try { onAdded() } catch(_) {}
      }
    } catch (err) {
      console.error(err)
      showNotify('添加失败：' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  async function removeReminder(id) {
    if (!confirm('确认删除？')) return
    try {
      const res = await fetch(`/api/reminders/${id}`, { method: 'DELETE' })
      if (!res.ok) return alert('删除失败')
      setReminders(prev => prev.filter(r => String(r.id) !== String(id)))
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="pindou-root">
      <Box sx={{display:'flex',alignItems:'center',justifyContent:'space-between',mb:1}}>
        <Typography component="h1" sx={{fontSize:{xs:'1.1rem',sm:'1.25rem',md:'1.5rem'},lineHeight:1.2,fontWeight:700}}>拼豆补豆提醒</Typography>
      </Box>

      <Box component="form" className="pindou-form" onSubmit={prepareSubmit} sx={{
        '& .MuiInputBase-root': { fontSize: { xs: '16px', sm: '14px' }, lineHeight: 1.6 },
        '& .MuiTypography-root': { fontSize: { xs: '15px', sm: '14px' } },
        px: { xs: 0, sm: 1 }
      }}>
        {notify && (
          <div className={`notify ${notify.type}`} role="status">{notify.msg}</div>
        )}
        <Box sx={{display:'flex',flexDirection:{xs:'column',sm:'row'},alignItems:'center',gap:1,mb:2}}>
          <Box component="span" sx={{minWidth:60}}>操作：</Box>
          <Box sx={{display:'flex',gap:2,alignItems:'center'}}>
            <label style={{display:'flex',alignItems:'center',gap:6}}><input type="radio" name="op" value="补豆" checked={operation==='补豆'} onChange={()=>setOperation('补豆')} /> 补豆</label>
            <label style={{display:'flex',alignItems:'center',gap:6}}><input type="radio" name="op" value="消耗" checked={operation==='消耗'} onChange={()=>setOperation('消耗')} /> 消耗</label>
          </Box>
        </Box>

        {/* 批量操作区 */}
        <Box sx={{display:'flex',gap:2,alignItems:'center',mb:2,flexWrap:'wrap'}}>
          <Autocomplete
            multiple
            disableCloseOnSelect
            options={MARD}
            getOptionLabel={(option) => `${option.code} — ${option.name}`}
            isOptionEqualToValue={(option, value) => option.code === value.code}
            value={bulkSelected}
            onChange={(e, newValue) => setBulkSelected(newValue)}
            renderOption={(props, option, { selected }) => (
              <li {...props}>
                <Checkbox style={{ marginRight: 8 }} checked={selected} />
                <Box sx={{width:28,height:18,background:option.hex||'#fff',border: '1px solid #ddd',mr:1,display:'inline-block',verticalAlign:'middle'}} />
                <Box component="span" sx={{mr:1}}>{option.code}</Box>
                <Box component="span" sx={{color:'#666',fontSize:13}}>{option.name || ''} {option.hex ? ` ${option.hex}` : ''}</Box>
              </li>
            )}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => (
                <Chip
                  label={`${option.code} ${option.hex || ''}`}
                  size="small"
                  key={option.code}
                  sx={{ mr: 0.5, height:28 }}
                  icon={<Box sx={{width:18,height:12,background:option.hex||'#fff',border: '1px solid #ddd',borderRadius:1}} />}
                  {...getTagProps({ index })}
                />
              ))
            }
            renderInput={(params) => (
              <TextField {...params} size="small" label="批量选择色号" placeholder="搜索色号或名称" sx={{minWidth:240}} />
            )}
            sx={{minWidth:260}}
          />
          <TextField label="数量" size="small" value={bulkCount} onChange={e=>setBulkCount(e.target.value)} sx={{width:120,'& .MuiInputBase-root':{minHeight:44}}} />
          <Button variant="outlined" onClick={applyBulkAdd} sx={{minHeight:44}}>批量添加</Button>
        </Box>

            <div className="items-editor">
              {rows.map((r, i) => {
                const countVal = r.count
                const countNum = Number(countVal)
                const countInvalid = !(Number.isInteger(countNum) && countNum > 0)
                return (
                  <div key={i} className="item-row" draggable onDragStart={e=>onDragStart(e,i)} onDragOver={onDragOver} onDrop={e=>onDrop(e,i)}>
                        <Box sx={{display:'flex',flexDirection:{xs:'column',sm:'row'},alignItems:'center',gap:1,width:'100%'}}>
                          <IconButton title="拖拽排序" draggable onDragStart={e=>onDragStart(e,i)} onDragOver={onDragOver} onDrop={e=>onDrop(e,i)}>
                            <DragIndicatorIcon />
                          </IconButton>

                          <Autocomplete
                            options={MARD}
                            getOptionLabel={(opt) => `${opt.code} — ${opt.name}`}
                            isOptionEqualToValue={(opt, val) => opt.code === val.code}
                            value={MARD.find(x => x.code === r.color) || null}
                            onChange={(e, val) => updateRow(i, 'color', val ? val.code : '')}
                            renderOption={(props, option) => (
                              <li {...props}>
                                <Box sx={{width:36,height:24,background:option.hex||'#fff',border: '1px solid #ddd',mr:1,display:'inline-block'}} />
                                  <Box component="span" sx={{fontWeight:600,mr:0.5}}>{option.code}</Box>
                                  <Box component="span" sx={{color:'#666',fontSize:13}}>{option.name || ''} {option.hex ? ` ${option.hex}` : ''}</Box>
                              </li>
                            )}
                            renderInput={(params) => (
                              <TextField
                                {...params}
                                label="色号"
                                placeholder="搜索或选择色号"
                                size="medium"
                                fullWidth
                                sx={{'& .MuiInputBase-root':{minHeight:44}}}
                              />
                            )}
                            fullWidth
                            sx={{width:{xs:'100%', sm:180}}}
                          />
                          <Box sx={{display:'flex',flexDirection:'column',alignItems:'center',mt:{xs:1, sm:0}}}>
                            <Box sx={{width:44,height:30,background:(MARD.find(x => x.code === r.color)||{}).hex||'transparent',border: (r.color?'1px solid #ddd':'1px dashed #ccc'),borderRadius:2}} title={r.color||'未选择'} />
                            <Box component="span" sx={{fontSize:11,color:'#444',mt:0.5}}>{r.color || ''} {(MARD.find(x => x.code === r.color)||{}).hex || ''}</Box>
                          </Box>

                          <TextField size="small" sx={{width:{xs:'100%', sm:100}}} label="数量" type="number" value={r.count} onChange={e => updateRow(i, 'count', e.target.value)} error={countInvalid} helperText={countInvalid? '数量需为大于 0 的整数' : ''} />

                          <Box sx={{display:'flex',gap:1,mt:{xs:1, sm:0}}}>
                            <IconButton title="复制此行" onClick={() => duplicateRow(i)}><ContentCopyIcon /></IconButton>
                            <IconButton title="删除" onClick={() => removeRow(i)} disabled={rows.length === 1}><DeleteIcon /></IconButton>
                          </Box>
                        </Box>
                  </div>
                )
              })}
              <Button type="button" variant="outlined" onClick={addRow} sx={{mt:1,width:'100%',minHeight:44}}>＋ 添加色号</Button>
            </div>

        <div className="time-row">
          <label>时间：</label>
          <div className="time-options">
            <button type="button" className={timeOption==='now' ? 'active' : ''} onClick={()=>{setTimeOption('now'); setDate('')}}>现在</button>
            <button type="button" className={timeOption==='custom' ? 'active' : ''} onClick={()=>setTimeOption('custom')}>自定义</button>
          </div>
          {timeOption === 'custom' && (
            <TextField
              type="datetime-local"
              value={date}
              onChange={e => setDate(e.target.value)}
              required
              InputLabelProps={{ shrink: true }}
              size="small"
            />
          )}
        </div>
        <TextField placeholder="备注（可选）" value={note} onChange={e => setNote(e.target.value)} fullWidth size="medium" sx={{mt:1,'& .MuiInputBase-root':{minHeight:44}}} />
        <Button type="submit" variant="contained" sx={{mt:1,width:'100%',minHeight:44}}>添加提醒</Button>
      </Box>
      {/* 确认弹窗：小屏使用 fullScreen（避免键盘/滚动问题），大屏保持小窗 */}
      <Dialog open={showConfirm} onClose={() => { setShowConfirm(false); setConfirmSummary(null) }} maxWidth="sm" fullWidth fullScreen={isSmall}>
          <DialogTitle>确认提交</DialogTitle>
        <DialogContent>
          <div>操作：{confirmSummary?.operation}</div>
          <div>时间：{confirmSummary?.occurred_at_label}</div>
          {confirmSummary?.note && <div>备注：{confirmSummary.note}</div>}
          <div style={{marginTop:8}}>
            <strong>汇总：</strong>
            <ul>
              {confirmSummary && Object.keys(confirmSummary.totals).map(code => {
                const p = MARD.find(x => x.code === code)
                const name = p ? ` ${p.name}` : ''
                const hex = p ? ` ${p.hex || ''}` : ''
                return <li key={code}>{code}{name}{hex} — {confirmSummary.totals[code]} 颗</li>
              })}
            </ul>
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setShowConfirm(false); setConfirmSummary(null) }}>编辑</Button>
          <Button onClick={confirmSubmit} variant="contained">确定提交</Button>
        </DialogActions>
      </Dialog>

      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:12}}>
        <div style={{fontSize:12,color:'#666'}}>最近一次同步：{lastSync ? lastSync.toLocaleString() : '—'}</div>
        <div>
          <button onClick={fetchReminders} style={{padding:'6px 10px',borderRadius:4}}>手动同步</button>
        </div>
      </div>
      {/* filters */}
      <div className="filters" style={{display:'flex',gap:8,alignItems:'center',marginTop:12,flexWrap:'wrap'}}>
        <input placeholder="按色号搜索（例如 A7）" value={filterColor} onChange={e=>setFilterColor(e.target.value)} style={{padding:6,borderRadius:4,border:'1px solid #ddd'}} />
        <FormControl size="small" sx={{minWidth:120}}>
          <Select value={filterOp} onChange={e=>setFilterOp(e.target.value)}>
            <MenuItem value="all">全部操作</MenuItem>
            <MenuItem value="补豆">补豆</MenuItem>
            <MenuItem value="消耗">消耗</MenuItem>
          </Select>
        </FormControl>
        <label style={{fontSize:12,color:'#666'}}>从</label>
        <input type="date" value={filterFrom} onChange={e=>setFilterFrom(e.target.value)} />
        <label style={{fontSize:12,color:'#666'}}>到</label>
        <input type="date" value={filterTo} onChange={e=>setFilterTo(e.target.value)} />
        <button onClick={()=>{setFilterColor('');setFilterOp('all');setFilterFrom('');setFilterTo('')}} style={{padding:6}}>清除</button>
      </div>

      <div style={{marginTop:12}}>
        {loading && <div className="empty">加载中...</div>}
        {!loading && reminders.length === 0 && <div className="empty">暂无提醒</div>}

        {/* grouping by date */}
        {(() => {
          // apply filters client-side
          const filtered = reminders.filter(r => {
            if (filterOp !== 'all' && r.operation !== filterOp) return false
            if (filterColor) {
              const q = filterColor.trim().toLowerCase()
              const found = (r.items || []).some(it => (it.color || '').toLowerCase().includes(q))
              if (!found) return false
            }
            if (filterFrom) {
              const from = new Date(filterFrom)
              if (new Date(r.occurred_at) < from) return false
            }
            if (filterTo) {
              const to = new Date(filterTo)
              // include whole day
              to.setHours(23,59,59,999)
              if (new Date(r.occurred_at) > to) return false
            }
            return true
          })

          // group by date string
          const groups = {}
          for (const it of filtered) {
            const d = new Date(it.occurred_at)
            const key = d.toLocaleDateString()
            if (!groups[key]) groups[key] = []
            groups[key].push(it)
          }

          const keys = Object.keys(groups).sort((a,b)=> new Date(b) - new Date(a))
          return keys.map(k => (
            <div key={k} className="group">
              <div className="group-title">{k}</div>
              <ul className="pindou-list">
                {groups[k].map(item => (
                  <li key={item.id} className="pindou-item">
                    <div className="pindou-item-main">
                      <div style={{display:'flex',flexDirection:'column'}}>
                        <div className="pindou-note">{item.operation} · {new Date(item.occurred_at).toLocaleTimeString()}</div>
                        <div className="pindou-date">{item.note}</div>
                      </div>
                      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                        {(item.items || []).map((it, idx) => {
                          const p = MARD.find(x => x.code === it.color)
                          const hex = p ? p.hex : '#fff'
                          return (
                            <div key={idx} className="chip">
                              <div className="chip-color" style={{background:hex}} />
                              <div className="chip-label">{it.color} {it.count}颗</div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                    <div className="pindou-item-actions">
                      <button onClick={() => removeReminder(item.id)}>删除</button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))
        })()}
      </div>
    </div>
  )
}

export default PindouReminder
