const path = require('path');

jest.setTimeout(300000); // increase timeout for OCR

describe('OCR 识别用例', () => {
  test('识别 test/微信图片_20260521114102_9462_1.jpg 中的色号与数量', async () => {
    const imagePath = path.resolve(__dirname, '微信图片_20260521114102_9462_1.jpg');
    const mod = await import('tesseract.js');
    // try worker API first, fall back to top-level recognize
    let text = '';
    const creator = mod.createWorker || (mod.default && mod.default.createWorker) || (mod.default && mod.default) || mod;
    if (typeof creator === 'function'){
      // try create worker
      const maybeWorker = creator({ logger: m => {} });
      if (maybeWorker && typeof maybeWorker.load === 'function'){
        const worker = maybeWorker;
        await worker.load();
        await worker.loadLanguage('eng');
        await worker.initialize('eng');
        try { await worker.setParameters({ tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789' }); }catch(e){}
        const res = await worker.recognize(imagePath);
        text = res && res.data && res.data.text ? res.data.text : '';
        await worker.terminate();
      } else if (typeof mod.recognize === 'function'){
        // fallback
        const res = await mod.recognize(imagePath, 'eng', { logger: m => {} });
        text = res && res.data && res.data.text ? res.data.text : '';
      } else {
        throw new Error('无法初始化 tesseract worker 或 recognize 函数不可用')
      }
    } else if (typeof mod.recognize === 'function'){
      const res = await mod.recognize(imagePath, 'eng', { logger: m => {} });
      text = res && res.data && res.data.text ? res.data.text : '';
    } else {
      throw new Error('tesseract.js 模块不包含可用的 createWorker 或 recognize API')
    }

    const upper = (text || '').toUpperCase();
    console.log('OCR TEXT SNIPPET:', upper.slice(0, 500));

    // 检查是否包含色号 A6 和 数量 41（底部统计区域显示 A6 (41)）
    const hasA6 = /\bA6\b/.test(upper);
    const has41 = /\b41\b/.test(upper);

    expect(hasA6).toBe(true);
    expect(has41).toBe(true);
  });
});
