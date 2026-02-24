@echo off
title AI House Designer Server

echo ===================================================
echo Starting AI House Designer Development Server...
echo ===================================================
echo.

:: Navigate to the script's directory (house-design-ai)
cd /d "%~dp0"

:: Open the default web browser to the app
echo Opening browser...
start http://localhost:3000/design

:: Start the Next.js dev server
echo Starting Node.js server...
npm run dev

pause
