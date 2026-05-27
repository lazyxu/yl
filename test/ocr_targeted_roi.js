import fs from 'fs'
import path from 'path'
import Jimp from 'jimp'
import { recognizeAndParse } from '../src/ocr/recognize.js'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(.:)/, '$1'))
const IMAGE = path.resolve(__dirname, '微信图片_20260521114102_9462_1.jpg')
const TMP_DIR = path.resolve('.','tmp','targeted')
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true })

const TARGETS = ['C5','C6','C13','C20','D1']
const expected = { C5:107,C6:375,C13:126,C20:122,D1:30 }

// sliding windows across width to find best ROI for each code
const SLIDE_STEPS = 8
const WINDOW_WIDTH_RATIO = 0.25 // window width as fraction of full width
const BOTTOM_CROP_RATIO = 0.30

const VARIANTS = [
  { name: 'r2.0_t120_c0.1', resize:2.0, threshold:120, contrast:0.1 },
  { name: 'r3.0_t120_c0.15', resize:3.0, threshold:120, contrast:0.15 },
  { name: 'r3.5_t140_c0.2', resize:3.5, threshold:140, contrast:0.2 },
  { name: 'r4.0_t160_inv', resize:4.0, threshold:160, invert:true },
  { name: 'r3.0_gray', resize:3.0, threshold:null }
]

function median(arr){ if(!arr||arr.length===0) return null; const s=arr.slice().sort((a,b)=>a-b); const m=Math.floor(s.length/2); return s.length%2? s[m] : Math.round((s[m-1]+s[m])/2) }

async function run(){
  const img = await Jimp.read(IMAGE)
  const cropH = Math.max(80, Math.floor(img.bitmap.height * BOTTOM_CROP_RATIO))
  const tableY = img.bitmap.height - cropH
  const fullW = img.bitmap.width
  const winW = Math.max(60, Math.floor(fullW * WINDOW_WIDTH_RATIO))

  const results = {}

  for (const code of TARGETS){
    results[code] = []
    for (let s=0; s<SLIDE_STEPS; s++){
      const x = Math.max(0, Math.floor((fullW - winW) * (s/(SLIDE_STEPS-1))))
      const w = winW
      const roi = img.clone().crop(x, tableY, w, cropH)
      const roiDir = path.join(TMP_DIR, code)
      if (!fs.existsSync(roiDir)) fs.mkdirSync(roiDir, { recursive: true })

      for (let vi=0; vi<VARIANTS.length; vi++){
        const v = VARIANTS[vi]
        const clone = roi.clone()
        const targetWidth = Math.max(Math.floor(clone.bitmap.width * (v.resize || 1)), 300)
        clone.resize(targetWidth, Jimp.AUTO)
        clone.greyscale()
        if (v.threshold) try{ clone.threshold({ max: v.threshold }) }catch(e){}
        if (v.invert) try{ clone.invert() }catch(e){}
        if (typeof v.contrast === 'number') try{ clone.contrast(v.contrast) }catch(e){}
        const fname = path.join(roiDir, `x${x}_v${vi}_${v.name}.jpg`)
        fs.writeFileSync(fname, await clone.getBufferAsync(Jimp.MIME_JPEG))

        let parsed = null
        try{
          parsed = await recognizeAndParse(await clone.getBufferAsync(Jimp.MIME_JPEG), { lang: 'eng', psm: 6 })
        }catch(e){ console.error('ocr error', e && e.message) }
        const found = parsed && parsed.summary ? (parsed.summary.find(s=>String(s.code).toUpperCase()===code) || null) : null
        const val = found ? Number(found.total) : null
        results[code].push({ x, variant: v.name, value: val })
      }
    }
  }

  // aggregate per code: choose median of non-null values, then best window
  const agg = {}
  for (const [code, arr] of Object.entries(results)){
    const vals = arr.map(r=>r.value).filter(v=>v!=null)
    const med = median(vals)
    // pick entry closest to median
    let best = null
    if (med != null){
      let bestDiff = Infinity
      for (const e of arr){
        if (e.value == null) continue
        const d = Math.abs(e.value - med)
        if (d < bestDiff){ bestDiff = d; best = e }
      }
    }
    agg[code] = { median: med, best }
  }

  console.log('\n=== Targeted ROI results ===')
  const out = []
  for (const c of TARGETS){
    out.push({ code: c, expected: expected[c], median: agg[c].median, best: agg[c].best })
  }
  console.table(out)

  const matched = Object.entries(agg).reduce((s,[k,v])=> s + ((v.median === expected[k])?1:0), 0)
  console.log(`\nMatched ${matched} / ${TARGETS.length}`)
}

run().catch(e=>{ console.error(e); process.exit(1) })
