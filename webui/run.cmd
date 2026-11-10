@echo off
cd /d "%~dp0"
python -c "import sys; raise SystemExit(0 if sys.version_info.major >= 3 else 1)" >nul 2>&1
if errorlevel 1 (
  echo Python 3 is required. Install Python 3 and run this file again.
  pause
  exit /b 1
)
python server.py
if errorlevel 1 pause
