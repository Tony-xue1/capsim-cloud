import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import fs from "fs";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cors from "cors";

// ──────────────────────────────────────────────────────────────
// Polyfill browser APIs (DOMMatrix, DOMPoint, DOMRect, Path2D, ImageData) for pdfjs-dist
// pdf-parse v2 uses pdfjs-dist v5 which requires these in Node.js
// @napi-rs/canvas/geometry is pure JS (no native binding needed)
// ──────────────────────────────────────────────────────────────
const _require = createRequire(import.meta.url);
try {
  const geom = _require("@napi-rs/canvas/geometry");
  if (!globalThis.DOMMatrix) globalThis.DOMMatrix = geom.DOMMatrix;
  if (!globalThis.DOMPoint) globalThis.DOMPoint = geom.DOMPoint;
  if (!globalThis.DOMRect) globalThis.DOMRect = geom.DOMRect;
} catch (e) {
  console.warn("[polyfill] Failed to load geometry from @napi-rs/canvas:", e.message);
  // Minimal fallback polyfill
  if (!globalThis.DOMMatrix) {
    globalThis.DOMMatrix = class DOMMatrix {
      constructor(init) {
        if (typeof init === "string") {
          const m = init.match(/matrix\(([^)]+)\)/);
          if (m) init = m[1].split(",").map(parseFloat);
        }
        const a = Array.isArray(init) ? init : [1,0,0,1,0,0];
        this.a = a[0] ?? 1; this.b = a[1] ?? 0;
        this.c = a[2] ?? 0; this.d = a[3] ?? 1;
        this.e = a[4] ?? 0; this.f = a[5] ?? 0;
        this.m11 = this.a; this.m12 = this.b; this.m21 = this.c; this.m22 = this.d;
        this.m41 = this.e; this.m42 = this.f;
        this.is2D = true;
      }
      multiply(other) { return new globalThis.DOMMatrix([this.a*other.a+this.c*other.b, this.b*other.a+this.d*other.b, this.a*other.c+this.c*other.d, this.b*other.c+this.d*other.d, this.a*other.e+this.c*other.f+this.e, this.b*other.e+this.d*other.f+this.f]); }
      invertSelf() { const det = this.a*this.d - this.b*this.c; const ia = this.d/det, ib = -this.b/det, ic = -this.c/det, id = this.a/det, ie = (this.c*this.f - this.d*this.e)/det, iff = (this.b*this.e - this.a*this.f)/det; this.a=ia; this.b=ib; this.c=ic; this.d=id; this.e=ie; this.f=iff; this.m11=ia; this.m12=ib; this.m21=ic; this.m22=id; this.m41=ie; this.m42=iff; return this; }
      preMultiplySelf(other) { return this.multiply(other); }
      translate(tx, ty) { return new globalThis.DOMMatrix([this.a, this.b, this.c, this.d, this.e + tx*this.a + ty*this.c, this.f + tx*this.b + ty*this.d]); }
      scale(sx, sy) { sy = sy ?? sx; return new globalThis.DOMMatrix([this.a*sx, this.b*sx, this.c*sy, this.d*sy, this.e, this.f]); }
    };
  }
}

