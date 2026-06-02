import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'streaming_backend.settings')
django.setup()

from daphne.cli import CommandLineInterface

port = os.environ.get('DAPHNE_PORT', '8001')
host = os.environ.get('DAPHNE_HOST', '127.0.0.1')

CommandLineInterface().run([
    'streaming_backend.asgi:application',
    '--bind', host,
    '--port', port,
])