@echo off
setlocal

cd /d "%~dp0.."

if not exist "node_modules\electron\dist\electron.exe" (
  echo Installing dependencies for the license generator...
  npm ci
  if errorlevel 1 (
    echo.
    echo Failed to install dependencies.
    pause
    exit /b 1
  )
)

npm run license:app
