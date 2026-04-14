@echo off
setlocal enabledelayedexpansion

echo ################################################
echo #   Nepal Portfolio Manager - Setup Wizard     #
echo ################################################
echo.

:: 1. Check for Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH.
    echo Please install Python 3.10+ from python.org
    pause
    exit /b 1
)
echo [OK] Python found.

:: 2. Check for Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo Please install Node.js from nodejs.org
    pause
    exit /b 1
)
echo [OK] Node.js found.

:: 3. Setup Backend
echo.
echo [1/3] Setting up Backend...
cd backend

if not exist venv (
    echo Creating virtual environment...
    python -m venv venv
)

echo Installing backend dependencies...
call venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt

:: 4. Setup Environment Variables
echo.
echo [2/3] Configuring Environment...
if not exist .env (
    echo Creating .env from .env.example...
    copy .env.example .env >nul
    
    :: Generate a random key using Python
    echo Generating secure encryption key...
    for /f "tokens=*" %%a in ('python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"') do set NEW_KEY=%%a
    
    :: Replace placeholder in .env
    :: We use a temporary file for replacement because batch is bad at string replacement in files
    powershell -Command "(gc .env) -replace 'your_encryption_key_here', '!NEW_KEY!' | Out-File -encoding ASCII .env"
    echo [OK] .env created with fresh ENCRYPTION_KEY.
) else (
    echo [SKIP] .env already exists.
)

:: 5. Setup Frontend
echo.
echo [3/3] Setting up Frontend...
cd ..\frontend
echo Installing frontend dependencies (this may take a minute)...
call npm install
echo [OK] Frontend dependencies installed.

echo.
echo ################################################
echo #          Setup Complete!                     #
echo ################################################
echo.
echo Your environment is fully configured. 
echo The application will now launch automatically...
echo.
timeout /t 3 >nul

:: Navigate back to root and launch run.bat
cd ..
start run.bat
