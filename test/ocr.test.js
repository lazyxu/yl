const path = require('path');
const Jimp = require('jimp');

// 给 OCR 测试较长的总体超时（预处理 + 多配置识别可能比较慢）
// 缩短总体超时并使用较短的识别超时
jest.setTimeout(45000); // 45s overall test timeout
const RECOGNIZE_TIMEOUT_MS = 15000; // 15s per recognize operation

function withTimeout(promiseOrFn, ms, onTimeout) {
  return new Promise((resolve, reject) => {
    let finished = false;
    const to = setTimeout(() => {
      if (finished) return;
      finished = true;
      try { if (typeof onTimeout === 'function') onTimeout(); } catch (e) {}
      reject(new Error(`OCR 操作超时：${ms}ms`));
    }, ms);

    try {
      const p = (typeof promiseOrFn === 'function') ? promiseOrFn() : promiseOrFn;
      if (p && typeof p.then === 'function'){
        p.then(result => {
          if (finished) return;
          finished = true;
          clearTimeout(to);
          resolve(result);
        }).catch(err => {
          if (finished) return;
          finished = true;
          clearTimeout(to);
          reject(err);
        });
      } else {
        // non-promise return (sync); resolve immediately
        if (finished) return;
        finished = true;
        clearTimeout(to);
        resolve(p);
      }
    } catch (err) {
      if (finished) return;
      finished = true;
      clearTimeout(to);
      reject(err);
    }
  });
}

describe('OCR 识别用例', () => {
  test('识别 test/微信图片_20260521114102_9462_1.jpg 中的色号与数量', async () => {
    const imagePath = path.resolve(__dirname, '微信图片_20260521114102_9462_1.jpg');

    // 简化预处理以节省时间：轻微放大、灰度、阈值化，并裁剪底部 ROI
    async function preprocessImage(p) {
      const img = await Jimp.read(p);
      const targetWidth = Math.max(img.bitmap.width * 1.2, 800);
      img.resize(targetWidth, Jimp.AUTO);
      img.greyscale();
      // 裁剪底部 ROI（统计区域通常在图片底部）
      try{
        const cropRatio = 0.25; // 裁剪底部 25%
        const cropH = Math.max(80, Math.floor(img.bitmap.height * cropRatio));
        img.crop(0, img.bitmap.height - cropH, img.bitmap.width, cropH);
      }catch(e){}
      // 快速二值化
      try{ img.threshold({ max: 150 }); }catch(e){}
      return await img.getBufferAsync(Jimp.MIME_JPEG);
    }

    const preprocessedBuffer = await preprocessImage(imagePath);
    const mod = require('tesseract.js');
    // 使用单一轻量识别配置：psm=6 + whitelist，优先 top-level recognize
    let text = '';
    try{
      if (typeof mod.recognize === 'function'){
        const opts = { logger: m => {}, tessedit_pageseg_mode: 6, tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789' };
        const res = await withTimeout(() => mod.recognize(preprocessedBuffer, 'eng', opts), RECOGNIZE_TIMEOUT_MS, () => {});
        text = res && res.data && res.data.text ? res.data.text : '';
      } else {
        throw new Error('tesseract.js 模块不包含 top-level recognize');
      }
    } finally {
      // nothing to terminate when using top-level recognize
    }

    const upper = (text || '').toUpperCase();

    console.log('OCR 识别结果：', upper);
    // 检查是否包含色号 A6 和 数量 41（底部统计区域显示 A6 (41)）
    const hasA6 = /\bA6\b/.test(upper);
    const has41 = /\b41\b/.test(upper);

    expect(hasA6).toBe(true);
    expect(has41).toBe(true);
  });
});
