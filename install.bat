@echo off
setlocal
echo ==============================================================
echo Nepse Portfolio Manager - Automatic Installer
echo ==============================================================
echo.

:: Check for Git
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [!]: Git is not installed on this PC.
    echo Installing Git silently via winget...
    winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
    if %errorlevel% neq 0 (
        echo [ERROR]: Failed to install Git. Please install Git manually from https://git-scm.com/
        pause
        exit /b 1
    )
    echo [OK]: Git installed successfully.
    echo Please CLOSE this window and run install.bat again so your PC recognizes Git.
    pause
    exit /b 0
)

echo [OK]: Git is already installed.

:: Clone the repo
echo [INFO]: Downloading Nepse Portfolio Manager from GitHub...
git clone https://github.com/amrit-codeit/Nepse-Portfolio-Manager.git

if %errorlevel% neq 0 (
    echo [ERROR]: Failed to download the repository. Check your internet connection.
    pause
    exit /b 1
)

:: Navigate into the cloned folder
cd Nepse-Portfolio-Manager

:: Run setup.bat
echo [INFO]: Starting initial project setup...
if exist setup.bat (
    call setup.bat
) else (
    echo [ERROR]: setup.bat not found inside the repository!
    pause
    exit /b 1
)

echo.
echo ==============================================================
echo Installation Complete!
echo You can now use run.bat inside the "Nepse-Portfolio-Manager" folder to start the app.
echo ==============================================================
pause
