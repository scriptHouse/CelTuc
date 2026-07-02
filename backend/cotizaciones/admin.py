from django.contrib import admin
from unfold.admin import ModelAdmin, TabularInline

from comun.admin import ModeloBaseAdminMixin

from .models import CotizacionEquipo, ModeloEquipo, PrecioServicio, TipoServicio


class CotizacionEquipoInline(TabularInline):
    model = CotizacionEquipo
    extra = 0
    fields = ('capacidad_gb', 'precio_min', 'precio_max')


class PrecioServicioInline(TabularInline):
    model = PrecioServicio
    extra = 0
    fields = ('tipo', 'precio')


@admin.register(ModeloEquipo)
class ModeloEquipoAdmin(ModeloBaseAdminMixin, ModelAdmin):
    list_display = ('nombre', 'marca', 'activo', 'borrado', 'orden', 'actualizado')
    list_filter = ('marca', 'activo', 'borrado')
    search_fields = ('nombre', 'marca')
    inlines = (CotizacionEquipoInline, PrecioServicioInline)
    readonly_fields = (
        'creado', 'actualizado', 'creado_por', 'actualizado_por',
        'fecha_borrado', 'borrado_por',
    )
    actions = ('restaurar',)


@admin.register(TipoServicio)
class TipoServicioAdmin(ModeloBaseAdminMixin, ModelAdmin):
    list_display = ('nombre', 'activo', 'borrado', 'orden', 'actualizado')
    list_filter = ('activo', 'borrado')
    search_fields = ('nombre',)
    readonly_fields = (
        'creado', 'actualizado', 'creado_por', 'actualizado_por',
        'fecha_borrado', 'borrado_por',
    )
    actions = ('restaurar',)
