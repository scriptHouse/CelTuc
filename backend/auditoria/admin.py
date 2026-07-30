from django.contrib import admin
from unfold.admin import ModelAdmin

from .models import RegistroAuditoria


@admin.register(RegistroAuditoria)
class RegistroAuditoriaAdmin(ModelAdmin):
    """Solo lectura: el historial no se edita ni se borra desde el admin."""

    list_display = ('creado', 'usuario_username', 'accion', 'modelo', 'objeto')
    list_filter = ('accion', 'app')
    search_fields = ('usuario_username', 'objeto', 'modelo')
    date_hierarchy = 'creado'

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
