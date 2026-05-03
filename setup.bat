@echo off
setlocal enabledelayedexpansion

echo ################################################
echo #   Nepal Portfolio Manager - Setup Wizard     #
echo ################################################
echo.

:: Ensure we are executing from the script's own folder
cd /d "%~dp0"

:: 1. Detect Python Command
set PY_CMD=python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    set PY_CMD=python3
    python3 --version >nul 2>&1
    if !errorlevel! neq 0 (
        echo [ERROR] Python not found. Please run install.bat first.
        pause
        exit /b 1
    )
)

:: 2. Setup Backend
echo.
echo [1/3] Setting up Backend Virtual Environment...
cd backend

:: Always ensure a fresh venv if uvicorn error persists
if not exist venv (
    echo Creating virtual environment...
    %PY_CMD% -m venv venv
)

echo Installing/Updating dependencies...
venv\Scripts\python.exe -m pip install --upgrade pip
venv\Scripts\pip.exe install -r requirements.txt
if !errorlevel! neq 0 (
    echo [ERROR] Failed to install backend dependencies. Check your internet connection.
    pause
    exit /b 1
)

:: 3. Setup Environment Variables
echo.
echo [2/3] Configuring Environment...
if not exist .env (
    echo Creating .env from .env.example...
    copy .env.example .env >nul
    
    echo Generating secure encryption key...
    for /f "tokens=*" %%a in ('venv\Scripts\python.exe -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"') do set NEW_KEY=%%a
    
    echo.
    echo -------------------------------------------------------------
    echo SECURITY SETUP: Master Password
    echo This password protects your MeroShare credentials and sensitive actions.
    set /p "USER_MASTER_PASS=Enter a strong master password (default: admin123): "
    if "!USER_MASTER_PASS!"=="" set USER_MASTER_PASS=admin123
    
    echo Generating secure password hash...
    for /f "tokens=*" %%b in ('venv\Scripts\python.exe -c "import bcrypt; print(bcrypt.hashpw('!USER_MASTER_PASS!'.encode('utf-8'), bcrypt.gensalt()).decode())"') do set HASHED_PASS=%%b
    
    powershell -Command "(gc .env) -replace 'your_encryption_key_here', '!NEW_KEY!' | Out-File -encoding ASCII .env"
    echo.>> .env
    echo MASTER_PASSWORD=!HASHED_PASS!>> .env
    echo [OK] .env created with secure defaults.
)

:: 4. Setup Frontend
echo.
echo [3/3] Building Frontend...
cd ..\frontend
echo Installing frontend dependencies (npm install)...
call npm install
echo Building production assets (npm run build)...
call npm run build
if !errorlevel! neq 0 (
    echo [ERROR] Frontend build failed.
    pause
    exit /b 1
)

echo.
echo ################################################
echo #          Setup Complete!                     #
echo ################################################
echo.
echo Your environment is fully configured. 
echo Launching the application...
echo.
timeout /t 2 >nul

:: Navigate back to root and launch run.bat
cd ..
start run.bat
