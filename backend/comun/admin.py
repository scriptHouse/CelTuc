"""Helpers de admin para modelos con `ModeloBase` (y el admin de Preferencia)."""
from django.contrib import admin
from unfold.admin import ModelAdmin

from .models import Preferencia


class ModeloBaseAdminMixin:
    """Admin para modelos con borrado logico.

    Muestra tambien los registros borrados (para revisarlos o restaurarlos) y
    agrega una accion "Restaurar". Combinar con `list_filter`/`list_display` que
    incluyan `borrado` en cada ModelAdmin concreto.
    """

    def get_queryset(self, request):
        return self.model.todos.all()

    @admin.action(description='Restaurar (deshacer borrado logico)')
    def restaurar(self, request, queryset):
        restaurados = queryset.update(borrado=False, fecha_borrado=None, borrado_por=None)
        self.message_user(request, f'{restaurados} registro(s) restaurado(s).')


@admin.register(Preferencia)
class PreferenciaAdmin(ModeloBaseAdminMixin, ModelAdmin):
    list_display = ('clave', 'actualizado', 'actualizado_por', 'borrado')
    search_fields = ('clave', 'valor')
    readonly_fields = (
        'creado', 'actualizado', 'creado_por', 'actualizado_por',
        'fecha_borrado', 'borrado_por',
    )
    actions = ('restaurar',)
