@echo off
setlocal
cd /d "%~dp0.."
set ELECTRON_DISABLE_SECURITY_WARNINGS=true
call npm.cmd run desktop