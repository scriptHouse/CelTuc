"""Autenticación machine-to-machine para los agentes de sucursal.

Los agentes mandan ``Authorization: Bearer asist_<hex>``. Se guarda solo el
hash SHA-256 del token: una fuga de la base no permite fichar. Los tokens
son por agente (spec §19) y se generan/rotan desde la interfaz de Asistencia.

Si el header no empieza con ``asist_`` esta clase se abstiene (devuelve None)
para que el JWT de usuarios siga funcionando en el resto de la API.
"""
from django.contrib.auth.models import AnonymousUser
from rest_framework import permissions
from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed

from .models import TOKEN_PREFIJO, Agente, hash_token


class AgenteTokenAuthentication(BaseAuthentication):
    def authenticate(self, request):
        encabezado = get_authorization_header(request).split()
        if len(encabezado) != 2 or encabezado[0].lower() != b'bearer':
            return None
        try:
            token = encabezado[1].decode('utf-8')
        except UnicodeDecodeError:
            return None
        if not token.startswith(TOKEN_PREFIJO):
            return None  # no es un token de agente: que lo intente el JWT

        agente = (
            Agente.todos
            .select_related('dispositivo', 'dispositivo__sucursal')
            .filter(token_hash=hash_token(token))
            .first()
        )
        if agente is None:
            raise AuthenticationFailed('Token de agente inválido.')
        if agente.borrado or not agente.activo:
            raise AuthenticationFailed('El agente está desactivado.')
        if agente.dispositivo.borrado or not agente.dispositivo.activo:
            raise AuthenticationFailed('El reloj asociado está desactivado.')
        return (AnonymousUser(), agente)

    def authenticate_header(self, request):
        return 'Bearer'


class EsAgenteAutenticado(permissions.BasePermission):
    """Permite el acceso solo a peticiones autenticadas con token de agente."""

    message = 'Se requiere un token de agente válido.'

    def has_permission(self, request, view):
        return isinstance(getattr(request, 'auth', None), Agente)
