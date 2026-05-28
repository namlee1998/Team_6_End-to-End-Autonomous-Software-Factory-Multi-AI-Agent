@echo off
:: Chạy từ bất kỳ đâu — script tự tìm đúng thư mục demo\
set "DEMO_DIR=%~dp0"
cd /d "%DEMO_DIR%"

echo.
echo  AIDLC Control Platform - Demo Server
echo  =====================================
echo  Dir: %DEMO_DIR%
echo.

python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Install Python 3.9+
    pause & exit /b 1
)

python -c "import fastapi, uvicorn" >nul 2>&1
if errorlevel 1 (
    echo [INFO] Installing dependencies...
    pip install -r "%DEMO_DIR%requirements.txt"
)

echo [OK] http://localhost:8080
echo [OK] Ctrl+C to stop
echo.
start "" http://localhost:8080
python -m uvicorn app:app --host 0.0.0.0 --port 8080 --reload
