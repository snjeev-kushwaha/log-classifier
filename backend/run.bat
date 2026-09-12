@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

echo ====================================================================
echo Starting Log Classifier Backend Setup and Server
echo ====================================================================

echo [1/4] Checking environment configuration...
if not exist ".env" (
    if exist ".env.example" (
        echo Creating .env from .env.example...
        copy .env.example .env >nul
    ) else (
        echo Warning: .env.example not found.
    )
) else (
    echo .env configuration found.
)

echo.
echo [2/4] Checking Python virtual environment...
if not exist "venv\Scripts\python.exe" (
    echo Creating virtual environment with Python 3.12...
    where uv >nul 2>&1
    if !errorlevel! equ 0 (
        uv venv --python 3.12 venv
    ) else (
        py -3.12 -m venv venv 2>nul || python -m venv venv
    )
) else (
    echo Virtual environment already exists.
)

echo.
echo [3/4] Installing / verifying dependencies...
where uv >nul 2>&1
if !errorlevel! equ 0 (
    uv pip install -r requirements.txt --python .\venv\Scripts\python.exe
) else (
    .\venv\Scripts\pip.exe install -r requirements.txt
)

echo.
echo [4/4] Starting FastAPI backend server...
echo Server running on http://127.0.0.1:8000
echo API documentation available at http://127.0.0.1:8000/docs
echo Press CTRL+C to stop the server.
echo.
.\venv\Scripts\uvicorn.exe app.main:app --reload --host 127.0.0.1 --port 8000
