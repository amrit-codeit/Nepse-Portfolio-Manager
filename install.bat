@echo off
setlocal enabledelayedexpansion

echo ==============================================================
echo Nepal Portfolio Manager - Unified Master Installer
echo ==============================================================
echo.

:: 1. Check/Install Winget (required for everything else)
winget --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] 'winget' is not found. Please ensure you are on Windows 10/11.
    echo Installation cannot proceed automatically.
    pause
    exit /b 1
)

:: 2. Check/Install Git
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Installing Git...
    winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
    set REFRESH_NEEDED=1
) else (
    echo [OK] Git is installed.
)

:: 3. Check/Install Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    python3 --version >nul 2>&1
    if !errorlevel! neq 0 (
        echo [INFO] Installing Python 3.12...
        winget install -e --id Python.Python.3.12 --accept-package-agreements --accept-source-agreements
        set REFRESH_NEEDED=1
    ) else (
        echo [OK] Python (python3) is installed.
    )
) else (
    echo [OK] Python is installed.
)

:: 4. Check/Install Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Installing Node.js...
    winget install -e --id OpenJS.NodeJS --accept-package-agreements --accept-source-agreements
    set REFRESH_NEEDED=1
) else (
    echo [OK] Node.js is installed.
)

:: 5. Refresh Environment if something was installed
if "%REFRESH_NEEDED%"=="1" (
    echo [INFO] Refreshing environment variables...
    :: This trick refreshes the PATH in the current CMD window
    for /f "tokens=*" %%a in ('powershell -Command "[System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')"') do set "PATH=%%a"
)

:: 6. Handle Repository
if not exist ".git" (
    if exist "Nepse-Portfolio-Manager" (
        cd Nepse-Portfolio-Manager
    ) else (
        echo [INFO] Cloning repository...
        git clone https://github.com/amrit-codeit/Nepse-Portfolio-Manager.git
        cd Nepse-Portfolio-Manager
    )
) else (
    echo [INFO] Updating repository...
    git pull origin main
)

:: 7. Handover to Setup
if exist setup.bat (
    echo [INFO] Launching setup...
    call setup.bat
) else (
    echo [ERROR] setup.bat not found. Please check your repository.
    pause
    exit /b 1
)

exit /b 0
