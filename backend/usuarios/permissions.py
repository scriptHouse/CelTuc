"""Permisos de DRF basados en el sistema de roles.

Centraliza la autorizacion de la API en dos clases reutilizables, en vez de
repetir chequeos de `is_staff` por toda la base. El superusuario y los roles
`es_admin` pasan siempre (ver `Usuario.es_administrador`).
"""
from rest_framework import permissions


class EsAdministrador(permissions.BasePermission):
    """Solo administradores (superusuario, staff o rol con es_admin)."""

    message = 'Necesitas permisos de administrador.'

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.es_administrador)


class LecturaConPermisoEscrituraAdmin(permissions.BasePermission):
    """Lectura: requiere el permiso de modulo declarado por la vista.

    La vista declara `permiso_requerido = '<codigo>'`. Para metodos seguros
    (GET/HEAD/OPTIONS) la cuenta necesita ese permiso (o ser admin). Para
    escribir (POST/PUT/PATCH/DELETE) hace falta ser administrador.
    """

    message = 'No tenes permiso para acceder a este modulo.'

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if user.es_administrador:
            return True
        if request.method in permissions.SAFE_METHODS:
            codigo = getattr(view, 'permiso_requerido', None)
            return codigo is None or codigo in user.codigos_permisos()
        return False
