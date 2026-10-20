
import React, { useEffect, useRef, useState } from 'react'
import { Button, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from '@mui/material'
import { gardenRequest, gardenJSON, localInputTime } from '../gardenApi'
import GardenFormDialog from './GardenFormDialog'

const EMPTY_PLANT = { name: '', species_id: 0, planted_on: '', location: '', notes: '', status: 'active' }

export default function PlantEditor({ open, plant, species, onClose, onSaved, onSpecies, notify }) {
  const [form, setForm] = useState(EMPTY_PLANT)
  const [speciesName, setSpeciesName] = useState('')
  const [saving, setSaving] = useState(false)
  const busy = useRef(false)
  const speciesBusy = useRef(false)
  const [dirty, setDirty] = useState(false)
  const plantId = plant?.id
  useEffect(() => {
    if (!open) return
    setForm(plant ? {
      name: plant.name, species_id: plant.species_id || 0, planted_on: plant.planted_on || '',
      location: plant.location || '', notes: plant.notes || '', status: plant.status,
    } : { ...EMPTY_PLANT, planted_on: localInputTime().slice(0, 10) })
    setSpeciesName('')
    setDirty(false)
  }, [open, plantId])
  const change = (key, value) => {
    setDirty(true)
    setForm(prev => ({ ...prev, [key]: value }))
  }
  async function addSpecies() {
    if (!speciesName.trim() || speciesBusy.current) return
    speciesBusy.current = true
    try {
      const created = await gardenRequest('/species', gardenJSON({ name: speciesName.trim() }))
      change('species_id', created.id)
      onSpecies()
      setSpeciesName('')
      notify('已添加品种')
    } catch (err) { notify(err.message, true) }
    finally { speciesBusy.current = false }
  }
  async function save() {
    if (busy.current) return
    if (!form.name.trim()) return notify('请填写花卉名称', true)
    busy.current = true
    setSaving(true)
    try {
      await gardenRequest(plant ? '/plants/' + plant.id : '/plants', gardenJSON(form, plant ? 'PATCH' : 'POST'))
      setDirty(false)
      onSaved(); onClose()
      notify(plant ? '档案已更新' : '新花卉已加入花园')
    } catch (err) { notify(err.message, true) }
    finally { busy.current = false; setSaving(false) }
  }
  return <GardenFormDialog open={open} title={plant ? '编辑花卉档案' : '添加花卉'}
    dirty={dirty} busy={saving} onClose={onClose} onSave={save}>
    <Stack spacing={2.2}>
      <TextField required label="给这株花起个名字" placeholder="例如：窗边的月季"
        value={form.name} onChange={e => change('name', e.target.value)} inputProps={{ maxLength: 100 }} />
      <FormControl>
        <InputLabel>花卉品种</InputLabel>
        <Select label="花卉品种" value={form.species_id}
          onChange={e => change('species_id', e.target.value)}>
          <MenuItem value={0}>未分类</MenuItem>
          {species.map(item => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}
        </Select>
      </FormControl>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <TextField fullWidth label="添加新品种" value={speciesName}
          onChange={e => { setSpeciesName(e.target.value); setDirty(true) }} />
        <Button variant="outlined" disabled={!speciesName.trim() || saving} onClick={addSpecies}
          sx={{ flexShrink: 0 }}>添加品种</Button>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ mt: '-12px !important' }}>
        新品种会立即保存；即使取消当前花卉编辑，也不会自动删除该品种。
      </Typography>
      <TextField type="date" label="种植日期" value={form.planted_on || ''}
        onChange={e => change('planted_on', e.target.value)} InputLabelProps={{ shrink: true }}/>
      <TextField label="种植位置" placeholder="阳台 / 院子 / 客厅"
        value={form.location} onChange={e => change('location', e.target.value)}/>
      <TextField label="花卉备注" multiline minRows={3}
        value={form.notes} onChange={e => change('notes', e.target.value)}/>
    </Stack>
  </GardenFormDialog>
}
