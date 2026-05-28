import { parseOcrText } from '../src/ocr/recognize'

describe('parseOcrText', () => {
  test('从简单文本提取色号和数量', () => {
    const text = 'Some header\nA6 (41)\nfooter'
    const res = parseOcrText(text)
    expect(res.code).toBe('A6')
    expect(res.count).toBe(41)
  })

  test('大小写与噪声文本中识别色号', () => {
    const text = '... a6 abc 41 more text'
    const res = parseOcrText(text)
    expect(res.code).toBe('A6')
    expect(res.count).toBe(41)
  })

  test('无色号时使用后备值', () => {
    const text = 'no code here 12'
    const res = parseOcrText(text, { fallbackCode: 'ZZ' })
    expect(res.code).toBe('ZZ')
    expect(res.count).toBe(12)
  })

  test('无数字时 count 为 0', () => {
    const text = 'contains A6 but no numbers'
    const res = parseOcrText(text)
    expect(res.code).toBe('A6')
    expect(res.count).toBe(0)
  })

  test('按色号汇总并支持多种格式', () => {
    const text = 'Header\nA6(41) some text\nC24:24 other\nA6 9 end'
    const res = parseOcrText(text)
    // pairs 包含两次 A6，汇总后 A6 total = 50
    const a6 = (res.summary || []).find(s => String(s.code).toUpperCase() === 'A6')
    const c24 = (res.summary || []).find(s => String(s.code).toUpperCase() === 'C24')
    expect(a6).toBeDefined()
    expect(a6.total).toBe(50)
    expect(c24).toBeDefined()
    expect(c24.total).toBe(24)
  })
})
