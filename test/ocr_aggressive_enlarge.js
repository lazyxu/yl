import fs from 'fs'
import path from 'path'
import Jimp from 'jimp'
import { recognizeAndParse } from '../src/ocr/recognize.js'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(.:)/, '$1'))
const IMAGE = path.resolve(__dirname, '微信图片_20260521114102_9462_1.jpg')
const TMP_DIR = path.resolve('.','tmp','aggressive')
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true })

const TARGETS = ['C6','C13','C20','D1']
const expected = { C6:375,C13:126,C20:122,D1:30 }

// sliding windows across width
const SLIDE_STEPS = 10
const WINDOW_WIDTH_RATIO = 0.12 // narrower windows for focused digits
const BOTTOM_CROP_RATIO = 0.30

// aggressive resize factors
const RESIZES = [3.0, 4.0, 5.0, 6.0]
const THRESHOLDS = [110, 130, 150, null]
const CONTRASTS = [0.0, 0.12, 0.25]

function median(arr){ if(!arr||arr.length===0) return null; const s=arr.slice().sort((a,b)=>a-b); const m=Math.floor(s.length/2); return s.length%2? s[m] : Math.round((s[m-1]+s[m])/2) }

async function run(){
  const img = await Jimp.read(IMAGE)
  const cropH = Math.max(80, Math.floor(img.bitmap.height * BOTTOM_CROP_RATIO))
  const tableY = img.bitmap.height - cropH
  const fullW = img.bitmap.width
  const winW = Math.max(40, Math.floor(fullW * WINDOW_WIDTH_RATIO))

  const results = {}

  for (const code of TARGETS){
    results[code] = []
    for (let s=0; s<SLIDE_STEPS; s++){
      const x = Math.max(0, Math.floor((fullW - winW) * (s/(SLIDE_STEPS-1))))
      const w = winW
      const roi = img.clone().crop(x, tableY, w, cropH)
      const roiDir = path.join(TMP_DIR, code)
      if (!fs.existsSync(roiDir)) fs.mkdirSync(roiDir, { recursive: true })

      for (const r of RESIZES){
        for (const t of THRESHOLDS){
          for (const c of CONTRASTS){
            const clone = roi.clone()
            const targetWidth = Math.max(Math.floor(clone.bitmap.width * r), 400)
            clone.resize(targetWidth, Jimp.AUTO)
            clone.greyscale()
            if (t) try{ clone.threshold({ max: t }) }catch(e){}
            if (c) try{ clone.contrast(c) }catch(e){}
            const fname = path.join(roiDir, `x${x}_r${r}_t${t||'n'}_c${c}.jpg`)
            const buf = await clone.getBufferAsync(Jimp.MIME_JPEG)
            fs.writeFileSync(fname, buf)

            let parsed = null
            try{
              parsed = await recognizeAndParse(buf, { lang: 'eng', psm: 6 })
            }catch(e){ console.error('ocr error', e && e.message) }
            const found = parsed && parsed.summary ? (parsed.summary.find(s=>String(s.code).toUpperCase()===code) || null) : null
            const val = found ? Number(found.total) : null
            results[code].push({ x, r, t, c, value: val, fname })
          }
        }
      }
    }
  }

  const agg = {}
  for (const [code, arr] of Object.entries(results)){
    const vals = arr.map(r=>r.value).filter(v=>v!=null)
    const med = median(vals)
    // find best candidate closest to median
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

  console.log('\n=== Aggressive enlargement results ===')
  const out = []
  for (const c of TARGETS){
    out.push({ code: c, expected: expected[c], median: agg[c].median, best: agg[c].best && { value: agg[c].best.value, file: path.relative(process.cwd(), agg[c].best.fname) } })
  }
  console.table(out)

  const matched = Object.entries(agg).reduce((s,[k,v])=> s + ((v.median === expected[k])?1:0), 0)
  console.log(`\nMatched ${matched} / ${TARGETS.length}`)
}

run().catch(e=>{ console.error(e); process.exit(1) })
