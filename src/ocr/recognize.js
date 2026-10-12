// 浏览器友好的 tesseract.js 识别封装
export async function recognizeImage(input, { lang = 'eng', psm = 6, whitelist = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', onProgress } = {}){
  const mod = await import('tesseract.js')
  const topRecognize = mod.recognize || (mod.default && mod.default.recognize)
  const creator = mod.createWorker || (mod.default && mod.default.createWorker) || mod.default

  const logger = onProgress ? (m => { try { onProgress(m) } catch(e){} }) : (()=>{})
  const safeLogger = (typeof logger === 'function') ? logger : (()=>{})

  const opts = {}
  if (psm) opts.tessedit_pageseg_mode = psm
  if (whitelist) opts.tessedit_char_whitelist = whitelist

  if (typeof topRecognize === 'function'){
    // top-level recognize available
    const res = await topRecognize(input, lang, { logger: safeLogger, ...opts })
    return res && res.data ? res.data : { text: '' }
  }

  if (typeof creator === 'function'){
    // fallback to worker API
    const worker = creator({ logger: safeLogger })
    if (worker && typeof worker.then === 'function'){
      // creator returned a Promise
      const resolved = await worker
      worker = resolved
    }
    if (!worker || typeof worker.load !== 'function') throw new Error('tesseract worker not available')
    await worker.load()
    await worker.loadLanguage(lang)
    await worker.initialize(lang)
    try{ if (whitelist) await worker.setParameters({ tessedit_char_whitelist: whitelist }) }catch(e){}
    const res = await worker.recognize(input)
    try{ await worker.terminate() }catch(e){}
    return res && res.data ? res.data : { text: '' }
  }

  throw new Error('tesseract.js API not found')
}

// 解析 OCR 文本，提取色号和数量
import MARD from '../colorPalettes/mard.json'

export function parseOcrText(text, { palette = MARD, fallbackCode = null } = {}){
  const t = (text || '').toUpperCase()
  // 首先构建一个在文本中可以找到的色号列表（按出现顺序）
  const foundCodes = []
  const codes = palette.filter(p=>p && p.code).map(p=>String(p.code).toUpperCase())

  // 全局正则，优先匹配像 "A6(41)", "A6 41", "A6:41" 这样的直接配对
  if (codes.length > 0){
    const alt = codes.map(c => c.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&')).join('|')
    const pairRe = new RegExp(`\\b(${alt})\\b\\s*[\:\：\(\-]?\\s*(\\d{1,5})`, 'g')
    let m
    while ((m = pairRe.exec(t)) !== null){
      const code = m[1]
      const idx = m.index
      foundCodes.push({ code, idx, matchedNumber: Number(m[2]) })
    }
  }

  // 也要记录所有色号出现的位置（用于后续在色号之后搜索数字）
  for (const p of palette){
    if (!p || !p.code) continue
    const code = String(p.code).toUpperCase()
    let startIdx = 0
    while (true){
      const idx = t.indexOf(code, startIdx)
      if (idx === -1) break
      // avoid duplicating entries already found by regex (same idx)
      if (!foundCodes.some(f => f.idx === idx && String(f.code).toUpperCase() === code)){
        foundCodes.push({ code: p.code, idx })
      }
      startIdx = idx + code.length
    }
  }

  // 为每个找到的色号，尝试在其后面抓取数字作为数量
  const pairs = []
  for (const f of foundCodes){
    let count = null
    if (typeof f.matchedNumber === 'number'){
      count = f.matchedNumber
    } else {
      const start = f.idx + String(f.code).length
      const after = t.slice(start, start + 80)
      const afterNums = (after.match(/\d+/g) || [])
      if (afterNums.length > 0) count = Number(afterNums[0])
    }
    pairs.push({ code: f.code, count: (count == null ? 0 : count) })
  }

  // 如果没有按色号找到任何数量，则全局提取数字并作为后备（选最长）
  if (pairs.length === 0){
    const t_no_codes = palette.reduce((s,p)=> p && p.code ? s.split(String(p.code).toUpperCase()).join(' ') : s, t)
    const nums = (t_no_codes.match(/\d+/g) || [])
    if (nums.length > 0){
      nums.sort((a,b)=> b.length - a.length)
      const fallbackCount = Number(nums[0])
      pairs.push({ code: fallbackCode, count: (fallbackCount == null ? 0 : fallbackCount) })
    }
  }

  // 汇总：按色号合并数量
  const aggMap = {}
  pairs.forEach((p, i) => {
    const key = String(p.code || fallbackCode || '').toUpperCase()
    if (!aggMap[key]) aggMap[key] = { code: p.code, total: 0, occurrences: [] }
    const cnt = Number(p.count) || 0
    aggMap[key].total += cnt
    aggMap[key].occurrences.push({ count: cnt, index: i })
  })
  const summary = Object.values(aggMap)

  // 向后兼容：返回第一个匹配的 code/count 作为旧接口，同时返回所有匹配和汇总
  const first = pairs.length > 0 ? pairs[0] : { code: fallbackCode, count: 0 }
  return { code: first.code, count: first.count, pairs, summary, text: text || '' }
}

export async function recognizeAndParse(input, opts = {}){
  const { parseOptions = {} } = opts
  const res = await recognizeImage(input, opts)
  const text = res && res.text ? res.text : (res && res.data && res.data.text ? res.data.text : '')
  return parseOcrText(text, parseOptions)
}
