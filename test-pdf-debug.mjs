import { PDFParse } from 'pdf-parse';
import fs from 'fs';

const pdfPath = 'D:/Data/Chen.haoxiang/Desktop/有用/CAP/capsim/round 0.PDF';

console.log('读取文件...');
const buffer = fs.readFileSync(pdfPath);
console.log('文件大小:', buffer.length, 'bytes');

console.log('\n尝试解析 PDF...');
try {
  const parser = new PDFParse({ data: buffer });
  console.log('PDFParse 实例创建成功');
  
  const result = await parser.getText();
  console.log('解析成功！');
  console.log('文本长度:', result.text.length);
  console.log('前500字符:\n', result.text.substring(0, 500));
  
  await parser.destroy();
} catch (e) {
  console.error('错误:', e.message);
  console.error('错误类型:', e.constructor.name);
  console.error('完整错误:', e);
}
