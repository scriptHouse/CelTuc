"""Punto de entrada WSGI del proyecto CelTuc (gunicorn lo usa en produccion)."""
import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'celtuc.settings')

application = get_wsgi_application()
