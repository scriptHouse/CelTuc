"""Permisos de la API de facturacion.

Distinto al resto del sistema, aca *emitir* (un POST) lo puede hacer cualquier
cuenta con el permiso del modulo (un cajero factura), no solo un administrador.
La gestion de emisores y sus credenciales si queda para administradores: esas
vistas usan `LecturaConPermisoEscrituraAdmin` de la app `usuarios`.
"""
from rest_framework import permissions

PERMISO_MODULO = 'ver_facturacion'


class PuedeFacturar(permissions.BasePermission):
    """Leer y emitir comprobantes: cuenta con `ver_facturacion` (o admin)."""

    message = 'No tenes permiso para acceder a facturacion.'

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if user.es_administrador:
            return True
        return PERMISO_MODULO in user.codigos_permisos()
