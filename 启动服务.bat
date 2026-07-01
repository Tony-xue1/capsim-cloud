@echo off
chcp 65001 >nul
echo ================================
echo   Capsim AI 顾问 - 启动服务
echo ================================
echo.

REM 检查是否有 config.json
if not exist config.json (
    echo ⚠️  未找到 config.json 配置文件
    echo.
    echo 请先运行 "一键安装.bat" 进行配置
    echo 或手动创建 config.json 文件
    echo.
    pause
    exit
)

echo ✅ 配置文件检测通过
echo.
echo 🚀 正在启动服务...
echo 📡 服务地址：http://localhost:8080
echo.
echo ⚠️  请不要关闭此窗口，关闭后服务将停止
echo    需要停止时，按 Ctrl+C
echo.

node server.js

pause