// Path2D 和 ImageData polyfill（pdfjs-dist 渲染 PDF 页面时需要）
try {
  const canvas = _require("@napi-rs/canvas");
  if (!globalThis.Path2D) globalThis.Path2D = canvas.Path2D;
  if (!globalThis.ImageData) globalThis.ImageData = canvas.ImageData;
} catch (e) {
  console.warn("[polyfill] Failed to load Path2D/ImageData from @napi-rs/canvas:", e.message);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8080;
const IS_VERCEL = !!process.env.VERCEL;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex");
const JWT_EXPIRES = "7d";

// ──────────────────────────────────────────────────────────────
// API Key
// ──────────────────────────────────────────────────────────────
function loadApiKey() {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY;
  try {
    const cfgPath = path.join(__dirname, "config.json");
    if (fs.existsSync(cfgPath)) {
      return JSON.parse(fs.readFileSync(cfgPath, "utf8")).apiKey || null;
    }
  } catch {}
  return null;
}

// ──────────────────────────────────────────────────────────────
// 数据库层（纯 JS 实现，无任何 WebAssembly / 原生模块依赖）
// Vercel → 内存 Map（进程内，重启后重置，但登录 token 仍有效直到过期）
// 本地   → JSON 文件持久化（data/users.json）
// ──────────────────────────────────────────────────────────────
let dbGet, dbAll, dbRun;

// ── 用户数据库（纯 JS Map，零第三方依赖）────────────────────
// 提供与原来相同的 dbGet / dbAll / dbRun 接口
function buildDb(adminPwd) {
  const users = new Map();   // id → user object
  let nextId = 1;

  // 写入 admin 账号
  const adminHash = bcrypt.hashSync(adminPwd, 10);
  users.set(nextId, {
    id: nextId, username: "admin",
    password_hash: adminHash, role: "admin",
    created_at: new Date().toISOString()
  });
  nextId++;

  function findById(id)   { return users.get(parseInt(id)) || null; }
  function findByName(nm) { for (const u of users.values()) if (u.username === nm) return u; return null; }

  dbGet = (sql, params = []) => {
    const s = sql.toLowerCase();
    if (/where id\s*=/.test(s))       return findById(params[0]);
    if (/where username\s*=/.test(s)) return findByName(params[0]);
    if (/count/.test(s) && /role\s*=/.test(s)) {
      let c = 0; for (const u of users.values()) if (u.role === params[0]) c++;
      return { cnt: c };
    }
    if (/count/.test(s)) return { cnt: users.size };
    return null;
  };

  dbAll = () => Array.from(users.values()).sort((a, b) => a.id - b.id);

  dbRun = (sql, params = []) => {
    const s = sql.trim().toUpperCase();
    if (s.startsWith("INSERT")) {
      const [username, password_hash, role] = params;
      const id = nextId++;
      users.set(id, { id, username, password_hash, role, created_at: new Date().toISOString() });
      return { lastInsertRowid: id };
    }
    if (s.startsWith("UPDATE")) {
      const u = findById(params[1]);
      if (u) u.password_hash = params[0];
      return {};
    }
    if (s.startsWith("DELETE")) {
      users.delete(parseInt(params[0]));
      return {};
    }
    return {};
  };

  return users; // 供 JSON 持久化使用
}

// ── JSON 文件持久化封装（仅本地模式）────────────────────────
function wrapWithJsonPersist(users, dbPath) {
  const origRun = dbRun;
  dbRun = (sql, params = []) => {
    const result = origRun(sql, params);
    try {
      const arr = Array.from(users.values());
      fs.writeFileSync(dbPath, JSON.stringify(arr, null, 2), "utf8");
    } catch (e) { console.warn("DB save warn:", e.message); }
    return result;
  };
}

async function initDb() {
  const adminPwd = process.env.ADMIN_PASSWORD || "admin123";

  if (IS_VERCEL) {
    // ── Vercel 内存模式 ──────────────────────────────────
    buildDb(adminPwd);
    console.log("Vercel mode: memory DB ready. admin / " + adminPwd);

  } else {
    // ── 本地 JSON 文件模式 ────────────────────────────────
    const DB_PATH = path.join(__dirname, "data", "users.json");
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

    const users = buildDb(adminPwd); // 先初始化（含默认 admin）

    if (fs.existsSync(DB_PATH)) {
      // 从文件恢复用户数据
      try {
        const saved = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
        users.clear();
        let maxId = 0;
        for (const u of saved) {
          users.set(u.id, u);
          if (u.id > maxId) maxId = u.id;
        }
        // 修正 nextId（通过重新绑定 dbRun 闭包中的计数器是复杂的，
        // 这里采用临时方案：在 dbRun 中用 map size+1 计算 id）
        const origRun = dbRun;
        let counter = maxId + 1;
        dbRun = (sql, params = []) => {
          const s = sql.trim().toUpperCase();
          if (s.startsWith("INSERT")) {
            const [username, password_hash, role] = params;
            const id = counter++;
            users.set(id, { id, username, password_hash, role, created_at: new Date().toISOString() });
            return { lastInsertRowid: id };
          }
          return origRun(sql, params);
        };
        console.log("Local mode: loaded " + saved.length + " users from " + DB_PATH);
      } catch (e) {
        console.warn("Failed to load DB file, using fresh DB:", e.message);
      }
    }

    wrapWithJsonPersist(users, DB_PATH);
    // 写入初始文件（如果是新建）
    if (!fs.existsSync(DB_PATH)) {
      fs.writeFileSync(DB_PATH, JSON.stringify(Array.from(users.values()), null, 2), "utf8");
      console.log("Local mode: created new DB at " + DB_PATH);
    }
  }

  console.log("DB ready. mode=" + (IS_VERCEL ? "memory(vercel)" : "json-file(local)"));
}



// ──────────────────────────────────────────────────────────────
// Express 中间件
// ──────────────────────────────────────────────────────────────
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(express.static(path.join(__dirname, "public")));

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return res.status(401).json({ error: "未登录，请先登录" });
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "登录已过期，请重新登录" });
  }
}
function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "需要管理员权限" });
  next();
}

