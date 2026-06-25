import { PDFParse } from 'pdf-parse';
import fs from 'fs';

const pdfPath = new URL('../capstone\u4ea7\u54c1\u5206\u6790.pdf', import.meta.url);
try {
  const buf = fs.readFileSync(pdfPath);
  console.log('PDF file size:', buf.length, 'bytes');
  const parser = new PDFParse({ data: buf });
  const result = await parser.getText();
  console.log('OK! Text length:', result.text.length);
  console.log('First 300 chars:', result.text.substring(0, 300));
} catch(e) {
  console.error('ERROR:', e.message);
  console.error(e.stack?.split('\n').slice(0,5).join('\n'));
}
