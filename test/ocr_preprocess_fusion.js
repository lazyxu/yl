import fs from 'fs'
import path from 'path'
import Jimp from 'jimp'
import { recognizeAndParse, parseOcrText } from '../src/ocr/recognize.js'
import * as ocrspace from '../src/ocr/ocrspace.js'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(.:)/, '$1'))
const IMAGE = path.resolve(__dirname, '微信图片_20260521114102_9462_1.jpg')
const TMP_DIR = path.resolve('.','tmp','preproc')
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true })

const VARIANTS = [
  { name: 'resize1.2_thresh100_crop30', resize: 1.2, threshold: 100, cropRatio: 0.30 },
  { name: 'resize1.2_thresh120_crop25', resize: 1.2, threshold: 120, cropRatio: 0.25 },
  { name: 'resize1.2_thresh150_crop20', resize: 1.2, threshold: 150, cropRatio: 0.20 },
  { name: 'resize1.5_thresh120_crop25', resize: 1.5, threshold: 120, cropRatio: 0.25, contrast: 0.1 },
  { name: 'resize1.5_thresh150_crop20', resize: 1.5, threshold: 150, cropRatio: 0.20, contrast: 0.2 },
  { name: 'resize2.0_thresh130_crop30', resize: 2.0, threshold: 130, cropRatio: 0.30 },
  { name: 'resize2.0_thresh160_crop35', resize: 2.0, threshold: 160, cropRatio: 0.35, invert: false },
  { name: 'grayscale_only', resize: 1.2, threshold: null, cropRatio: 0.25 },
  { name: 'no_crop_resize1.5', resize: 1.5, threshold: 150, cropRatio: 0 },
  { name: 'invert_thresh140_crop25', resize: 1.5, threshold: 140, cropRatio: 0.25, invert: true },
  { name: 'high_contrast_thresh120_crop20', resize: 1.5, threshold: 120, cropRatio: 0.20, contrast: 0.35 },
  { name: 'blur_then_thresh130', resize: 1.5, threshold: 130, cropRatio: 0.25, blur: 1 }
]

async function makeVariantBuffer(src, v){
  const img = await Jimp.read(src)
  const targetWidth = Math.max(Math.floor(img.bitmap.width * (v.resize || 1)), 800)
  img.resize(targetWidth, Jimp.AUTO)
  img.greyscale()
  if (v.cropRatio && v.cropRatio > 0){
    const cropH = Math.max(80, Math.floor(img.bitmap.height * v.cropRatio))
    img.crop(0, img.bitmap.height - cropH, img.bitmap.width, cropH)
  }
  if (v.blur) try{ img.blur(v.blur) }catch(e){}
  if (typeof v.contrast === 'number') try{ img.contrast(v.contrast) }catch(e){}
  if (typeof v.brightness === 'number') try{ img.brightness(v.brightness) }catch(e){}
  if (v.threshold){
    try{ img.threshold({ max: v.threshold }) }catch(e){}
  }
  if (v.invert) try{ img.invert() }catch(e){}
  return img.getBufferAsync(Jimp.MIME_JPEG)
}

function median(arr){
  if (!arr || arr.length === 0) return null
  const s = arr.slice().sort((a,b)=>a-b)
  const mid = Math.floor(s.length/2)
  if (s.length % 2 === 1) return s[mid]
  return Math.round((s[mid-1]+s[mid])/2)
}

async function run(){
  const results = { local: {}, ocrspace: {} }

  for (let i=0;i<VARIANTS.length;i++){
    const v = VARIANTS[i]
    const buf = await makeVariantBuffer(IMAGE, v)
    const fname = path.join(TMP_DIR, `variant_${i}_${v.name}.jpg`)
    fs.writeFileSync(fname, buf)
    console.log('Wrote', fname)

    // local tesseract
    try{
      const parsedLocal = await recognizeAndParse(buf, { lang: 'eng', psm: 6, whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789' })
      for (const s of parsedLocal.summary || []){
        const code = String(s.code).toUpperCase()
        results.local[code] = results.local[code] || []
        results.local[code].push(Number(s.total) || 0)
      }
    }catch(e){ console.error('local OCR error', e && e.message) }

    // OCR.Space (english) - may be slow or rate-limited
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

  // aggregate: median per code across variants
  const agg = { local: {}, ocrspace: {}, combined: {} }
  const codes = new Set([...Object.keys(results.local), ...Object.keys(results.ocrspace)])
  for (const c of codes){
    const l = results.local[c] || []
    const r = results.ocrspace[c] || []
    const medL = median(l)
    const medR = median(r)
    if (medL != null) agg.local[c] = medL
    if (medR != null) agg.ocrspace[c] = medR
    // combined: prefer non-null median; if both exist take rounded avg
    if (medL != null && medR != null) agg.combined[c] = Math.round((medL + medR)/2)
    else if (medL != null) agg.combined[c] = medL
    else if (medR != null) agg.combined[c] = medR
  }

  console.log('\n=== Aggregated medians (local / ocrspace / combined) ===')
  const out = []
  for (const c of Object.keys(agg.combined).sort()){
    out.push({ code: c, local: agg.local[c]||null, ocrspace: agg.ocrspace[c]||null, combined: agg.combined[c] })
  }
  console.table(out)

  // compare to authoritative list
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