// ──────────────────────────────────────────────────────────────
// 认证 API
// ──────────────────────────────────────────────────────────────
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "请输入用户名和密码" });
  const user = dbGet("SELECT * FROM users WHERE username = ?", [username]);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "用户名或密码错误" });
  }
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET, { expiresIn: JWT_EXPIRES }
  );
  res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
});

app.get("/api/auth/me", authenticate, (req, res) => {
  const user = dbGet("SELECT id, username, role, created_at FROM users WHERE id = ?", [req.user.id]);
  if (!user) return res.status(404).json({ error: "用户不存在" });
  res.json({ user });
});

// ──────────────────────────────────────────────────────────────
// 用户管理 API（管理员）
// ──────────────────────────────────────────────────────────────
app.get("/api/users", authenticate, requireAdmin, (req, res) => {
  const users = dbAll("SELECT id, username, role, created_at FROM users ORDER BY id ASC");
  res.json({ users });
});

app.post("/api/users", authenticate, requireAdmin, (req, res) => {
  const { username, password, role = "member" } = req.body;
  if (!username || !password) return res.status(400).json({ error: "用户名和密码不能为空" });
  if (password.length < 6) return res.status(400).json({ error: "密码长度至少6位" });
  if (!["admin", "member"].includes(role)) return res.status(400).json({ error: "角色只能是 admin 或 member" });
  const existing = dbGet("SELECT id FROM users WHERE username = ?", [username]);
  if (existing) return res.status(409).json({ error: "用户名已存在" });
  const hash = bcrypt.hashSync(password, 10);
  const result = dbRun("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)", [username, hash, role]);
  res.json({ message: "用户创建成功", userId: result.lastInsertRowid });
});

app.delete("/api/users/:id", authenticate, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: "不能删除自己的账户" });
  const user = dbGet("SELECT * FROM users WHERE id = ?", [id]);
  if (!user) return res.status(404).json({ error: "用户不存在" });
  const adminCount = dbGet("SELECT COUNT(*) as cnt FROM users WHERE role = ?", ["admin"]);
  if (user.role === "admin" && adminCount?.cnt <= 1) {
    return res.status(400).json({ error: "至少保留一个管理员账户" });
  }
  dbRun("DELETE FROM users WHERE id = ?", [id]);
  res.json({ message: "用户已删除" });
});

app.put("/api/users/password", authenticate, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) return res.status(400).json({ error: "请填写旧密码和新密码" });
  if (newPassword.length < 6) return res.status(400).json({ error: "新密码长度至少6位" });
  const user = dbGet("SELECT * FROM users WHERE id = ?", [req.user.id]);
  if (!user || !bcrypt.compareSync(oldPassword, user.password_hash)) {
    return res.status(401).json({ error: "旧密码错误" });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  dbRun("UPDATE users SET password_hash = ? WHERE id = ?", [hash, req.user.id]);
  res.json({ message: "密码修改成功" });
});

