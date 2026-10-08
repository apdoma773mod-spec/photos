@echo off
rem opens the tool page; starts the server if it is not running
powershell -NoProfile -Command "try { Invoke-WebRequest http://localhost:3000/ -UseBasicParsing -TimeoutSec 3 | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 (
  wscript "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\mekanizm-products.vbs"
  timeout /t 4 >nul
)
start "" http://localhost:3000