@echo off
rem Windows: double-click this file to start Mandelbrot Odyssey.
cd /d "%~dp0"

where node >nul 2>nul || (
  echo Node.js is not installed. Get the LTS version from https://nodejs.org, then run this again.
  pause
  exit /b 1
)
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 18 ? 0 : 1)" || (
  echo Node.js is too old: version 18 or newer is needed. Get it from https://nodejs.org
  pause
  exit /b 1
)

call npm install --no-fund --no-audit || (
  pause
  exit /b 1
)
call npm start
pause
