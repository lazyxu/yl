import React, { useEffect, useState } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Select, Stack, TextField } from '@mui/material'
import { gardenRequest, gardenJSON, localInputTime } from '../gardenApi'


const EMPTY_PLANT = { name: '', species_id: 0, planted_on: '', location: '', notes: '', status: 'active' }

export default function PlantEditor({ open, plant, species, onClose, onSaved, onSpecies, notify }) {
  const [form, setForm] = useState(EMPTY_PLANT)
  const [speciesName, setSpeciesName] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    setForm(plant ? {
      name: plant.name, species_id: plant.species_id || 0, planted_on: plant.planted_on || '',
      location: plant.location || '', notes: plant.notes || '', status: plant.status,
    } : { ...EMPTY_PLANT, planted_on: localInputTime().slice(0, 10) })
    setSpeciesName('')
  }, [open, plant])
  const change = (key, value) => setForm(prev => ({ ...prev, [key]: value }))
  async function addSpecies() {
    if (!speciesName.trim()) return
    try {
      const created = await gardenRequest('/species', gardenJSON({ name: speciesName.trim() }))
      change('species_id', created.id)
      onSpecies()
      setSpeciesName('')
      notify('已添加品种')
    } catch (err) { notify(err.message, true) }
  }
  async function save() {
    if (!form.name.trim()) return notify('请填写花卉名称', true)
    setSaving(true)
    try {
      await gardenRequest(plant ? '/plants/' + plant.id : '/plants', gardenJSON(form, plant ? 'PATCH' : 'POST'))
      onSaved(); onClose()
      notify(plant ? '档案已更新' : '新花卉已加入花园')
    } catch (err) { notify(err.message, true) }
    finally { setSaving(false) }
  }
  return <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="sm">
    <DialogTitle sx={{ fontWeight: 750 }}>{plant ? '编辑花卉档案' : '种下一株新花'}</DialogTitle>
    <DialogContent><Stack spacing={2.1} sx={{ pt: 1 }}>
      <TextField autoFocus required label="给这株花起个名字" placeholder="例如：窗边的月季" value={form.name} onChange={e => change('name', e.target.value)} />
      <FormControl><InputLabel>花卉品种</InputLabel><Select label="花卉品种" value={form.species_id} onChange={e => change('species_id', e.target.value)}>
        <MenuItem value={0}>未分类</MenuItem>{species.map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
      </Select></FormControl>
      <Stack direction="row" spacing={1}><TextField fullWidth size="small" label="添加新品种" value={speciesName} onChange={e => setSpeciesName(e.target.value)} /><Button variant="outlined" onClick={addSpecies} disabled={!speciesName.trim()}>添加</Button></Stack>
      <TextField type="date" label="种植日期" value={form.planted_on || ''} onChange={e => change('planted_on', e.target.value)} InputLabelProps={{ shrink: true }} />
      <TextField label="种植位置" placeholder="阳台 / 院子 / 客厅" value={form.location} onChange={e => change('location', e.target.value)} />
      <TextField label="花卉备注" multiline minRows={3} value={form.notes} onChange={e => change('notes', e.target.value)} />
    </Stack></DialogContent>
    <DialogActions sx={{ p: 2.5 }}><Button onClick={onClose} disabled={saving}>取消</Button><Button variant="contained" disabled={saving} onClick={save}>保存</Button></DialogActions>
  </Dialog>
}
