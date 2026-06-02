$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$venvPython = Join-Path $PSScriptRoot "venv\Scripts\python.exe"
$venvPip = Join-Path $PSScriptRoot "venv\Scripts\pip.exe"

if (-not (Test-Path $venvPython)) {
    Write-Host "Creation de l'environnement virtuel..."
    python -m venv venv
}

Write-Host "Installation des dependances..."
& $venvPip install -r requirements.txt -q

Write-Host "Application des migrations..."
& $venvPython manage.py migrate --noinput

Write-Host "Demarrage du serveur Daphne sur http://127.0.0.1:8001"
& $venvPython run_daphne.py
