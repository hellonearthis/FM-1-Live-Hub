@echo off
cd /d "%~dp0hub"
start "" /b node src\dashboard.js
timeout /t 1 /nobreak >nul
start "" "http://127.0.0.1:3001"