// ──────────────────────────────────────────────────────────────
// PDF 解析（含 OCR 回退）
// ──────────────────────────────────────────────────────────────

// OCR 回退：当 PDF 文字提取失败（矢量图形/扫描件）时，渲染为图片再 OCR
async function extractPdfWithOCR(buffer) {
  const { createCanvas } = _require("@napi-rs/canvas");
  const pdfjsPath = _require.resolve("pdfjs-dist/legacy/build/pdf.mjs");
  const pdfjs = await import("file://" + pdfjsPath.replace(/\\/g, "/"));

  const CanvasFactory = {
    create(w, h) {
      const c = createCanvas(w, h);
      return { canvas: c, context: c.getContext("2d") };
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

  const Tesseract = _require("tesseract.js");
  const worker = await Tesseract.createWorker("eng");

  let allText = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 });
    const cobj = CanvasFactory.create(viewport.width, viewport.height);
    await page.render({ canvasContext: cobj.context, viewport }).promise;
    const pngBuf = cobj.canvas.toBuffer("image/png");
    const result = await worker.recognize(pngBuf);
    allText += result.data.text + "\n\n--- Page " + i + " ---\n\n";
    console.log(`[OCR] Page ${i}/${doc.numPages}: ${result.data.text.length} chars`);
  }
  await worker.terminate();
  return allText;
}

async function extractPdfText(buffer) {
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    const text = result.text || "";
    // 如果提取的文字少于 500 字符，或大部分是页码标记（如 "-- 1 of 9 --"），则使用 OCR
    const cleanText = text.replace(/--\s*\d+\s*of\s*\d+\s*--/g, "").trim();
    if (cleanText.length < 500) {
      // 文字提取不足，使用 OCR 回退
      console.log("[PDF] Text extraction yielded " + text.trim().length + " chars, falling back to OCR...");
      try {
        const ocrText = await extractPdfWithOCR(buffer);
        if (ocrText.trim().length > 100) {
          console.log("[PDF] OCR extracted " + ocrText.length + " chars total");
          return { text: ocrText, ocr: true };
        }
        return { error: "PDF 文字内容过少，OCR 也未能提取足够文字。", type: "IMAGE_PDF" };
      } catch (ocrErr) {
        console.error("[PDF] OCR fallback failed:", ocrErr.message);
        return { error: "PDF 文字内容过少，OCR 回退失败：" + ocrErr.message, type: "IMAGE_PDF" };
      }
    }
    return { text };
  } catch (e) {
    // pdf-parse 完全失败，也尝试 OCR
    console.log("[PDF] parse failed (" + e.message + "), trying OCR...");
    try {
      const ocrText = await extractPdfWithOCR(buffer);
      if (ocrText.trim().length > 100) {
        return { text: ocrText, ocr: true };
      }
    } catch (ocrErr) {
      // OCR also failed
    }
    return { error: "PDF 解析失败：" + e.message, type: "PARSE_ERROR" };
  }
}

app.post("/api/upload", authenticate, async (req, res) => {
  try {
    await new Promise((resolve, reject) => {
      upload.single("report")(req, res, err => err ? reject(err) : resolve());
    });
  } catch (err) {
    return res.status(400).json({ error: "文件上传失败：" + err.message });
  }
  if (!req.file) return res.status(400).json({ error: "请上传 PDF 文件" });
  const result = await extractPdfText(req.file.buffer);
  if (result.error) return res.status(400).json({ error: result.error, type: result.type });
  res.json({ text: result.text, filename: req.file.originalname, ocr: !!result.ocr });
});

