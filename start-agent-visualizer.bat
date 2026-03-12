@echo off
echo Starting AI Agent Architecture Visualizer...
echo This will start the Next.js development server...
echo Access the visualizer at http://localhost:3000/agent-editor

:: Start the Next.js dev server in the background
start /B npm run dev

:: Wait a few seconds for server to boot up
timeout /t 5 /nobreak > NUL

:: Open the visualizer in the default browser
start http://localhost:3000/agent-editor

echo Done! Keep this window open or minimize it.
pause
