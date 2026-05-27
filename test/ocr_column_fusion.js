import fs from 'fs'
import path from 'path'
import Jimp from 'jimp'
import { recognizeAndParse, parseOcrText } from '../src/ocr/recognize.js'
import * as ocrspace from '../src/ocr/ocrspace.js'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(.:)/, '$1'))
const IMAGE = path.resolve(__dirname, '微信图片_20260521114102_9462_1.jpg')
const TMP_DIR = path.resolve('.','tmp','preproc_columns')
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true })

const NUM_COLS = 8
const COLUMN_CROP_RATIO = 0.30 // proportion of height to crop from bottom for table rows

const VARIANTS = [
  { name: 'resize1.2_thresh120', resize: 1.2, threshold: 120 },
  { name: 'resize1.5_thresh120', resize: 1.5, threshold: 120, contrast: 0.12 },
  { name: 'resize2.0_thresh130', resize: 2.0, threshold: 130, contrast: 0.18 },
  { name: 'invert_thresh140', resize: 1.5, threshold: 140, invert: true },
  { name: 'blur_then_thresh130', resize: 1.5, threshold: 130, blur: 1 },
  { name: 'grayscale_only', resize: 1.2, threshold: null }
]

async function makeVariantBuffer(img, v){
  // img is a Jimp instance already loaded and sized to the column region
  const clone = img.clone()
  const targetWidth = Math.max(Math.floor(clone.bitmap.width * (v.resize || 1)), 400)
  clone.resize(targetWidth, Jimp.AUTO)
  clone.greyscale()
  if (v.blur) try{ clone.blur(v.blur) }catch(e){}
  if (typeof v.contrast === 'number') try{ clone.contrast(v.contrast) }catch(e){}
  if (v.threshold){ try{ clone.threshold({ max: v.threshold }) }catch(e){} }
  if (v.invert) try{ clone.invert() }catch(e){}
  return clone.getBufferAsync(Jimp.MIME_JPEG)
}

function median(arr){
  if (!arr || arr.length === 0) return null
  const s = arr.slice().sort((a,b)=>a-b)
  const mid = Math.floor(s.length/2)
  if (s.length % 2 === 1) return s[mid]
  return Math.round((s[mid-1]+s[mid])/2)
}

async function run(){
  const img = await Jimp.read(IMAGE)
  const cropH = Math.max(80, Math.floor(img.bitmap.height * COLUMN_CROP_RATIO))
  const tableY = img.bitmap.height - cropH
  const colWidth = Math.floor(img.bitmap.width / NUM_COLS)

  const results = { local: {}, ocrspace: {} }

  for (let col=0; col<NUM_COLS; col++){
    const x = col * colWidth
    const w = (col === NUM_COLS-1) ? (img.bitmap.width - x) : colWidth
    const colImg = img.clone().crop(x, tableY, w, cropH)
    const colDir = path.join(TMP_DIR, `col_${col}`)
    if (!fs.existsSync(colDir)) fs.mkdirSync(colDir, { recursive: true })

    for (let vi=0; vi<VARIANTS.length; vi++){
      const v = VARIANTS[vi]
      const buf = await makeVariantBuffer(colImg, v)
      const fname = path.join(colDir, `col${col}_v${vi}_${v.name}.jpg`)
      fs.writeFileSync(fname, buf)

      // local tesseract
      try{
        const parsedLocal = await recognizeAndParse(buf, { lang: 'eng', psm: 6 })
        for (const s of parsedLocal.summary || []){
          const code = String(s.code).toUpperCase()
          results.local[code] = results.local[code] || []
          results.local[code].push(Number(s.total) || 0)
        }
      }catch(e){ console.error('local OCR error', e && e.message) }

      // OCR.Space
      try{
        const apiResp = await ocrspace.parseImageFile(fname, { language: 'eng' })
        const text = ocrspace.extractParsedText(apiResp)
        const parsedRemote = parseOcrText(text)
        for (const s of parsedRemote.summary || []){
          const code = String(s.code).toUpperCase()
          results.ocrspace[code] = results.ocrspace[code] || []
          results.ocrspace[code].push(Number(s.total) || 0)
        }
      }catch(e){ console.error('OCR.Space error', e && e.message) }
    }
  }

  // aggregate median across all columns+variants
  const agg = { local: {}, ocrspace: {}, combined: {} }
  const codes = new Set([...Object.keys(results.local), ...Object.keys(results.ocrspace)])
  for (const c of codes){
    const medL = median(results.local[c] || [])
    const medR = median(results.ocrspace[c] || [])
    if (medL != null) agg.local[c] = medL
    if (medR != null) agg.ocrspace[c] = medR
    if (medL != null && medR != null) agg.combined[c] = Math.round((medL + medR)/2)
    else if (medL != null) agg.combined[c] = medL
    else if (medR != null) agg.combined[c] = medR
  }

  console.log('\n=== Column-aggregated medians (combined) ===')
  const out = []
  for (const c of Object.keys(agg.combined).sort()){
    out.push({ code: c, combined: agg.combined[c], local: agg.local[c]||null, ocrspace: agg.ocrspace[c]||null })
  }
  console.table(out)

  const expected = {
    A6:41,A17:31,C3:84,C5:107,C6:375,C7:413,C8:111,C13:126,C20:122,C24:593,C28:287,D1:30,D17:141,D23:182,E8:12,H2:696
  }
  let matched = 0
  const details = []
  for (const [k,v] of Object.entries(expected)){
    const got = agg.combined[k] || null
    const ok = (got === v)
    if (ok) matched++
    details.push({ code: k, expected: v, got, ok })
  }
  console.log(`\nMatch ${matched} / ${Object.keys(expected).length}`)
  console.table(details)
}

run().catch(e=>{ console.error(e); process.exit(1) })
