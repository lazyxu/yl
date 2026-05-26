const path = require('path')
const Jimp = require('jimp')
const { parseOcrText } = require('../src/ocr/recognize')

jest.setTimeout(45000)
const RECOGNIZE_TIMEOUT_MS = 15000

function withTimeout(promiseOrFn, ms, onTimeout) {
  return new Promise((resolve, reject) => {
    let finished = false
    const to = setTimeout(() => {
      if (finished) return
      finished = true
      try { if (typeof onTimeout === 'function') onTimeout() } catch (e) {}
      reject(new Error(`OCR 操作超时：${ms}ms`))
    }, ms)

    try {
      const p = (typeof promiseOrFn === 'function') ? promiseOrFn() : promiseOrFn
      if (p && typeof p.then === 'function'){
        p.then(result => { if (finished) return; finished = true; clearTimeout(to); resolve(result) }).catch(err => { if (finished) return; finished = true; clearTimeout(to); reject(err) })
      } else {
        if (finished) return
        finished = true
        clearTimeout(to)
        resolve(p)
      }
    } catch (err) {
      if (finished) return
      finished = true
      clearTimeout(to)
      reject(err)
    }
  })
}

describe('从样例图片识别色号与数量（集成）', () => {
  test('test/微信图片_20260521114102_9462_1.jpg 应识别到 A6 和 41', async () => {
    const imagePath = path.resolve(__dirname, '微信图片_20260521114102_9462_1.jpg')

    async function preprocessImage(p) {
      const img = await Jimp.read(p)
      const targetWidth = Math.max(img.bitmap.width * 1.2, 800)
      img.resize(targetWidth, Jimp.AUTO)
      img.greyscale()
      try{
        const cropRatio = 0.25
        const cropH = Math.max(80, Math.floor(img.bitmap.height * cropRatio))
        img.crop(0, img.bitmap.height - cropH, img.bitmap.width, cropH)
      }catch(e){}
      try{ img.threshold({ max: 150 }); }catch(e){}
      return await img.getBufferAsync(Jimp.MIME_JPEG)
    }

    const preprocessedBuffer = await preprocessImage(imagePath)
    const mod = require('tesseract.js')
    let text = ''
    try{
      if (typeof mod.recognize === 'function'){
        const opts = { logger: m => {}, tessedit_pageseg_mode: 6, tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789' }
        const res = await withTimeout(() => mod.recognize(preprocessedBuffer, 'eng', opts), RECOGNIZE_TIMEOUT_MS, () => {})
        text = res && res.data && res.data.text ? res.data.text : ''
      } else {
        throw new Error('tesseract.js 模块不包含 top-level recognize')
      }
    } finally {}

    const parsed = parseOcrText(text)
    console.log('识别并解析：', parsed)

    // 断言 parsed.pairs 包含若干已知条目
    const has = (code, cnt) => parsed.pairs && parsed.pairs.some(p => String(p.code).toUpperCase() === String(code).toUpperCase() && Number(p.count) === Number(cnt))
    
    expect(has('A6', 41)).toBe(true)
    expect(has('A17', 31)).toBe(true)
    expect(has('C3', 84)).toBe(true)
    expect(has('C5', 107)).toBe(true)
    expect(has('C6', 375)).toBe(true)
    expect(has('C7', 413)).toBe(true)
    expect(has('C8', 111)).toBe(true)
    expect(has('C13', 126)).toBe(true)
    expect(has('C20', 122)).toBe(true)
    expect(has('C24', 593)).toBe(true)
    expect(has('C28', 287)).toBe(true)
    expect(has('D1', 30)).toBe(true)
    expect(has('D17', 141)).toBe(true)
    expect(has('D23', 182)).toBe(true)
    expect(has('E8', 12)).toBe(true)
    expect(has('H2', 696)).toBe(true)
  })
})
