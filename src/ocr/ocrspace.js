// OCR.Space simple client wrapper
// 支持：从本地文件或远程 URL 调用 OCR.Space REST API，默认 language=eng
import fs from 'fs'

const API_ENDPOINT_FILE = 'https://api.ocr.space/parse/image'
const API_ENDPOINT_URL = 'https://api.ocr.space/parse/imageurl'

async function _fetch(...args){
  if (typeof fetch === 'function') return fetch(...args)
  // try dynamic import of node-fetch for older node
  try{
    const mod = await import('node-fetch')
    return mod.default(...args)
  }catch(e){
    throw new Error('fetch not available; install node-fetch or use Node 18+')
  }
}

export async function parseImageFile(filePath, { apiKey = process.env.OCRSPACE_API_KEY || 'helloworld', language = 'eng' } = {}){
  const FormData = globalThis.FormData || (await import('form-data')).default
  const form = new FormData()
  form.append('apikey', apiKey)
  form.append('language', language)
  form.append('file', fs.createReadStream(filePath))
  // restrict to English/digits/symbols via post-process; OCR.Space doesn't support char whitelist reliably
  const res = await _fetch(API_ENDPOINT_FILE, { method: 'POST', body: form })
  const json = await res.json()
  return json
}

export async function parseImageUrl(url, { apiKey = process.env.OCRSPACE_API_KEY || 'helloworld', language = 'eng' } = {}){
  const body = new URLSearchParams()
  body.append('apikey', apiKey)
  body.append('language', language)
  body.append('url', url)
  const res = await _fetch(API_ENDPOINT_URL, { method: 'POST', body })
  const json = await res.json()
  return json
}

export function extractParsedText(apiResponse){
  if (!apiResponse) return ''
  const results = apiResponse.ParsedResults
  if (!results || results.length === 0) return ''
  return results.map(r=>r.ParsedText||'').join('\n')
}

export default { parseImageFile, parseImageUrl, extractParsedText }
