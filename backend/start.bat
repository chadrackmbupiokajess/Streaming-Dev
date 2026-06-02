@echo off
cd /d "%~dp0"

if not exist "venv\Scripts\python.exe" (
    echo Creation de l'environnement virtuel...
    python -m venv venv
)

call venv\Scripts\activate.bat
pip install -r requirements.txt -q
python manage.py migrate --noinput
echo Demarrage du serveur Daphne sur http://127.0.0.1:8001
python run_daphne.py
