import { useMemo, useState, useEffect, useRef } from 'react'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import ColorCodeSelect from './ColorCodeSelect'
 
import Input from '@mui/material/Input'
// use dynamic import for tesseract to handle different bundler export shapes
import MARD from './colorPalettes/mard.json'
import InventoryGrid from './InventoryGrid'
 
function findPalette(code){
  return MARD.find(p => p.code === code)
}

export default function PindouConsume({ initialOperation = '消耗', draft, loading = false, onDraftChange, onBusyChange, onClose = ()=>{}, onAdded = ()=>{} }){
  const { itemsMap, selectedCodes, applyCount, note, imgFile } = draft
  function updateField(field, value) {
    onDraftChange(current => ({ ...current, [field]: typeof value === 'function' ? value(current[field]) : value }))
  }
  const setItemsMap = value => updateField('itemsMap', value)
  const setSelectedCodes = value => updateField('selectedCodes', value)
  const setApplyCount = value => updateField('applyCount', value)
  const setNote = value => updateField('note', value)
  const setImgFile = value => updateField('imgFile', value)
  const setLoading = onBusyChange
  const submitting = useRef(false)
  const [imgPreview, setImgPreview] = useState(null)
  const hasDraft = selectedCodes.length > 0 || applyCount !== '' || note !== '' || imgFile || Object.values(itemsMap).some(count => count > 0)

  const allCodes = useMemo(()=>{
    const set = new Set(MARD.map(p=>p.code))
    Object.keys(itemsMap).forEach(k=>set.add(k))
    return Array.from(set)
  }, [itemsMap])

  const handleSelectChange = (e, value) => {
    setSelectedCodes(value)
    setItemsMap(prev => {
      const next = { ...prev }
      value.forEach(code => { if (!(code in next)) next[code] = 0 })
      return next
    })
  }

  const canApplyToSelected = useMemo(() => {
    if (!selectedCodes || selectedCodes.length === 0) return false
    if (applyCount === '' || applyCount == null) return false
    const n = Number(applyCount)
    return Number.isInteger(n) && n > 0
  }, [selectedCodes, applyCount])

  // A manually entered per-color count is enough to submit, even when the
  // optional bulk count field has not been filled in.
  const canSubmit = canApplyToSelected || Object.values(itemsMap).some(value =>
    Number.isSafeInteger(Number(value)) && Number(value) > 0)
  const grouped = useMemo(() => {
    const map = new Map()
    allCodes.forEach(code => {
      const key = (code || '').charAt(0).toUpperCase() || '#'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push({ color: code, count: Number(itemsMap[code] || 0) })
    })
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [allCodes, itemsMap])

  function updateCount(code, v){
    const n = Number(v) || 0
    if (!Number.isInteger(n) || n < 0) return
    setItemsMap(prev => ({ ...prev, [code]: n }))
  }

  function applyToSelected(){
    const n = Number(applyCount)
    if (!Number.isInteger(n) || n <= 0) return alert('请输入正整数数量')
    setItemsMap(prev => {
      const next = { ...prev }
      selectedCodes.forEach(code => { next[code] = n })
      return next
    })
  }

  async function handleSubmit(){
    if (loading || submitting.current || !canSubmit) return
    // 如果有填写“应用到所选”的数量，则先在提交数据中应用该数量（但不依赖 setState 异步）
    let submitMap = { ...itemsMap }
    if (canApplyToSelected) {
      const n = Number(applyCount)
      selectedCodes.forEach(code => { submitMap[code] = n })
      // 也同步更新组件状态以反映 UI
      setItemsMap(prev => {
        const next = { ...prev }
        selectedCodes.forEach(code => { next[code] = n })
        return next
      })
    }

    const items = Object.entries(submitMap).filter(([, cnt]) => Number.isSafeInteger(Number(cnt)) && Number(cnt) > 0).map(([color, cnt]) => ({ color, count: Number(cnt) }))
    if (items.length === 0) return alert('请先输入要' + initialOperation + '的数量')
    submitting.current = true
    setLoading(true)
    try{
      // 优先使用用户选择的文件上传为提交图片
      let imagePath = null
      if (imgFile) {
        const form = new FormData()
        form.append('image', imgFile)
        const up = await fetch('/api/upload', { method: 'POST', body: form })
        const uj = await up.json().catch(() => ({}))
        if (!up.ok || !uj.ok || !uj.filename) {
          throw new Error(uj.error || '图片上传失败，请重试；已保留本次草稿')
        }
        imagePath = uj.filename
      }

      const body = { operation: initialOperation, items, occurred_at: new Date().toISOString(), note, image_path: imagePath }
      const res = await fetch('/api/reminders', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error((await res.json()).error || res.statusText)
      const data = await res.json()
      alert(initialOperation + '记录已保存')
      onAdded(data)
    }catch(err){
      console.error(err)
      alert('保存失败：' + err.message)
    }finally{
      submitting.current = false
      setLoading(false)
    }
  }

  

  // 选择文件时：本地预览并上传到后端（FormData）
  async function handleFileChange(file){
    if (!file) return
    setImgFile(file)
  }

  // File stays in the draft; each mounted form owns only its preview URL.
  useEffect(() => {
    if (!imgFile) { setImgPreview(null); return }
    const url = URL.createObjectURL(imgFile)
    setImgPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [imgFile])

  return (
    <>
    <Box sx={{ p:1 }}>
      <Box sx={{ display:'flex', gap:1, alignItems:'center', mb:1, flexWrap:'wrap' }}>
          <Box sx={{ minWidth:240 }}>
            <ColorCodeSelect options={allCodes} value={selectedCodes} disabled={loading} onChange={handleSelectChange} sx={{ minWidth: 240 }} />
          </Box>
      </Box>

      <Box sx={{ display:'flex', gap:1, alignItems:'center', mb:1 }}>
        <TextField size="small" label="数量" type="number" value={applyCount} disabled={loading} onChange={e=>setApplyCount(e.target.value)} sx={{ width:120 }} />
        <Button variant="contained" size="small" onClick={applyToSelected} disabled={!canApplyToSelected || loading}>应用到所选</Button>
      </Box>

      <Box sx={{ mb:1, display:'flex', gap:1, alignItems:'center', flexWrap:'wrap' }}>
        <Input
          inputProps={{ accept: 'image/*' }}
          type="file"
          disabled={loading}
          onChange={e => handleFileChange(e.target.files && e.target.files[0])}
          sx={{ display: 'inline-flex' }}
        />
        {imgFile && <Typography variant="caption" sx={{ overflowWrap: 'anywhere' }}>图片：{imgFile.name}</Typography>}
        
        {/* 内联预览 */}
        {imgPreview && (
          <Box component="span" sx={{ ml:1, display:'inline-block', verticalAlign:'middle' }}>
            <img src={imgPreview} alt="preview" style={{ maxWidth:120, maxHeight:90, borderRadius:4, border:'1px solid #eee' }} />
          </Box>
        )}
        <Button size="small" onClick={() => { if (imgPreview) { const w = window.open('', '_blank', 'noopener'); if (w) { const el = w.document.createElement('img'); el.src = imgPreview; el.style.maxWidth = '100%'; w.document.body.appendChild(el) } } }}>预览</Button>
      </Box>

      <Box sx={{ mb:1 }}>
        <TextField fullWidth label="备注（可选）" size="small" value={note} disabled={loading} onChange={e=>setNote(e.target.value)} />
      </Box>

      <Box sx={{ display:'flex', gap:1, mt:0, mb:1 }}>
        <Button variant="contained" onClick={handleSubmit} disabled={!canSubmit || loading}>{loading ? '正在保存…' : initialOperation}</Button>
        <Button onClick={onClose} disabled={loading}>取消</Button>
      </Box>
      {hasDraft && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>切换页面会保留填写内容；刷新或关闭网页会清空。</Typography>}

      <InventoryGrid groupedInventory={grouped} findPalette={findPalette} showZero={false} />

    </Box>

    
    </>
  )
}
