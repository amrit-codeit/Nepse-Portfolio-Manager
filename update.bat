@echo off
setlocal
echo ==============================================================
echo Nepse Portfolio Manager - Update Utility
echo ==============================================================
echo.

echo Checking for updates from GitHub...

:: Save any local changes temporarily so git pull doesn't fail
git stash

:: Fetch new changes
git fetch --all

:: Pull the latest code
git pull origin main

:: Restore any local changes
git stash pop

echo.
echo ==============================================================
echo Update complete!
echo Double-click run.bat to start the updated application.
echo ==============================================================
pause
