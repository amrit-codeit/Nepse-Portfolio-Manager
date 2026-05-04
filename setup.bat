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
:: NOTE: Must use a compatible Python version (3.10-3.12) because numba fails on newer versions.
echo [INFO] Checking for compatible Python version ^(3.10 to 3.12^)...
set "PY_CMD="
for %%C in ("py -3.12" "py -3.11" "py -3.10" python python3) do (
    %%~C -c "import sys; sys.exit(0 if sys.version_info.major==3 and sys.version_info.minor in [10, 11, 12] else 1)" >nul 2>&1
    if !errorlevel! equ 0 (
        set "PY_CMD=%%~C"
        goto :PY_FOUND_INITIAL
    )
)
:PY_FOUND_INITIAL

if "!PY_CMD!"=="" (
    echo [INSTALLING] Compatible Python not found. Installing Python 3.12...
    winget install -e --id Python.Python.3.12 --accept-package-agreements --accept-source-agreements
    set "NEED_PATH_REFRESH=1"
) else (
    echo [OK] Compatible Python found: !PY_CMD!
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
for %%C in ("py -3.12" "py -3.11" "py -3.10" python python3) do (
    %%~C -c "import sys; sys.exit(0 if sys.version_info.major==3 and sys.version_info.minor in [10, 11, 12] else 1)" >nul 2>&1
    if !errorlevel! equ 0 (
        set "PY_CMD=%%~C"
        goto :PY_FOUND_FINAL
    )
)
:PY_FOUND_FINAL
if "!PY_CMD!"=="" (
    echo [ERROR] Compatible Python ^(3.10 to 3.12^) is not reachable. Please restart your PC and run setup.bat again.
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

if exist "venv" (
    venv\Scripts\python.exe -c "import sys; sys.exit(0 if sys.version_info.major==3 and sys.version_info.minor in [10, 11, 12] else 1)" >nul 2>&1
    if !errorlevel! neq 0 (
        echo [INFO] Existing virtual environment has an incompatible Python version. Recreating...
        rmdir /s /q "venv"
    )
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

:: Use a dedicated Python script to handle .env generation reliably.
:: This avoids fragile batch for/f parsing and silent failures.
venv\Scripts\python.exe scripts\bootstrap_env.py "..\.env"
if !errorlevel! neq 0 (
    echo [ERROR] Failed to configure .env file. See errors above.
    goto :FAIL
)
echo      TIP: Default master password is admin123 ^(change it in Settings^)

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
