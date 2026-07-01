// Test PDF -> Canvas -> OCR pipeline
const fs = require('fs');
const path = require('path');
const { createCanvas } = require('@napi-rs/canvas');

async function main() {
  // Load pdfjs-dist
  const pdfjsPath = require.resolve('pdfjs-dist/build/pdf.mjs');
  console.log('pdfjs-dist path:', pdfjsPath);
  const pdfjs = await import('file://' + pdfjsPath.split(path.sep).join('/'));

  // Load the PDF
  const buffer = fs.readFileSync('D:/陈昊翔/CAP/round 0.PDF');
  const data = new Uint8Array(buffer);

  // Create a canvas factory using @napi-rs/canvas
  const CanvasFactory = {
    create(width, height) {
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');
      return { canvas, context: ctx };
    },
    reset(o, width, height) {
      o.canvas.width = width;
      o.canvas.height = height;
    },
    destroy(o) {
      o.canvas.width = 0;
      o.canvas.height = 0;
    }
  };

  const loadingTask = pdfjs.getDocument({
    data,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
    canvasFactory: CanvasFactory,
  });

  const doc = await loadingTask.promise;
  console.log('Pages:', doc.numPages);

  // Render page 1
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 2.0 });
  console.log('Viewport:', viewport.width, 'x', viewport.height);

  const canvasObj = CanvasFactory.create(viewport.width, viewport.height);
  const renderContext = {
    canvasContext: canvasObj.context,
    viewport: viewport,
  };

  await page.render(renderContext).promise;
  console.log('Page rendered!');

  // Save as PNG to verify
  const pngBuffer = canvasObj.canvas.toBuffer('image/png');
  fs.writeFileSync('D:/陈昊翔/CAP/test-page1.png', pngBuffer);
  console.log('Saved test-page1.png, size:', pngBuffer.length, 'bytes');

  // Now OCR it
  console.log('Starting OCR...');
  const Tesseract = require('tesseract.js');
  const worker = await Tesseract.createWorker('eng');
  const result = await worker.recognize('D:/陈昊翔/CAP/test-page1.png');
  console.log('OCR result length:', result.data.text.length);
  console.log('First 1500 chars:');
  console.log(result.data.text.substring(0, 1500));
  await worker.terminate();
}

main().catch(e => { console.error('ERROR:', e.message); console.error(e.stack); });
