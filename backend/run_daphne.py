import os

import django
from daphne.cli import CommandLineInterface
from django.utils.autoreload import run_with_reloader

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'streaming_backend.settings')
django.setup()


def run_server():
    port = os.environ.get('DAPHNE_PORT', '8001')
    host = os.environ.get('DAPHNE_HOST', '127.0.0.1')

    CommandLineInterface().run(
        [
            'streaming_backend.asgi:application',
            '--bind',
            host,
            '--port',
            port,
        ]
    )


if os.environ.get('DAPHNE_RELOAD', '1') == '1':
    run_with_reloader(run_server)
else:
    run_server()
