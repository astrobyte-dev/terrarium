@echo off
REM Launch Terrarium from source with the latest code (no reinstall needed).
REM Double-click this. It clears the ELECTRON_RUN_AS_NODE leak that makes Electron
REM boot as Node and quit, rebuilds the current code, then opens the app window.
title Terrarium (dev)
cd /d "%~dp0packages\gui"

REM Kill the ELECTRON_RUN_AS_NODE env leak (VSCode terminals set this).
set "ELECTRON_RUN_AS_NODE="

echo Building latest code...
call npm run build
if errorlevel 1 (
  echo.
  echo Build failed - see errors above.
  pause
  exit /b 1
)

echo.
echo Launching Terrarium...
call npx electron .

echo.
echo Terrarium closed.
pause
