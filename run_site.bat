@echo off
setlocal enabledelayedexpansion
title Tarcin Robotics - Palani Interns Workflow

echo ================================================================
echo       TARCIN ROBOTICS LLP - PALANI INTERNS WORKFLOW
echo         Guide: Palani Pandi C (Embedded ^& IoT Engineer)
echo ================================================================
echo.

cd /d "%~dp0"

:: 1. Verify Node.js installation
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not found on your PATH!
    echo Please install Node.js from https://nodejs.org/
    echo Once installed, double-click this run_site.bat again.
    echo.
    pause
    exit /b 1
)

echo [OK] Node.js detected:
node -v
echo.

echo [STARTING] Launching Central Multi-User Server on Port 5000...
echo.
echo Access URLs:
echo   - Guide Dashboard (This PC):   http://localhost:5000
echo   - Interns on Same Wi-Fi/LAN:   Check LAN IP displayed below
echo.
echo Default Guide Login:
echo   Username: palani
echo   Password: 123456
echo.
echo Press Ctrl+C anytime to stop the server.
echo ================================================================
echo.

:: Automatically launch browser at http://localhost:5000
start "" cmd /c "timeout /t 1 /nobreak >nul && start http://localhost:5000"

:: Start the server immediately in current console
node server\server.js
