@echo off
chcp 65001 >nul
echo ================================
echo   Capsim AI 顾问 - 一键安装
echo ================================
echo.

echo [1/4] 检查 Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ 未检测到 Node.js
    echo.
    echo 请先安装 Node.js：
    echo 👉 https://nodejs.org/zh-cn
    echo.
    echo 安装完成后，重新运行此脚本
    pause
    exit
)
for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
echo ✅ Node.js %NODE_VER% 已安装

echo.
echo [2/4] 安装依赖包（可能需要几分钟）...
call npm install
if %errorlevel% neq 0 (
    echo ❌ 依赖安装失败，请检查网络连接
    pause
    exit
)
echo ✅ 依赖安装完成

echo.
echo [3/4] 配置 API Key...
echo.
echo 请先获取 DeepSeek API Key：
echo 1. 访问 https://platform.deepseek.com/
echo 2. 登录后点击 "API Keys"
echo 3. 点击 "Create new secret key"
echo 4. 复制生成的 Key（格式：sk- 开头）
echo.
set /p apikey="请粘贴你的 API Key: "
if "%apikey%"=="" (
    echo ⚠️  未输入 API Key，稍后可手动创建 config.json
    goto :skip_apikey
)
echo {"apiKey": "%apikey%"} > config.json
echo ✅ API Key 配置完成！

:skip_apikey
echo.
echo [4/4] 创建启动脚本...
echo @echo off > 启动服务.bat
echo echo 正在启动 Capsim AI 顾问... >> 启动服务.bat
echo node server.js >> 启动服务.bat
echo pause >> 启动服务.bat
echo ✅ 启动脚本创建完成！

echo.
echo ================================
echo  🎉 安装完成！
echo ================================
echo.
echo 使用方法：
echo 1. 双击 "启动服务.bat" 启动服务
echo 2. 打开浏览器访问：http://localhost:8080
echo 3. 登录账号：admin  密码：admin123
echo.
echo ⚠️  首次登录后请修改密码！
echo.
pause
