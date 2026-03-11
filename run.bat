@echo off
echo ################################################
echo #   Nepal Portfolio Manager - Starter          #
echo ################################################
echo.

:: 1. Start Backend in a new window
echo Starting Backend...
start "NPM Backend" cmd /k "cd backend && venv\Scripts\activate && python -m uvicorn app.main:app --reload --port 8000"

:: 2. Wait a second
timeout /t 2 >nul

:: 3. Start Frontend in a new window
echo Starting Frontend...
start "NPM Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo [SUCCESS] Both services are launching in separate windows.
echo Keep those windows open while using the app.
echo.
pause
