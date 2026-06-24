"""Helpers de admin para modelos con `ModeloBase`."""
from django.contrib import admin


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
