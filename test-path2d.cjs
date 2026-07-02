// Quick test: verify Path2D polyfill fixes PDF rendering
const { createRequire } = require('module');
const _require = createRequire(require('url').pathToFileURL(__filename).href);
const fs = require('fs');

// Polyfills (same as server.js)
try {
  const geom = _require('@napi-rs/canvas/geometry');
  if (!globalThis.DOMMatrix) globalThis.DOMMatrix = geom.DOMMatrix;
  if (!globalThis.DOMPoint) globalThis.DOMPoint = geom.DOMPoint;
  if (!globalThis.DOMRect) globalThis.DOMRect = geom.DOMRect;
} catch (e) { console.log('geom fail:', e.message); }

try {
  const canvas = _require('@napi-rs/canvas');
  if (!globalThis.Path2D) globalThis.Path2D = canvas.Path2D;
  if (!globalThis.ImageData) globalThis.ImageData = canvas.ImageData;
} catch (e) { console.log('canvas fail:', e.message); }

console.log('Path2D:', typeof globalThis.Path2D);
console.log('ImageData:', typeof globalThis.ImageData);
console.log('DOMMatrix:', typeof globalThis.DOMMatrix);

async function main() {
  const { createCanvas } = _require('@napi-rs/canvas');
  const pdfjsPath = _require.resolve('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfjs = await import('file://' + pdfjsPath.replace(/\\/g, '/'));
  
  const buffer = fs.readFileSync('D:/陈昊翔/CAP/round 0.PDF');
  const CanvasFactory = {
    create(w, h) { const c = createCanvas(w, h); return { canvas: c, context: c.getContext('2d') }; },
    reset(o, w, h) { o.canvas.width = w; o.canvas.height = h; },
    destroy(o) { o.canvas.width = 0; o.canvas.height = 0; },
  };
  
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true,
    canvasFactory: CanvasFactory,
  }).promise;
  
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 2.0 });
  const cobj = CanvasFactory.create(viewport.width, viewport.height);
  await page.render({ canvasContext: cobj.context, viewport }).promise;
  console.log('Page 1 rendered successfully! Size:', cobj.canvas.width, 'x', cobj.canvas.height);
  
  // Also test OCR on page 1
  const Tesseract = require('tesseract.js');
  const worker = await Tesseract.createWorker('eng');
  const pngBuf = cobj.canvas.toBuffer('image/png');
  const result = await worker.recognize(pngBuf);
  console.log('OCR text length:', result.data.text.length);
  console.log('First 200 chars:', result.data.text.substring(0, 200));
  await worker.terminate();
}
main().catch(e => console.error('ERROR:', e.message, e.stack));