// ──────────────────────────────────────────────────────────────
// Capsim 分析核心
// ──────────────────────────────────────────────────────────────
const SEGMENT_CENTERS = {
  0: { Traditional:[5.0,15.0], LowEnd:[2.5,17.5], HighEnd:[7.5,12.5], Performance:[8.0,17.0], Size:[3.0,12.0] },
  1: { Traditional:[5.7,14.3], LowEnd:[3.0,17.0], HighEnd:[8.4,11.6], Performance:[9.0,16.3], Size:[3.7,11.0] },
  2: { Traditional:[6.4,13.6], LowEnd:[3.5,16.5], HighEnd:[9.3,10.7], Performance:[10.0,15.6], Size:[4.4,10.0] },
  3: { Traditional:[7.1,12.9], LowEnd:[4.0,16.0], HighEnd:[10.2,9.8], Performance:[11.0,14.9], Size:[5.1,9.0] },
  4: { Traditional:[7.8,12.2], LowEnd:[4.5,15.5], HighEnd:[11.1,8.9], Performance:[12.0,14.2], Size:[5.8,8.0] },
  5: { Traditional:[8.5,11.5], LowEnd:[5.0,15.0], HighEnd:[12.0,8.0], Performance:[13.0,13.5], Size:[6.5,7.0] },
  6: { Traditional:[9.2,10.8], LowEnd:[5.5,14.5], HighEnd:[12.9,7.1], Performance:[14.0,12.8], Size:[7.2,6.0] },
  7: { Traditional:[9.9,10.1], LowEnd:[6.0,14.0], HighEnd:[13.8,6.2], Performance:[15.0,12.1], Size:[7.9,5.0] },
  8: { Traditional:[10.6,9.4], LowEnd:[6.5,13.5], HighEnd:[14.7,5.3], Performance:[16.0,11.4], Size:[8.6,4.0] },
};
const IDEAL_OFFSETS = {
  Traditional:[0.0,0.0], LowEnd:[-0.8,0.8], HighEnd:[1.4,-1.4], Performance:[1.4,-1.0], Size:[1.0,-1.4],
};

function getIdealPoint(seg, round) {
  const r = Math.min(Math.max(parseInt(round)||0,0),8);
  const c = SEGMENT_CENTERS[r]?.[seg];
  const o = IDEAL_OFFSETS[seg];
  if (!c||!o) return null;
  return { pfmn:+(c[0]+o[0]).toFixed(1), size:+(c[1]+o[1]).toFixed(1) };
}

function buildRdTable(cr) {
  const nr = cr+1;
  const specs = {
    Traditional:{mtbf:"14000-19000",price:"$20-$30",name:"Traditional"},
    LowEnd:{mtbf:"12000-17000",price:"$15-$25",name:"Low End"},
    HighEnd:{mtbf:"20000-25000",price:"$30-$40",name:"High End"},
    Performance:{mtbf:"27000",price:"$25-$35",name:"Performance"},
    Size:{mtbf:"20000",price:"$25-$35",name:"Size"},
  };
  let t = "\n## 第 " + nr + " 轮官方理想点参考表\n\n";
  t += "| 细分市场 | 段中心点 | **目标Pfmn** | **目标Size** | MTBF | 价格区间 |\n";
  t += "|---------|---------|------------|------------|------|--------|\n";
  for (const [key,spec] of Object.entries(specs)) {
    const ip = getIdealPoint(key,nr);
    const c = SEGMENT_CENTERS[Math.min(nr,8)]?.[key];
    t += `| ${spec.name} | (${c?.[0]}, ${c?.[1]}) | **${ip?.pfmn}** | **${ip?.size}** | ${spec.mtbf} | ${spec.price} |\n`;
  }
  t += "\n> Low End 通常不研发（年龄越大越有优势）；High End 每轮必须研发\n";
  return t;
}

