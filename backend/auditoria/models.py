"""Registro de auditoria: que hizo cada cuenta, cuando y con que cambios.

Cada fila es UNA accion de UN usuario sobre UN objeto (creo una venta, edito un
producto, elimino un usuario, inicio sesion). Se escribe sola desde señales
(ver `registro.py`) y nunca se edita ni se borra desde la app: es la memoria
del sistema, pensada para que el superadministrador pueda reconstruir que paso.
"""
from django.conf import settings
from django.db import models
from django.utils import timezone


class RegistroAuditoria(models.Model):
    """Una accion registrada. Tabla append-only (sin borrado logico, a proposito)."""

    class Accion(models.TextChoices):
        CREAR = 'crear', 'Creo'
        EDITAR = 'editar', 'Edito'
        ELIMINAR = 'eliminar', 'Elimino'
        RESTAURAR = 'restaurar', 'Restauro'
        INGRESO = 'ingreso', 'Inicio sesion'
        IMPERSONAR = 'impersonar', 'Impersono'

    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
        verbose_name='usuario',
    )
    # Foto del username: si la cuenta se elimina, el historial sigue diciendo quien fue.
    usuario_username = models.CharField('usuario (foto)', max_length=150, blank=True)
    # Impersonacion: `usuario` es la cuenta con la que se hizo la accion y esto,
    # el superadministrador que estaba realmente detras. Vacio en lo normal.
    actor_username = models.CharField('actor real', max_length=150, blank=True)
    accion = models.CharField('accion', max_length=12, choices=Accion.choices)
    app = models.CharField('modulo', max_length=50, blank=True)
    modelo = models.CharField('modelo', max_length=80, blank=True)
    objeto_id = models.CharField('id del objeto', max_length=40, blank=True)
    # Foto del str() del objeto al momento de la accion (sobrevive a renombres).
    objeto = models.CharField('objeto', max_length=300, blank=True)
    # Solo lo que cambio: {campo: {'antes': valor, 'despues': valor}}.
    cambios = models.JSONField('cambios', default=dict, blank=True)
    ip = models.GenericIPAddressField('IP', null=True, blank=True)
    creado = models.DateTimeField('fecha', default=timezone.now, editable=False, db_index=True)

    class Meta:
        db_table = 'auditoria_registros'
        verbose_name = 'registro de auditoria'
        verbose_name_plural = 'registros de auditoria'
        ordering = ('-creado', '-id')
        indexes = [
            models.Index(fields=('usuario_username', '-creado')),
            models.Index(fields=('accion', '-creado')),
            models.Index(fields=('app', '-creado')),
        ]

    def __str__(self):
        return f'{self.usuario_username or "?"} {self.get_accion_display().lower()}: {self.objeto}'
