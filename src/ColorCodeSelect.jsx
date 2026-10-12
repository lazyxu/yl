import React from 'react'
import Autocomplete from '@mui/material/Autocomplete'
import TextField from '@mui/material/TextField'
import Chip from '@mui/material/Chip'
import ColorSwatch from './ColorSwatch'
import MARD from './colorPalettes/mard.json'

const ALL_KEY = '__ALL__'

function findPalette(code){
  return MARD.find(p => p.code === code)
}

export default function ColorCodeSelect({ options = [], value = [], disabled = false, onChange = ()=>{}, label = '选择色号', placeholder = '搜索或选择', sx = {} }){
  const allOptions = React.useMemo(() => [ALL_KEY, ...options], [options])

  function handleChange(e, v, reason){
    if (Array.isArray(v) && v.includes(ALL_KEY)){
      const selectedWithoutAll = v.filter(x => x !== ALL_KEY)
      // if already all real options selected, then clear selection
      if (selectedWithoutAll.length === options.length){
        onChange(e, [])
      }else{
        onChange(e, options.slice())
      }
      return
    }
    onChange(e, v)
  }

  return (
    <Autocomplete
      multiple
      disabled={disabled}
      size='small'
      options={allOptions}
      value={value}
      onChange={handleChange}
      disableCloseOnSelect
      getOptionLabel={code => code === ALL_KEY ? '全选' : code}
      renderOption={(props, code) => {
        if (code === ALL_KEY) return <li {...props}><span style={{ marginLeft: 8 }}>全选</span></li>
        const p = findPalette(code)
        return (
          <li {...props}>
            <ColorSwatch code={code} hex={p?.hex} size="sm" />
            <span style={{ marginLeft: 8 }}>{code}</span>
          </li>
        )
      }}
      renderTags={(value, getTagProps) =>
        value.map((code, index) => {
          const tagProps = getTagProps({ index }) || {}
          const { key: _key, ...rest } = tagProps
          const labelText = code === ALL_KEY ? '全选' : code
          const chipKey = code === ALL_KEY ? 'all' : code
          return <Chip key={chipKey} size="small" label={labelText} {...rest} />
        })
      }
      renderInput={(params) => <TextField {...params} label={label} placeholder={placeholder} size="small" />}
      sx={sx}
    />
  )
}
