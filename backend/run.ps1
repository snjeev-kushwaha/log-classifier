# ==============================================================================
# Script to setup dependencies and run the FastAPI backend server
# ==============================================================================
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host "Starting Log Classifier Backend Setup and Server" -ForegroundColor Cyan
Write-Host "====================================================================" -ForegroundColor Cyan

Write-Host "`n[1/4] Checking environment configuration..." -ForegroundColor Cyan
if (-not (Test-Path ".env")) {
    if (Test-Path ".env.example") {
        Write-Host "Creating .env from .env.example..." -ForegroundColor Yellow
        Copy-Item ".env.example" ".env"
    } else {
        Write-Warning ".env.example not found."
    }
} else {
    Write-Host ".env configuration exists." -ForegroundColor Green
}

Write-Host "`n[2/4] Checking virtual environment..." -ForegroundColor Cyan
if (-not (Test-Path "venv\Scripts\python.exe")) {
    Write-Host "Creating virtual environment with Python 3.12..." -ForegroundColor Yellow
    if (Get-Command uv -ErrorAction SilentlyContinue) {
        uv venv --python 3.12 venv
    } elseif (Get-Command py -ErrorAction SilentlyContinue) {
        py -3.12 -m venv venv
    } else {
        python -m venv venv
    }
} else {
    Write-Host "Virtual environment exists." -ForegroundColor Green
}

Write-Host "`n[3/4] Installing / verifying dependencies..." -ForegroundColor Cyan
if (Get-Command uv -ErrorAction SilentlyContinue) {
    uv pip install -r requirements.txt --python .\venv\Scripts\python.exe
} else {
    .\venv\Scripts\pip.exe install -r requirements.txt
}

Write-Host "`n[4/4] Starting FastAPI backend server..." -ForegroundColor Cyan
Write-Host "Server running on http://127.0.0.1:8000" -ForegroundColor Green
Write-Host "Interactive docs available at http://127.0.0.1:8000/docs" -ForegroundColor Green
Write-Host "Press CTRL+C to stop the server.`n" -ForegroundColor DarkGray
& .\venv\Scripts\uvicorn.exe app.main:app --reload --host 127.0.0.1 --port 8000
