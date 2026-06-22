"""Punto de entrada ASGI del proyecto CelTuc."""
import os

from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'celtuc.settings')

application = get_asgi_application()
