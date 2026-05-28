import fs from 'fs'
import path from 'path'
import { recognizeAndParse } from '../src/ocr/recognize.js'

const DIR = path.resolve('.','tmp','detect_enlarge')
const EXPECTED = { A6:41,A17:31,C3:84,C5:107,C6:375,C7:413,C8:111,C13:126,C20:122,C24:593,C28:287,D1:30,D17:141,D23:182,E8:12,H2:696 }

function median(arr){ if(!arr||arr.length===0) return null; const s=arr.slice().sort((a,b)=>a-b); const m=Math.floor(s.length/2); return s.length%2? s[m] : Math.round((s[m-1]+s[m])/2) }

async function run(){
  const summary = {}
  for (const code of Object.keys(EXPECTED)){
    const files = []
    try{
      const all = fs.readdirSync(DIR)
      for (const f of all){
        const norm = f.replace(/，/g,',')
        if (norm.startsWith(code + '_r6') || norm.startsWith(code + '_r4') || norm.startsWith(code + 'r6') || norm.startsWith(code + 'r4')){
          files.push(path.join(DIR,f))
        }
      }
    }catch(e){ }
    const vals = []
    for (const f of files){
      try{
        const parsed = await recognizeAndParse(f, { lang: 'eng', psm: 6 })
        const found = parsed && parsed.summary ? parsed.summary.find(s=>String(s.code).toUpperCase()===code) : null
        if (found && typeof found.total === 'number') vals.push(found.total)
      }catch(e){ }
    }
    summary[code] = { files: files.length, median: median(vals), samples: vals }
  }
  console.log('=== detect_enlarge summary ===')
  console.table(Object.keys(summary).map(k=>({ code: k, files: summary[k].files, median: summary[k].median, samples: summary[k].samples.length })))
}

run().catch(e=>{ console.error(e); process.exit(1) })
