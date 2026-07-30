"""Middleware que expone la peticion actual a las señales de auditoria."""
from . import contexto


class AuditoriaMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        contexto.activar(request)
        try:
            return self.get_response(request)
        finally:
            contexto.desactivar()
