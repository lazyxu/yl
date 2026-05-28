import fs from 'fs'
import path from 'path'
import Jimp from 'jimp'
import { recognizeImage, recognizeAndParse } from '../src/ocr/recognize.js'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(.:)/, '$1'))
const IMAGE = path.resolve(__dirname, '微信图片_20260521114102_9462_1.jpg')
const TMP = path.resolve('.','tmp','detect_enlarge')
if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true })

const EXPECTED = { A6:41,A17:31,C3:84,C5:107,C6:375,C7:413,C8:111,C13:126,C20:122,C24:593,C28:287,D1:30,D17:141,D23:182,E8:12,H2:696 }

function isLikelyCode(s){
  if (!s) return false
  s = s.toUpperCase().replace(/[\s\.:,]/g,'')
  // common codes: letter(s) + 1-3 digits, e.g., A6, C28, D17
  return /^[A-Z]{1,2}\d{1,3}$/.test(s)
}

async function run(){
  const img = await Jimp.read(IMAGE)
  // make a moderately upscaled buffer for detection
  const detectImg = img.clone()
  detectImg.resize(Math.max(img.bitmap.width*1.5, 1200), Jimp.AUTO)
  const detectBuf = await detectImg.getBufferAsync(Jimp.MIME_JPEG)

  console.log('Running initial OCR to detect candidate code positions...')
  const data = await recognizeImage(detectBuf, { lang: 'eng', psm: 6 })
  const words = (data && data.words) || []
  const text = (data && data.text) || ''

  const candidates = []
  if (words && words.length > 0){
    for (const w of words){
      const t = (w.text || w.word || '').toString().toUpperCase().trim()
      if (!isLikelyCode(t)) continue
      // bbox fallback handling
      const bbox = w.bbox || (w.boundingBox ? w.boundingBox : null)
      let x0,y0,x1,y1
      if (bbox){
        x0 = Math.floor(bbox.x0); y0 = Math.floor(bbox.y0); x1 = Math.ceil(bbox.x1); y1 = Math.ceil(bbox.y1)
      } else if (w.x0 !== undefined){
        x0 = w.x0; y0 = w.y0; x1 = w.x1; y1 = w.y1
      } else {
        continue
      }
      // convert bbox from detectImg scale back to original img scale
      const scale = detectImg.bitmap.width / img.bitmap.width
      const rx0 = Math.max(0, Math.floor(x0/scale))
      const ry0 = Math.max(0, Math.floor(y0/scale))
      const rx1 = Math.min(img.bitmap.width, Math.ceil(x1/scale))
      const ry1 = Math.min(img.bitmap.height, Math.ceil(y1/scale))
      candidates.push({ code: t, bbox: [rx0, ry0, rx1, ry1] })
    }
  } else {
    // fallback: try simple token scan from text
    console.log('No word-level data; scanning text tokens...')
    const toks = text.split(/\s+/)
    for (const tok of toks){
      const t = tok.toUpperCase().replace(/[^A-Z0-9]/g,'')
      if (isLikelyCode(t)) candidates.push({ code: t, bbox: null })
    }
  }

  console.log('Detected candidates:', candidates.map(c=>c.code))

  const results = {}
  for (const c of candidates){
    const code = c.code
    if (!results[code]) results[code] = []
    let [x0,y0,x1,y1] = c.bbox || [0, Math.max(0,img.bitmap.height - 300), img.bitmap.width, img.bitmap.height]
    // expand bbox padding
    const padW = Math.max(10, Math.floor((x1-x0)*0.6))
    const padH = Math.max(6, Math.floor((y1-y0)*1.2))
    x0 = Math.max(0, x0 - padW); y0 = Math.max(0, y0 - padH)
    x1 = Math.min(img.bitmap.width, x1 + padW); y1 = Math.min(img.bitmap.height, y1 + padH)

    const region = img.clone().crop(x0, y0, Math.max(3, x1-x0), Math.max(3, y1-y0))
    // produce a few enlarged variants (6x primary)
    const resizes = [4,6]
    for (const r of resizes){
      const clone = region.clone()
      const tw = Math.max(200, Math.floor(clone.bitmap.width * r))
      clone.resize(tw, Jimp.AUTO)
      clone.greyscale()
      try{ clone.contrast(0.12) }catch(e){}
      const fname = path.join(TMP, `${code}_r${r}.jpg`)
      await clone.getBufferAsync(Jimp.MIME_JPEG).then(buf=> fs.writeFileSync(fname, buf))
      // recognize enlarged region
      try{
        const parsed = await recognizeAndParse(await clone.getBufferAsync(Jimp.MIME_JPEG), { lang: 'eng', psm: 6 })
        // find this code in parsed.pairs or summary
        const found = (parsed && parsed.summary) ? parsed.summary.find(s=>String(s.code).toUpperCase()===code) : null
        const val = found ? Number(found.total) : null
        results[code].push({ r, val, file: path.relative(process.cwd(), fname) })
      }catch(e){ console.error('enlarged OCR error', e && e.message) }
    }
  }

  console.log('\n=== Detection+Enlarge Results ===')
  const out = []
  for (const [code, arr] of Object.entries(results)){
    const vals = arr.map(a=>a.val).filter(v=>v!=null)
    const med = vals.length ? vals.sort((a,b)=>a-b)[Math.floor(vals.length/2)] : null
    out.push({ code, median: med, samples: arr })
  }
  console.table(out.map(o=>({ code: o.code, median: o.median })))

  // compare to expected
  let matched = 0
  const details = []
  for (const [k,exp] of Object.entries(EXPECTED)){
    const row = out.find(o=>o.code===k)
    const got = row ? row.median : null
    const ok = (got === exp)
    if (ok) matched++
    details.push({ code: k, expected: exp, got, ok })
  }
  console.log(`\nMatch ${matched} / ${Object.keys(EXPECTED).length}`)
  console.table(details)
}

run().catch(e=>{ console.error(e); process.exit(1) })
