import fs from 'fs'
import path from 'path'
import Jimp from 'jimp'
import { recognizeAndParse } from '../src/ocr/recognize.js'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(.:)/, '$1'))
const IMAGE = path.resolve(__dirname, '微信图片_20260521114102_9462_1.jpg')
const TMP_DIR = path.resolve('.','tmp','merge')
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true })

const FULL_VARIANTS = [
  { name: 'resize1.2_thresh120_crop25', resize: 1.2, threshold: 120, cropRatio: 0.25 },
  { name: 'resize1.5_thresh150_crop20', resize: 1.5, threshold: 150, cropRatio: 0.2 },
  { name: 'resize2.0_thresh130_crop30', resize: 2.0, threshold: 130, cropRatio: 0.3 },
  { name: 'grayscale_only', resize: 1.2, threshold: null, cropRatio: 0.25 },
  { name: 'invert_thresh140_crop25', resize: 1.5, threshold: 140, cropRatio: 0.25, invert: true }
]

const COL_VARIANTS = [
  { name: 'resize1.2_thresh120', resize: 1.2, threshold: 120 },
  { name: 'resize1.5_thresh120', resize: 1.5, threshold: 120, contrast: 0.12 },
  { name: 'resize2.0_thresh130', resize: 2.0, threshold: 130, contrast: 0.18 },
  { name: 'invert_thresh140', resize: 1.5, threshold: 140, invert: true }
]

const NUM_COLS = 8
const COLUMN_CROP_RATIO = 0.30

function median(arr){ if(!arr||arr.length===0) return null; const s=arr.slice().sort((a,b)=>a-b); const m=Math.floor(s.length/2); return s.length%2? s[m] : Math.round((s[m-1]+s[m])/2) }
function variance(arr){ if(!arr||arr.length===0) return Infinity; const m = arr.reduce((a,b)=>a+b,0)/arr.length; return arr.reduce((s,x)=>s+(x-m)*(x-m),0)/arr.length }

async function makeFullBuffer(src, v){
  const img = await Jimp.read(src)
  const targetWidth = Math.max(Math.floor(img.bitmap.width * (v.resize || 1)), 800)
  img.resize(targetWidth, Jimp.AUTO)
  img.greyscale()
  if (v.cropRatio && v.cropRatio > 0){ const cropH = Math.max(80, Math.floor(img.bitmap.height * v.cropRatio)); img.crop(0, img.bitmap.height - cropH, img.bitmap.width, cropH) }
  if (v.threshold) try{ img.threshold({ max: v.threshold }) }catch(e){}
  if (v.invert) try{ img.invert() }catch(e){}
  try{ img.contrast(v.contrast||0.15) }catch(e){}
  return img.getBufferAsync(Jimp.MIME_JPEG)
}

async function makeColBuffer(img, v){
  const clone = img.clone()
  const targetWidth = Math.max(Math.floor(clone.bitmap.width * (v.resize || 1)), 400)
  clone.resize(targetWidth, Jimp.AUTO)
  clone.greyscale()
  if (v.threshold) try{ clone.threshold({ max: v.threshold }) }catch(e){}
  if (v.invert) try{ clone.invert() }catch(e){}
  try{ clone.contrast(v.contrast||0.12) }catch(e){}
  return clone.getBufferAsync(Jimp.MIME_JPEG)
}

async function run(){
  const expected = { A6:41,A17:31,C3:84,C5:107,C6:375,C7:413,C8:111,C13:126,C20:122,C24:593,C28:287,D1:30,D17:141,D23:182,E8:12,H2:696 }

  const fullResults = {} // code -> array
  const colResults = {}

  // full-row variants
  for (let i=0;i<FULL_VARIANTS.length;i++){
    const v = FULL_VARIANTS[i]
    const buf = await makeFullBuffer(IMAGE, v)
    const fname = path.join(TMP_DIR, `full_v${i}_${v.name}.jpg`)
    fs.writeFileSync(fname, buf)
    let parsed = null
    try{
      parsed = await recognizeAndParse(buf, { lang: 'eng', psm: 6 })
    }catch(e){ console.error('full OCR error', e && e.message) }
    for (const s of (parsed && parsed.summary)||[]){
      const code = String(s.code).toUpperCase()
      fullResults[code] = fullResults[code] || []
      fullResults[code].push(Number(s.total)||0)
    }
  }

  // per-column variants
  const img = await Jimp.read(IMAGE)
  const cropH = Math.max(80, Math.floor(img.bitmap.height * COLUMN_CROP_RATIO))
  const tableY = img.bitmap.height - cropH
  const colWidth = Math.floor(img.bitmap.width / NUM_COLS)
  for (let col=0; col<NUM_COLS; col++){
    const x = col * colWidth
    const w = (col === NUM_COLS-1) ? (img.bitmap.width - x) : colWidth
    const colImg = img.clone().crop(x, tableY, w, cropH)
    for (let vi=0; vi<COL_VARIANTS.length; vi++){
      const v = COL_VARIANTS[vi]
      const buf = await makeColBuffer(colImg, v)
      const fname = path.join(TMP_DIR, `col${col}_v${vi}_${v.name}.jpg`)
      fs.writeFileSync(fname, buf)
      let parsed = null
      try{ parsed = await recognizeAndParse(buf, { lang: 'eng', psm: 6 }) }catch(e){ console.error('col OCR error', e && e.message) }
      for (const s of (parsed && parsed.summary)||[]){
        const code = String(s.code).toUpperCase()
        colResults[code] = colResults[code] || []
        colResults[code].push(Number(s.total)||0)
      }
    }
  }

  // compute medians and variances
  const codes = new Set([...Object.keys(fullResults), ...Object.keys(colResults)])
  const merged = {}
  for (const c of codes){
    const fullArr = fullResults[c]||[]
    const colArr = colResults[c]||[]
    const medFull = median(fullArr)
    const medCol = median(colArr)
    const varFull = variance(fullArr)
    const varCol = variance(colArr)
    let chosen = null
    if (medFull==null && medCol==null) chosen = null
    else if (medFull==null) chosen = medCol
    else if (medCol==null) chosen = medFull
    else {
      // choose source with smaller variance; if similar, take average of medians
      if (varFull/ (varCol||1) < 0.8) chosen = medFull
      else if (varCol/ (varFull||1) < 0.8) chosen = medCol
      else chosen = Math.round((medFull + medCol)/2)
    }
    merged[c] = { full: medFull, col: medCol, varFull, varCol, chosen }
  }

  // produce combined mapping
  const combined = {}
  for (const [k,v] of Object.entries(merged)) if (v.chosen != null) combined[k]=v.chosen

  // show top codes
  console.log('\n=== Merged combined (chosen source per-code) ===')
  const out = Object.keys(combined).sort().map(c=>({ code: c, value: combined[c], full: merged[c].full, col: merged[c].col }))
  console.table(out)

  // compare to expected
  let matched = 0
  const details = []
  for (const [k,exp] of Object.entries(expected)){
    const got = combined[k] || null
    const ok = (got === exp)
    if (ok) matched++
    details.push({ code: k, expected: exp, got, ok })
  }
  console.log(`\nMatch ${matched} / ${Object.keys(expected).length}`)
  console.table(details)
}

run().catch(e=>{ console.error(e); process.exit(1) })
