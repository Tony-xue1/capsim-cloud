# Capsim AI 顾问 - 云端版（带权限管理）

上传 Capsim Courier 报告 PDF → AI 三阶段深度分析 → R&D / Marketing / Production / Finance / TQM 精确决策参数

**支持用户管理**：管理员可添加/删除成员，只有授权账号才能使用。

---

## 功能特点

- ✅ 用户登录认证（JWT）
- ✅ 管理员控制用户访问（添加/删除账号）
- ✅ 三阶段 AI 分析（识别产品 → 诊断问题 → 决策参数）
- ✅ 表格清晰对齐，首列高亮
- ✅ 支持修改密码
- ✅ 纯 Node.js，无需 Python，跨平台

---

## 云端部署（Railway，不需要 GitHub）

Railway 支持**直接上传 ZIP 文件**部署，无需 GitHub 账号。

### 第一步：准备压缩包

将 `capsim-cloud` 文件夹内所有内容（**不包含 node_modules 目录**）打包为 ZIP。

```
capsim-cloud.zip 应包含：
├── public/
│   ├── css/style.css
│   ├── index.html
│   └── admin.html
├── server.js
├── package.json
├── Procfile
├── railway.json
└── .env.example
```

### 第二步：在 Railway 部署

1. 访问 [railway.app](https://railway.app) → 注册账号
2. 点击 **New Project** → **Deploy from template** → 或直接 **Deploy from GitHub repo**
3. 如果不想用 GitHub，选择 **Deploy with CLI**（用 railway CLI 可直接传文件夹）

**推荐方式（最简单）：使用 Railway CLI**

```bash
# 安装 Railway CLI
npm install -g @railway/cli

# 进入项目目录
cd capsim-cloud

# 登录 Railway
railway login

# 部署（自动创建项目）
railway up
```

### 第三步：配置环境变量（重要！）

在 Railway 项目页 → **Variables** → 添加：

| 变量名 | 值 | 说明 |
|-------|-----|------|
| `DEEPSEEK_API_KEY` | `sk-你的密钥` | **必填** |
| `JWT_SECRET` | `随机长字符串` | 强烈建议填，否则重启后用户需重新登录 |
| `ADMIN_PASSWORD` | `你的管理员密码` | 可选，默认 admin123 |

### 第四步：获取链接分享

部署成功后，Railway 分配 `xxx.railway.app` 链接，分享给队友即可。

---

## Render 部署（备选）

1. 访问 [render.com](https://render.com) → 注册
2. **New Web Service** → **Build and deploy from a Git repository**
3. 如不用 GitHub：选择 **Deploy from URL** 或使用 Render CLI
4. Build Command: `npm install`
5. Start Command: `npm start`
6. 添加 Environment Variables：`DEEPSEEK_API_KEY`

> ⚠️ Render 免费计划 15 分钟无访问会休眠，首次唤醒需约 30 秒。

---

## 本地运行

```bash
cd capsim-cloud

# 安装依赖
npm install

# 配置 API Key（两种方式选一）
# 方式1：创建 config.json
echo '{"apiKey": "sk-你的key"}' > config.json

# 方式2：设置环境变量
$env:DEEPSEEK_API_KEY = "sk-你的key"   # Windows PowerShell

# 启动
npm start

# 打开浏览器
# http://localhost:3737
```

---

## 使用说明

### 登录
- 默认管理员账号：`admin` / `admin123`
- **首次登录后请立即修改密码**（右上角「修改密码」）

### 用户管理（管理员专属）
- 右上角点击「👥 用户管理」
- 可添加队友账号（设置用户名和密码）
- 可删除不需要的账号

### 分析流程
1. 登录后，填写**队伍名称**（如 Andrews / Baldwin）
2. 选择当前轮次和战略方向
3. 上传 Capsim Courier 报告 PDF
4. 点击「开始三阶段 AI 分析」

---

## 环境变量说明

| 变量 | 必填 | 默认值 | 说明 |
|------|-----|-------|------|
| `DEEPSEEK_API_KEY` | ✅ | 无 | DeepSeek API 密钥 |
| `JWT_SECRET` | 推荐 | 随机生成 | JWT 签名密钥，重启不失效 |
| `ADMIN_PASSWORD` | 可选 | admin123 | 管理员初始密码 |
| `API_BASE` | 可选 | https://api.deepseek.com/v1 | API 地址 |
| `MODEL` | 可选 | deepseek-chat | 模型名称 |
| `PORT` | 自动 | 3737 | 云平台自动注入 |

---

## 获取 DeepSeek API Key

[platform.deepseek.com](https://platform.deepseek.com/) 注册后获取，价格低廉，每次分析约消耗 0.01-0.05 元。
