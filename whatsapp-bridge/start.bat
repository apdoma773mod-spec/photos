@echo off
cd /d C:\mekanizm-whatsapp
:loop
rem kill leftover bridge chrome (it locks the session)
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | ? { $_.CommandLine -match 'mekanizm-whatsapp' } | %% { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {} }"
"C:\Program Files\nodejs\node.exe" bridge.js >> bridge-console.txt 2>&1
echo stopped, restarting in 10s...
timeout /t 10 >nul
goto loop