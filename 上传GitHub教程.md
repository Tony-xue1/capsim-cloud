# 📦 Capstone-Cloud 上传 GitHub 完整教程（跨设备使用）

> 全程在浏览器操作，**不需要安装任何软件**，约 10 分钟完成。

---

## 第一步：在 GitHub 创建仓库

1. 打开 https://github.com，登录你的账号

2. 点击右上角 **"+"** → **"New repository"**

3. 填写：
   - **Repository name**：`capsim-cloud`（必须英文）
   - 选择 **Public**（公开）或 **Private**（私有）
   - ⚠️ **不要勾选** "Add a README file"（保持空仓库）

4. 点击 **"Create repository"**（绿色按钮）

---

## 第二步：上传文件（关键步骤）

> GitHub 网页支持**拖拽整个文件夹**上传，一次搞定！

### 操作方法：

**① 进入上传页面**

仓库创建后会显示空仓库页面，点击 **"uploading an existing file"** 链接

（如果找不到，URL 改为：`https://github.com/你的用户名/capsim-cloud/upload/main`）

**② 打开本地文件夹**

打开 Windows 文件资源管理器，导航到：
```
D:\Data\Chen.haoxiang\Desktop\有用\CAP\capsim-cloud\
```

**③ 拖拽上传**

在文件夹里，**全选所有文件**（按 Ctrl+A），然后**拖拽到浏览器的上传区域**

> ✅ GitHub 会自动跳过 `.gitignore` 里指定的文件
> 
> ⚠️ 以下文件/文件夹**不会被上传**（安全）：
> - `node_modules/`（依赖包，太大了）
> - `data/`（用户数据库）
> - `config.json`（你的 API Key）
> - `.env`（环境变量文件）

**④ 提交**

滚动到页面底部，点击 **"Commit changes"**（绿色按钮）

---

## 第三步：在其他电脑上克隆使用

> 以下操作只需做一次，之后每次 pull 即可更新

### 第一台新电脑：完整设置

**① 安装 Node.js**

访问 https://nodejs.org，下载 **LTS（长期支持版）**并安装

**② 打开命令行**

按 `Win + X`，选择 **"终端"** 或 **"Windows PowerShell"**

**③ 克隆仓库**

```bash
# 进入你想放项目的目录（改成你自己的路径）
cd D:\Data\Chen.haoxiang\Desktop\项目

# 克隆仓库（改成你的 GitHub 用户名）
git clone https://github.com/你的用户名/capsim-cloud.git
```

**④ 进入项目目录**
```bash
cd capsim-cloud
```

**⑤ 安装依赖**
```bash
npm install
```

**⑥ 创建配置文件**

在项目根目录创建 `config.json` 文件，内容如下：
```json
{
  "apiKey": "sk-your-deepseek-api-key",
  "jwt_secret": "your-secret-key-here",
  "port": 3737
}
```

> ⚠️ 把 `sk-your-deepseek-api-key` 换成你的 DeepSeek API Key
> 
> 获取地址：https://platform.deepseek.com/

**⑦ 启动服务**
```bash
node server.js
```

**⑧ 访问**

打开浏览器，输入：
```
http://localhost:3737
```

---

## 第四步：后续更新（已有项目的情况下）

如果你的 GitHub 上代码更新了，在其他电脑上执行：

```bash
cd capsim-cloud
git pull origin main
npm install
```

---

## 第五步：团队协作（可选）

### 添加队友访问权限

如果你的仓库是 **Private**（私有），队友需要你邀请才能访问：

1. 在 GitHub 仓库页面，点击 **"Settings"** → **"Collaborators"**
2. 点击 **"Add people"**
3. 输入队友的 GitHub 用户名或邮箱
4. 队友接受邀请后，即可克隆仓库

### 同步最新代码给队友

当你的代码更新后：
```bash
git add .
git commit -m "更新说明"
git push origin main
```

队友更新本地代码：
```bash
git pull origin main
```

---

## 📁 需要上传的文件清单

上传后仓库应包含（共14个文件/文件夹）：

```
capsim-cloud/
├── public/                   ✅ 上传（前端文件）
│   ├── index.html
│   ├── admin.html
│   ├── login.html
│   └── styles.css
├── .gitignore                ✅ 上传（指定不传哪些）
├── package.json              ✅ 上传（依赖列表）
├── package-lock.json        ✅ 上传（锁定版本）
├── Procfile                  ✅ 上传（Railway 部署配置）
├── railway.json              ✅ 上传（Railway 部署配置）
├── README.md                 ✅ 上传（项目说明）
├── server.js                 ✅ 上传（服务器主文件）
└── test-pdf.mjs              ✅ 上传（测试文件）
```

**这些不会上传（已在 .gitignore 中排除）：**
```
❌ node_modules/     ← 依赖包太大，npm install 自动生成
❌ data/             ← 用户数据，包含敏感信息
❌ config.json       ← 你的 API Key，绝对不能上传！
❌ .env              ← 环境变量文件
```

---

## ❓ 常见问题

**Q：上传文件时，拖拽不进去怎么办？**

A：尝试点击上传区域的 "choose your files" 链接，手动选择文件

---

**Q：克隆后运行 `npm install` 报错？**

A：检查 Node.js 是否安装正确：
```bash
node -v    # 应显示版本号（如 v20.x.x）
npm -v     # 应显示版本号（如 10.x.x）
```

---

**Q：启动后显示 "Cannot find module" 错误？**

A：重新安装依赖：
```bash
rm -rf node_modules
npm install
```

---

**Q：API Key 应该怎么填？**

A：在项目根目录创建 `config.json`，内容：
```json
{
  "apiKey": "sk-xxxxxxxxxxxxxxxxxxxxxxxx"
}
```

DeepSeek API Key 获取：https://platform.deepseek.com/

---

**Q：忘记 GitHub 仓库地址了？**

A：登录 GitHub → 点击你的仓库 → 右上角有地址（格式：`https://github.com/用户名/capsim-cloud`）

---

**Q：其他电脑没有 Node.js 能运行吗？**

A：不能。必须先安装 Node.js 才能运行这个项目。这是 Node.js 项目，不是可执行程序。

---

**Q：密码忘了怎么办？**

A：只能重置。删除本地的 `data/users.db` 文件，重新启动后会创建新的管理员账号。

> ⚠️ 云端部署的话需要通过 Railway/Render 删除数据库文件

---

## 🔧 初始账号

- **用户名**：`admin`
- **密码**：`admin123`

> ⚠️ 首次登录后请立即修改密码！

---

遇到问题随时截图告诉我！🙌
