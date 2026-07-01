import { createRequire } from "module";

const require = createRequire(import.meta.url);

// Test polyfill
try {
  const geom = require("@napi-rs/canvas/geometry");
  console.log("✅ geometry.js loaded successfully");
  console.log("  DOMMatrix:", typeof geom.DOMMatrix);
  console.log("  DOMPoint:", typeof geom.DOMPoint);
  console.log("  DOMRect:", typeof geom.DOMRect);

  if (!globalThis.DOMMatrix) globalThis.DOMMatrix = geom.DOMMatrix;
  if (!globalThis.DOMPoint) globalThis.DOMPoint = geom.DOMPoint;
  if (!globalThis.DOMRect) globalThis.DOMRect = geom.DOMRect;

  console.log("  globalThis.DOMMatrix:", typeof globalThis.DOMMatrix);
} catch (e) {
  console.error("❌ Failed to load geometry:", e.message);
  process.exit(1);
}

// Test pdf-parse
console.log("\nLoading pdf-parse...");
try {
  const { PDFParse } = await import("pdf-parse");
  console.log("✅ pdf-parse loaded, PDFParse:", typeof PDFParse);

  // Test with the PDF file
  const fs = await import("fs");
  const pdfPath = "C:/Users/ADMIN/Documents/WeChat Files/wxid_fgygar1275ms22/FileStorage/File/2026-01/陈昊翔-财务专员-SAP经验.pdf";

  if (fs.existsSync(pdfPath)) {
    console.log("📄 Found test PDF, attempting to parse...");
    const buffer = fs.readFileSync(pdfPath);
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    console.log("✅ PDF parsed successfully!");
    console.log("  Text length:", result.text?.length || 0, "chars");
    console.log("  First 200 chars:", result.text?.substring(0, 200));
  } else {
    console.log("⚠️ No test PDF found at expected path");
    // Just test that we can create a PDFParse instance
    const parser = new PDFParse({ data: Buffer.from("%PDF-1.4") });
    console.log("✅ PDFParse instance created without DOMMatrix error");
  }
} catch (e) {
  console.error("❌ Error:", e.message);
  if (e.stack) console.error(e.stack.split("\n").slice(0, 5).join("\n"));
}