function getStrategyGuide(strategy) {
  const m = {
    "全市场覆盖":"所有5个细分市场保持竞争力，Finance资金压力较大",
    "利基市场-High End":"专注High End高溢价，每轮必须研发，定价$30-40",
    "成本领导-Low End为主":"Low End低定价不研发，高自动化降成本",
    "差异化-Performance/Size":"Performance MTBF 27000，Size MTBF 20000，精准定位",
    "品牌扩张策略":"高营销预算快速抢份额，准备充足产能",
  };
  for (const [k,v] of Object.entries(m)) {
    if (strategy?.includes(k)||k.includes(strategy||"")) return v;
  }
  return "根据战略方向合理分配资源";
}

function buildAnalysisPrompt(pdfText, teamName, roundNum, strategy) {
  const cr = parseInt(roundNum)||0;
  const nr = cr+1;
  const ip = seg => getIdealPoint(seg,nr);
  const guide = getStrategyGuide(strategy||"");

  return `你是一位资深 Capsim 商业模拟游戏专家顾问。

## 背景信息
- 队伍名称：${teamName||"我方队伍"}
- 当前轮次：第 ${cr} 轮
- 目标轮次：第 ${nr} 轮
- 战略方向：${strategy||"未指定"} — ${guide}

${buildRdTable(cr)}

---

## Courier 报告全文

${pdfText}

---

# 第 ${cr} 轮分析报告 → 第 ${nr} 轮决策建议

---

## 【阶段一】识别我方产品现状

请从报告中精确找出 "${teamName||"我方队伍"}" 的所有产品，填写以下表格：

| 参数项 | Traditional | Low End | High End | Performance | Size |
|--------|------------|---------|----------|------------|------|
| 产品名称 | | | | | |
| 当前Pfmn | | | | | |
| 当前Size | | | | | |
| 当前MTBF | | | | | |
| 当前价格 | | | | | |
| 当前年龄 | | | | | |
| 本轮销量 | | | | | |
| 市场份额 | | | | | |
| 库存余量 | | | | | |
| 自动化等级 | | | | | |
| 产能上限 | | | | | |

### 与理想点偏差

| 市场 | 当前Pfmn | 目标Pfmn | 差距 | 当前Size | 目标Size | 差距 | 研发建议 |
|------|--------|--------|-----|--------|--------|-----|--------|
| Traditional | | ${ip("Traditional")?.pfmn} | | | ${ip("Traditional")?.size} | | |
| Low End | | ${ip("LowEnd")?.pfmn} | | | ${ip("LowEnd")?.size} | | 通常不研发 |
| High End | | ${ip("HighEnd")?.pfmn} | | | ${ip("HighEnd")?.size} | | **必须研发** |
| Performance | | ${ip("Performance")?.pfmn} | | | ${ip("Performance")?.size} | | |
| Size | | ${ip("Size")?.pfmn} | | | ${ip("Size")?.size} | | |

---

## 【阶段二】第 ${cr} 轮问题诊断

### 财务健康度

| 指标 | 我方数据 | 行业参考 | 评估 |
|------|---------|--------|------|
| 利润率 ROS | | | |
| 资产周转率 | | | |
| ROE | | | |
| 期末现金 | | | |
| 紧急贷款 | | | |
| 股价变动 | | | |

### 竞争力问题诊断（从报告中读取竞品数据，分析我方差距）

---

## 【阶段三】第 ${nr} 轮决策参数

### 3.1 R&D 决策

| 项目 | Traditional | Low End | High End | Performance | Size |
|------|------------|---------|----------|------------|------|
| 产品名称 | | | | | |
| 是否研发 | | 通常否 | **是（必须）** | | |
| 目标Pfmn | ${ip("Traditional")?.pfmn} | ${ip("LowEnd")?.pfmn} | ${ip("HighEnd")?.pfmn} | ${ip("Performance")?.pfmn} | ${ip("Size")?.pfmn} |
| 目标Size | ${ip("Traditional")?.size} | ${ip("LowEnd")?.size} | ${ip("HighEnd")?.size} | ${ip("Performance")?.size} | ${ip("Size")?.size} |
| MTBF | | | | **27000** | **20000** |
| 决策理由 | | | | | |

### 3.2 Marketing 决策

| 项目 | Traditional | Low End | High End | Performance | Size |
|------|------------|---------|----------|------------|------|
| 定价 | | | | | |
| 当年需求 | | | | | |
| 次年增长率 | | | | | |
| 预估占有率 | | | | | |
| 参数改善增长率 | 3%-7% | | | | |
| **销售预测量** | | | | | |
| 促销预算($K) | | | | | |
| 销售预算($K) | | | | | |

### 3.3 Production 决策

| 项目 | Traditional | Low End | High End | Performance | Size |
|------|------------|---------|----------|------------|------|
| 销售预测量 | | | | | |
| **建议产量** | | | | | |
| 当前Capacity | | | | | |
| **扩产/缩产** | +N/-N/无 | | | | |
| 当前自动化 | | | | | |
| **建议自动化** | 当前±≤1.5 | | | | |

### 3.4 Finance 决策

| 融资方向 | 建议 | 理由 |
|---------|------|------|
| 长期债券（优先） | 如需融资优先发行 | 利率低 |
| 短期借款（紧急） | 仅极度紧张时考虑 | 成本高 |
| 股票操作 | 根据股价判断 | 稀释股权需谨慎 |
| 股息 | 根据盈利判断 | 维护股东信心 |

本轮财务方向：（根据分析给出融资建议）

### 3.5 TQM 决策（每项必须投入）

| TQM 项目 | 投入规模 | 主要收益 |
|---------|---------|---------|
| CPI Systems | | 降低物料成本 |
| Vendor/JIT | | 降低库存成本 |
| Quality Initiative Training | | 降低劳动力成本 |
| Channel Support Systems | | 提升销售效率 |
| Concurrent Engineering | | 缩短研发周期 |
| UNEP Green Programs | | 环保合规加分 |
| Benchmarking | | 获取竞品信息 |
| Quality Function Deployment | | 提升设计质量 |
| CCE/6-Sigma | | 全面质量改善 |
`;
}

