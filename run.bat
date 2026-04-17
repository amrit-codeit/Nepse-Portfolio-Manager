@echo off
echo ################################################
echo #   Nepal Portfolio Manager - Starter          #
echo ################################################
echo.

:: Ensure correct active directory
cd /d "%~dp0"

:: 1. Start unified server (Backend + Static Frontend)
echo Starting NPM Unified Server...
start "Nepal Portfolio Manager" cmd /k "cd backend && venv\Scripts\activate && python run_server.py"

:: 2. Wait for server to start, then open browser
echo Waiting for server to initialize...
timeout /t 5 >nul
echo Opening Web App in default browser...
start http://localhost:8000

echo.
echo [SUCCESS] The application is running!
echo You can also access it on other devices using your computer's local IP address (e.g. http://192.168.1.XX:8000).
echo.
pause
