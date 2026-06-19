@echo off
title AudioDrip Server
color 0A

echo.
echo  ╔═══════════════════════════════════════╗
echo  ║       A U D I O D R I P  v3.0        ║
echo  ║     Premium Music Streaming App       ║
echo  ╚═══════════════════════════════════════╝
echo.

REM Navigate to Server directory
cd /d "%~dp0Server"

REM Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python is not installed or not in PATH.
    echo         Please install Python 3.11+ from https://python.org
    pause
    exit /b 1
)

REM Check if PostgreSQL is reachable (psql in PATH)
REM (Optional check — server will warn gracefully if DB is missing)

REM Install dependencies if needed
echo [1/3] Checking Python dependencies...
pip install -r requirements.txt -q --disable-pip-version-check

REM Run database init (idempotent — safe to run every time)
echo [2/3] Initialising database schema...
python init_db.py

REM Launch the server
echo [3/3] Starting AudioDrip server on http://localhost:8000
echo.
echo  ► Open your browser: http://localhost:8000
echo  ► Mobile access:     http://[your-local-ip]:8000
echo.
echo  Press Ctrl+C to stop the server.
echo.
python app.py

pause
