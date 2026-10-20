@echo off
chcp 65001 >nul
title NoteHub 同步服务
cd /d "%~dp0"

echo.
echo   ============================================
echo     NoteHub 同步服务
echo   ============================================
echo.

REM 取本机内网 IPv4：手机连同一个 Wi-Fi 时用它直连，地址固定、速度最快
set "LANIP="
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 ^| Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } ^| Select-Object -First 1).IPAddress"`) do set "LANIP=%%i"

if defined LANIP (
  echo   手机端服务器地址 ^(同一 Wi-Fi，推荐^)：
  echo       http://%LANIP%:8080
  echo.
)

echo   需要在外网用 ^(不同网络^) 时，用下面隧道窗口里显示的
echo   https://xxxx.trycloudflare.com 地址；该地址每次重启会变。
echo.
echo   正在启动本地服务，请勿关闭本窗口。
echo   关闭本窗口 = 手机将无法同步。
echo.

start "NoteHub-公网隧道" cmd /k "%~dp0cloudflared.exe tunnel --url http://localhost:8080 --no-autoupdate"

node "%~dp0notehub_server.js" 8080
pause
