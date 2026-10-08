@echo off
cd /d C:\mekanizm-products
set PATH=C:\Program Files\nodejs;%PATH%
:loop
node src\server.js >> server-console.txt 2>&1
timeout /t 5 >nul
goto loop