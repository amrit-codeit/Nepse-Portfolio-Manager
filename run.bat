@echo off
echo ################################################
echo #   Nepal Portfolio Manager - Starter          #
echo ################################################
echo.

:: 1. Start Backend in a new window
echo Starting Backend...
start "NPM Backend" cmd /k "cd backend && venv\Scripts\activate && python run_server.py"

:: 2. Wait a second
timeout /t 2 >nul

:: 3. Start Frontend in a new window
echo Starting Frontend...
start "NPM Frontend" cmd /k "cd frontend && npm run dev"

:: 4. Wait for frontend to compile, then open browser
echo Waiting for frontend to start...
timeout /t 5 >nul
echo Opening Web App in default browser...
start http://localhost:5173

echo.
echo [SUCCESS] Both services are launching in separate windows.
echo Keep those windows open while using the app.
echo.
pause
