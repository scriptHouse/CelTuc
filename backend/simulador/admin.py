from django.contrib import admin
from unfold.admin import ModelAdmin, TabularInline

from comun.admin import ModeloBaseAdminMixin

from .models import PlanCuota, Tarjeta


class PlanCuotaInline(TabularInline):
    model = PlanCuota
    extra = 0
    fields = ('etiqueta', 'cuotas', 'interes', 'orden', 'activo')


@admin.register(Tarjeta)
class TarjetaAdmin(ModeloBaseAdminMixin, ModelAdmin):
    list_display = ('nombre', 'categoria', 'activa', 'borrado', 'orden', 'actualizado')
    list_filter = ('categoria', 'activa', 'borrado')
    search_fields = ('nombre', 'descripcion')
    inlines = (PlanCuotaInline,)
    readonly_fields = (
        'creado', 'actualizado', 'creado_por', 'actualizado_por',
        'fecha_borrado', 'borrado_por',
    )
    actions = ('restaurar',)
