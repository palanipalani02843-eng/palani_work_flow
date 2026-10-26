@echo off
setlocal enabledelayedexpansion
title Tarcin Robotics - Palani Interns Workflow (Online Public Mode)

echo ================================================================
echo       TARCIN ROBOTICS LLP - PALANI INTERNS WORKFLOW
echo                [ONLINE INTERNET ACCESS MODE]
echo         Guide: Palani Pandi C (Embedded ^& IoT Engineer)
echo ================================================================
echo.

cd /d "%~dp0"

:: 1. Verify Node.js installation
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not found on your PATH!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo [1/2] Starting Central Backend Server on Port 5000...
start "Tarcin Central Server (Port 5000)" /min cmd /c "node server\server.js"
timeout /t 2 /nobreak >nul

echo [2/2] Creating Free Secure Public HTTPS Link for Interns...
echo.
echo ================================================================
echo   INTERNS CAN ACCESS YOUR SITE USING THIS PUBLIC URL:
echo ================================================================
echo.

cmd /c "npx.cmd -y localtunnel --port 5000"
