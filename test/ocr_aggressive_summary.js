import fs from 'fs'
import path from 'path'
import { recognizeAndParse } from '../src/ocr/recognize.js'

const BASE = path.resolve('.','tmp','aggressive')
const TARGETS = ['C6','C13','C20','D1']
const MAX_PER_CODE = 20

function parseResize(fn){
  const m = fn.match(/_r(\d+(?:\.\d+)?)/)
  return m ? Number(m[1]) : 0
}

function median(arr){ if(!arr||arr.length===0) return null; const s=arr.slice().sort((a,b)=>a-b); const m=Math.floor(s.length/2); return s.length%2? s[m] : Math.round((s[m-1]+s[m])/2) }

async function run(){
  const summary = {}
  for (const code of TARGETS){
    const dir = path.join(BASE, code)
    if (!fs.existsSync(dir)){ console.log(code, 'no dir'); continue }
    let files = fs.readdirSync(dir).filter(f=>/\.jpg$/.test(f))
    files = files.map(f=>({f, r: parseResize(f)})).sort((a,b)=>b.r - a.r).map(x=>x.f)
    files = files.slice(0, MAX_PER_CODE)
    const vals = []
    for (const f of files){
      const p = path.join(dir,f)
      try{
        const parsed = await recognizeAndParse(p, { lang: 'eng', psm: 6 })
        const found = parsed && parsed.summary ? parsed.summary.find(s=>String(s.code).toUpperCase()===code) : null
        if (found && typeof found.total === 'number') vals.push(found.total)
      }catch(e){ console.error('err', code, f, e && e.message) }
    }
    summary[code] = { files: files.length, median: median(vals), values: vals }
  }
  console.log('\n=== Aggressive summary ===')
  console.table(Object.keys(summary).map(k=>({ code: k, files: summary[k].files, median: summary[k].median, sampleCount: summary[k].values.length })))
}

run().catch(e=>{ console.error(e); process.exit(1) })
