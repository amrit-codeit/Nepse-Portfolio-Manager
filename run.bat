@echo off
echo ################################################
echo #   Nepal Portfolio Manager - Starter          #
echo ################################################
echo.

:: Ensure correct active directory
cd /d "%~dp0"

:: Check if venv exists
if not exist "backend\venv" (
    echo [ERROR] Virtual environment not found.
    echo Please run 'setup.bat' first.
    pause
    exit /b 1
)

:: 1. Start unified server
echo Starting NPM Unified Server on Port 6767...
:: Use the explicit venv python path to guarantee all dependencies are found
start "Nepal Portfolio Manager" cmd /k "cd backend && call venv\Scripts\activate.bat && venv\Scripts\python.exe run_server.py"

:: 2. Wait for server to start, then open browser
echo Waiting for server to initialize...
timeout /t 5 >nul
echo Opening Web App in default browser...
start http://localhost:6767

echo.
echo [SUCCESS] The application is running!
echo You can also access it on other devices using your computer's local IP address (e.g. http://192.168.1.XX:6767).
echo.
pause
