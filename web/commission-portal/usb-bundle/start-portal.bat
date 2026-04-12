@echo off
REM Thin wrapper -- delegates to start-portal.ps1 (PowerShell handles UTF-8 properly).
REM CMD.exe + chcp 65001 + multi-byte chars causes line-read misalignment.
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-portal.ps1"
if errorlevel 1 pause
exit /b %ERRORLEVEL%
