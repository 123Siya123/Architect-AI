@echo off
title AI House Designer Server
cd /d "%~dp0"
PowerShell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start_App.ps1"
pause
