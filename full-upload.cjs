/**
 * 一次性全量上传脚本 — 强制上传所有文件到 GitHub
 * 不管远程是否已存在，全部重新上传（覆盖）
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const PROJECT_DIR = __dirname;
const CONFIG_PATH = path.join(PROJECT_DIR, '.sync-config.env');

// 读取配置
function loadConfig() {
  const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
  const config = {};
  for (const line of content.split('\n')) {
    const match = line.match(/^(\w+)=(.+)$/);
    if (match) config[match[1]] = match[2].trim();
  }
  return config;
}

const CONFIG = loadConfig();
const API_BASE = 'api.github.com';

// 忽略列表
const IGNORED_DIRS = ['node_modules', '.git', 'data', '.env'];
const IGNORED_FILES = [
  'package-lock.json', '.DS_Store', '.sync-config.env',
  'auto-sync.cjs', 'full-upload.cjs', '启动自动同步.bat',
  'test-pdf.mjs', 'test-pdf-debug.mjs'
];

function log(msg) {
  const now = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  console.log(`[${now}] ${msg}`);
}

// GitHub API 请求
function githubAPI(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: API_BASE,
      path: `/repos/${CONFIG.GITHUB_OWNER}/${CONFIG.GITHUB_REPO}${apiPath}`,
      method: method,
      headers: {
        'Authorization': `Bearer ${CONFIG.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'CAP-FullUpload/1.0'
      }
    };
    if (data) {
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(data);
    }
    const req = https.request(options, (res) => {
      let chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        let json;
        try { json = JSON.parse(raw); } catch (e) { json = raw; }
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${typeof json === 'string' ? json.substring(0, 300) : JSON.stringify(json).substring(0, 300)}`));
        } else {
          resolve(json);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('请求超时')); });
    if (data) req.write(data);
    req.end();
  });
}

function getRelativePath(fullPath) {
  return path.relative(PROJECT_DIR, fullPath).replace(/\\/g, '/');
}

function isIgnored(filePath) {
  const relPath = getRelativePath(filePath);
  for (const dir of IGNORED_DIRS) {
    if (relPath.startsWith(dir + '/') || relPath === dir) return true;
  }
  if (IGNORED_FILES.includes(path.basename(filePath))) return true;
  return false;
}

function scanLocalFiles() {
  const files = [];
  function scan(dir) {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        if (!isIgnored(fullPath)) scan(fullPath);
      } else {
        if (!isIgnored(fullPath)) files.push(fullPath);
      }
    }
  }
  scan(PROJECT_DIR);
  return files;
}

function readFileBase64(filePath) {
  const content = fs.readFileSync(filePath);
  return content.toString('base64');
}

function encodeFilePath(relPath) {
  return relPath.split('/').map(seg => encodeURIComponent(seg)).join('/');
}

// 获取远程已有文件的 SHA（用于更新）
async function getRemoteSha(relPath) {
  const encodedPath = encodeFilePath(relPath);
  try {
    const result = await githubAPI('GET', `/contents/${encodedPath}?ref=${CONFIG.GITHUB_BRANCH}`);
    return result.sha || null;
  } catch (e) {
    return null; // 文件不存在
  }
}

// 强制上传单个文件
async function forceUploadFile(filePath) {
  const relPath = getRelativePath(filePath);
  const base64Content = readFileBase64(filePath);

  // 获取远程 SHA（如果存在）
  const existingSha = await getRemoteSha(relPath);

  const result = await githubAPI('PUT', `/contents/${encodeFilePath(relPath)}`, {
    message: `full-upload: ${existingSha ? '更新' : '新建'} ${relPath}`,
    content: base64Content,
    branch: CONFIG.GITHUB_BRANCH,
    ...(existingSha ? { sha: existingSha } : {})
  });

  return { relPath, created: !existingSha };
}

async function main() {
  log('========================================');
  log('  CAP 全量上传到 GitHub');
  log('========================================');
  log(`仓库: ${CONFIG.GITHUB_OWNER}/${CONFIG.GITHUB_REPO}`);
  log(`分支: ${CONFIG.GITHUB_BRANCH}`);
  log('');

  // 扫描本地文件
  const localFiles = scanLocalFiles();
  log(`本地扫描到 ${localFiles.length} 个文件需要上传`);
  log('');

  let success = 0;
  let failed = 0;
  const failedFiles = [];

  for (let i = 0; i < localFiles.length; i++) {
    const file = localFiles[i];
    const relPath = getRelativePath(file);
    try {
      const result = await forceUploadFile(file);
      success++;
      log(`[${i + 1}/${localFiles.length}] ✅ ${result.created ? '新建' : '更新'} ${relPath}`);
    } catch (e) {
      failed++;
      failedFiles.push({ relPath, error: e.message });
      log(`[${i + 1}/${localFiles.length}] ❌ 失败 ${relPath} - ${e.message.substring(0, 150)}`);
    }
    // 小延迟避免 API 限流
    await new Promise(r => setTimeout(r, 200));
  }

  log('');
  log('========================================');
  log(`上传完成！成功: ${success}, 失败: ${failed}`);
  if (failedFiles.length > 0) {
    log('失败文件:');
    for (const f of failedFiles) {
      log(`  - ${f.relPath}: ${f.error.substring(0, 100)}`);
    }
  }
  log('');
  log(`GitHub 仓库: https://github.com/${CONFIG.GITHUB_OWNER}/${CONFIG.GITHUB_REPO}`);
  log(`公网地址: https://capsim-cloud-production.up.railway.app`);
  log(`Railway 将在 1-2 分钟内自动重新部署`);
  log('========================================');
}

main().catch(e => {
  log(`致命错误: ${e.message}`);
  process.exit(1);
});
