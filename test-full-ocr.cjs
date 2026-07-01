// Full OCR test for all 9 pages
const fs = require('fs');
const path = require('path');

// Polyfill
const geom = require('@napi-rs/canvas/geometry');
if (!globalThis.DOMMatrix) globalThis.DOMMatrix = geom.DOMMatrix;
if (!globalThis.DOMPoint) globalThis.DOMPoint = geom.DOMPoint;
if (!globalThis.DOMRect) globalThis.DOMRect = geom.DOMRect;

async function main() {
  const buffer = fs.readFileSync('D:/陈昊翔/CAP/round 0.PDF');
  console.log('File size:', buffer.length, 'bytes');

  // Step 1: Try pdf-parse
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  console.log('pdf-parse text length:', (result.text || '').trim().length);

  if ((result.text || '').trim().length < 100) {
    console.log('Falling back to OCR...');

    // Step 2: OCR
    const { createCanvas } = require('@napi-rs/canvas');
    const pdfjsPath = require.resolve('pdfjs-dist/legacy/build/pdf.mjs');
    const pdfjs = await import('file://' + pdfjsPath.split(path.sep).join('/'));

    const CanvasFactory = {
      create(w, h) {
        const c = createCanvas(w, h);
        return { canvas: c, context: c.getContext('2d') };
      },
      reset(o, w, h) { o.canvas.width = w; o.canvas.height = h; },
      destroy(o) { o.canvas.width = 0; o.canvas.height = 0; },
    };

    const doc = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
      canvasFactory: CanvasFactory,
    }).promise;

    console.log('PDF pages:', doc.numPages);

    const Tesseract = require('tesseract.js');
    const worker = await Tesseract.createWorker('eng');

    let allText = '';
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 });
      const cobj = CanvasFactory.create(viewport.width, viewport.height);
      await page.render({ canvasContext: cobj.context, viewport }).promise;
      const pngBuf = cobj.canvas.toBuffer('image/png');
      const ocrResult = await worker.recognize(pngBuf);
      const pageText = ocrResult.data.text;
      allText += pageText + '\n\n--- Page ' + i + ' ---\n\n';
      console.log('Page ' + i + ': ' + pageText.length + ' chars');
    }
    await worker.terminate();

    console.log('\n=== Total OCR text length:', allText.length, '===');
    console.log('\n=== First 3000 chars ===');
    console.log(allText.substring(0, 3000));

    // Save to file for review
    fs.writeFileSync('D:/陈昊翔/CAP/round0-ocr.txt', allText);
    console.log('\nSaved to round0-ocr.txt');
  }
}
main().catch(e => { console.error('ERROR:', e.message); console.error(e.stack); });
