@echo off
title Apna Enterprises - Starting...
echo ==========================================
echo   Apna Enterprises ERP System
echo   Starting application, please wait...
echo ==========================================
echo.

cd /d "C:\Apna Eterprises\Apna-Enterprises"

set NODE_PATH=C:\Users\DELL\AppData\Local\ms-playwright-go\1.57.0\node.exe

if exist "%NODE_PATH%" (
    echo [OK] Node.js found. Launching app...
    "%NODE_PATH%" .\node_modules\electron\cli.js .
) else (
    echo [ERROR] Node.js not found at expected path.
    echo Please install Node.js from https://nodejs.org
    pause
)
