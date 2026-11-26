@echo off
set ELECTRON_RUN_AS_NODE=
set FM1_WINDOW_WIDTH=1180
set FM1_WINDOW_HEIGHT=1056
rem Optional: set FM1_WINDOW_X and FM1_WINDOW_Y to lock screen position (leave blank to center)
set FM1_WINDOW_X=
set FM1_WINDOW_Y=
set FM1_WINDOW_LOCK=1
cd /d "%~dp0hub"
start "" /b cmd /c "npm run electron"
