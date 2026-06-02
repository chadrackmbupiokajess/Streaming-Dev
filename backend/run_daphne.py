import os
import sys
import django

# Définir la variable d'environnement
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'streaming_backend.settings')

# Initialiser Django
django.setup()

# Démarrer Daphne
from daphne.cli import CommandLineInterface
CommandLineInterface().run(['streaming_backend.asgi:application', '--port', '8000'])
