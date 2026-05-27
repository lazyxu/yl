import fs from 'fs'
import path from 'path'
import { recognizeAndParse } from '../src/ocr/recognize.js'

const DIRS = [path.resolve('.','tmp','detect_enlarge'), path.resolve('.','tmp','aggressive')]
const EXPECTED = { A6:41,A17:31,C3:84,C5:107,C6:375,C7:413,C8:111,C13:126,C20:122,C24:593,C28:287,D1:30,D17:141,D23:182,E8:12,H2:696 }
const PSMs = [6,7,11]
const WHITELIST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

function median(arr){ if(!arr||arr.length===0) return null; const s=arr.slice().sort((a,b)=>a-b); const m=Math.floor(s.length/2); return s.length%2? s[m] : Math.round((s[m-1]+s[m])/2) }

async function run(){
  const collected = {}
  for (const dir of DIRS){
    if (!fs.existsSync(dir)) continue
    const files = fs.readdirSync(dir).filter(f=>/\.jpe?g$/i.test(f)).map(f=>path.join(dir,f))
    for (const f of files){
      const name = path.basename(f)
      // try to infer code prefix
      const m = name.match(/^([A-Z]{1,2}\d{0,3})/i)
      const possible = m ? m[1].toUpperCase() : null
      for (const psm of PSMs){
        try{
          const parsed = await recognizeAndParse(f, { lang: 'eng', psm, whitelist: WHITELIST })
          const sums = (parsed && parsed.summary) ? parsed.summary : []
          for (const s of sums){
            const code = String(s.code || '').toUpperCase()
            if (!code) continue
            collected[code] = collected[code] || []
            const num = Number(s.total) || null
            if (num != null) collected[code].push(num)
          }
          // also check if possible inferred code present as pair
          if (possible){
            const pair = (parsed && parsed.pairs) ? parsed.pairs.find(p=>String(p.code).toUpperCase()===possible) : null
            if (pair && typeof pair.count === 'number'){
              collected[possible] = collected[possible] || []
              collected[possible].push(Number(pair.count))
            }
          }
        }catch(e){ /* ignore individual file errors */ }
      }
    }
  }

  const out = []
  for (const k of Object.keys(EXPECTED)){
    const vals = (collected[k]||[]).filter(v=>typeof v === 'number')
    out.push({ code: k, files: vals.length, median: median(vals), samples: vals.slice(0,10) })
  }
  console.log('=== Strict retry summary ===')
  console.table(out)
}

run().catch(e=>{ console.error(e); process.exit(1) })
