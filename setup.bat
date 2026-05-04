@echo off
setlocal enabledelayedexpansion

echo ==============================================================
echo   Nepal Portfolio Manager - Setup
echo ==============================================================
echo.
echo   TIP: Right-click this file and "Run as administrator" if
echo        any installations fail.
echo.

:: Always work from the script's own directory
cd /d "%~dp0"

:: ============================================================
:: PHASE 1: Install Prerequisites via Winget
:: ============================================================

where winget >nul 2>&1
if !errorlevel! neq 0 (
    echo [ERROR] 'winget' is not available on this system.
    echo         Ensure you are on Windows 10 1709+ or Windows 11.
    echo         Open Microsoft Store and update "App Installer" if needed.
    goto :FAIL
)
echo [OK] winget found.

:: --- Git ---
where git >nul 2>&1
if !errorlevel! neq 0 (
    echo [INSTALLING] Git...
    winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
    set "NEED_PATH_REFRESH=1"
) else (
    echo [OK] Git found.
)

:: --- Python ---
:: NOTE: Must use --version, not `where`. Windows ships a fake python.exe
:: alias in WindowsApps that `where` finds but isn't real Python.
python --version >nul 2>&1
if !errorlevel! neq 0 (
    python3 --version >nul 2>&1
    if !errorlevel! neq 0 (
        echo [INSTALLING] Python 3.12...
        winget install -e --id Python.Python.3.12 --accept-package-agreements --accept-source-agreements
        set "NEED_PATH_REFRESH=1"
    ) else (
        echo [OK] Python found ^(as python3^).
    )
) else (
    echo [OK] Python found.
)

:: --- Node.js ---
node --version >nul 2>&1
if !errorlevel! neq 0 (
    echo [INSTALLING] Node.js LTS...
    winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    set "NEED_PATH_REFRESH=1"
) else (
    echo [OK] Node.js found.
)

:: --- Refresh PATH if anything was installed ---
if "!NEED_PATH_REFRESH!"=="1" (
    echo.
    echo [INFO] Refreshing system PATH...
    for /f "tokens=*" %%a in ('powershell -NoProfile -Command "[System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')"') do set "PATH=%%a"
)

:: --- Detect working Python command ---
echo.
set "PY_CMD="
python --version >nul 2>&1
if !errorlevel! equ 0 (
    set "PY_CMD=python"
) else (
    python3 --version >nul 2>&1
    if !errorlevel! equ 0 (
        set "PY_CMD=python3"
    )
)
if "!PY_CMD!"=="" (
    echo [ERROR] Python is not reachable. Please restart your PC and run setup.bat again.
    goto :FAIL
)
echo [OK] Python = !PY_CMD!

git --version >nul 2>&1
if !errorlevel! neq 0 (
    echo [ERROR] Git is not reachable. Please restart your PC and run setup.bat again.
    goto :FAIL
)
echo [OK] Git verified.

node --version >nul 2>&1
if !errorlevel! neq 0 (
    echo [ERROR] Node.js is not reachable. Please restart your PC and run setup.bat again.
    goto :FAIL
)
echo [OK] Node.js verified.

:: ============================================================
:: PHASE 2: Get the Repository
:: ============================================================
echo.

if exist ".git" (
    echo [INFO] Already inside the repository. Pulling latest...
    git pull origin main
) else if exist "Nepse-Portfolio-Manager\.git" (
    echo [INFO] Repository folder found. Entering it...
    cd /d "%~dp0Nepse-Portfolio-Manager"
) else (
    echo [INFO] Cloning repository...
    git clone https://github.com/amrit-codeit/Nepse-Portfolio-Manager.git
    if !errorlevel! neq 0 (
        echo [ERROR] Failed to clone repository. Check your internet connection.
        goto :FAIL
    )
    cd /d "%~dp0Nepse-Portfolio-Manager"
)

:: ============================================================
:: PHASE 3: Backend — Virtual Environment + Dependencies
:: ============================================================
echo.
echo [1/4] Setting up Python virtual environment...
cd backend 2>nul
if !errorlevel! neq 0 (
    echo [ERROR] 'backend' folder not found. Are you inside the correct repository?
    goto :FAIL
)

if not exist "venv" (
    !PY_CMD! -m venv venv
    if !errorlevel! neq 0 (
        echo [ERROR] Failed to create virtual environment.
        goto :FAIL
    )
)

echo [2/4] Installing Python dependencies...
venv\Scripts\python.exe -m pip install --upgrade pip --quiet
venv\Scripts\pip.exe install -r requirements.txt --quiet
if !errorlevel! neq 0 (
    echo [ERROR] Failed to install Python dependencies. Check your internet.
    goto :FAIL
)
echo [OK] Backend dependencies installed.

:: ============================================================
:: PHASE 4: Environment Configuration (.env)
:: ============================================================
echo.
echo [3/4] Configuring environment...

if not exist "..\.env" (
    if exist "..\.env.example" (
        copy "..\.env.example" "..\.env" >nul
    ) else (
        echo DEBUG=True> "..\.env"
        echo DATABASE_URL=sqlite:///./portfolio.db>> "..\.env"
        echo ENCRYPTION_KEY=your_encryption_key_here>> "..\.env"
        echo PORT=6767>> "..\.env"
        echo VITE_PORT=3055>> "..\.env"
    )

    :: Generate encryption key
    for /f "tokens=*" %%a in ('venv\Scripts\python.exe -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"') do set "NEW_KEY=%%a"

    :: Install bcrypt (not in requirements.txt) and generate default password hash
    venv\Scripts\pip.exe install bcrypt --quiet >nul 2>&1
    for /f "tokens=*" %%b in ('venv\Scripts\python.exe -c "import bcrypt; print(bcrypt.hashpw(b'admin123', bcrypt.gensalt()).decode())"') do set "HASHED_PASS=%%b"

    :: Write values into .env
    powershell -NoProfile -Command "(Get-Content '..\.env') -replace 'your_encryption_key_here', '!NEW_KEY!' | Set-Content -Encoding ASCII '..\.env'"
    echo.>> "..\.env"
    echo MASTER_PASSWORD=!HASHED_PASS!>> "..\.env"

    echo [OK] .env created with secure defaults.
    echo      Default master password: admin123 ^(change it in Settings^)
) else (
    echo [OK] .env already exists, skipping.
)

:: ============================================================
:: PHASE 5: Frontend Build
:: ============================================================
echo.
echo [4/4] Building frontend...
cd ..\frontend

call npm install
if !errorlevel! neq 0 (
    echo [ERROR] Failed to install frontend dependencies.
    goto :FAIL
)

call npm run build
if !errorlevel! neq 0 (
    echo [ERROR] Frontend build failed.
    goto :FAIL
)
echo [OK] Frontend built successfully.

:: ============================================================
:: DONE
:: ============================================================
cd ..

echo.
echo ==============================================================
echo   Setup Complete!
echo ==============================================================
echo.
echo   To start the application, double-click:  run.bat
echo.
echo   Launching the app now...
echo.
timeout /t 3 >nul

call run.bat
exit /b 0

:FAIL
echo.
echo ==============================================================
echo   SETUP FAILED - See errors above.
echo ==============================================================
echo.
pause
exit /b 1