// AI 分析端点
app.post("/api/analyze", authenticate, async (req, res) => {
  const { pdfText, teamName, roundNum, strategy } = req.body;
  if (!pdfText) return res.status(400).json({ error: "缺少 PDF 文本内容" });

  const apiKey = loadApiKey();
  if (!apiKey) return res.status(500).json({ error: "未配置 API Key，请设置 DEEPSEEK_API_KEY 环境变量" });

  const prompt = buildAnalysisPrompt(pdfText, teamName, roundNum, strategy);
  const apiBase = process.env.API_BASE || "https://api.deepseek.com/v1";
  const model = process.env.MODEL || "deepseek-chat";

  try {
    const response = await fetch(`${apiBase}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature: 0.3, max_tokens: 4000 }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(502).json({ error: "AI 服务错误：" + errText.slice(0, 200) });
    }

    const data = await response.json();
    const result = data.choices?.[0]?.message?.content;
    if (!result) return res.status(502).json({ error: "AI 返回内容为空" });
    res.json({ result });
  } catch (e) {
    res.status(500).json({ error: "分析请求失败：" + e.message });
  }
});

// 健康检查
app.get("/api/health", (req, res) => res.json({
  status: "ok",
  version: "1.3.0",
  env: IS_VERCEL ? "vercel" : "local",
  dbMode: IS_VERCEL ? "memory" : "file",
  time: new Date().toISOString()
}));

// ──────────────────────────────────────────────────────────────
// 启动
// ──────────────────────────────────────────────────────────────
async function startServer() {
  await initDb();
  if (!IS_VERCEL) {
    app.listen(PORT, () => {
      console.log("=".repeat(50));
      console.log("Capsim Cloud v1.3.0 started!");
      console.log("URL: http://localhost:" + PORT);
      console.log("Admin: admin / " + (process.env.ADMIN_PASSWORD || "admin123"));
      console.log("=".repeat(50));
    });
  }
}

startServer().catch(err => {
  console.error("数据库初始化失败：", err);
  process.exit(1);
});

export default app;
