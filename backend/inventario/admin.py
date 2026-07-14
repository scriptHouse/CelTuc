from django.contrib import admin
from unfold.admin import ModelAdmin

from comun.admin import ModeloBaseAdminMixin

from .models import MovimientoStock, StockProducto, Sucursal

_AUDITORIA = (
    'creado', 'actualizado', 'creado_por', 'actualizado_por',
    'fecha_borrado', 'borrado_por',
)


@admin.register(Sucursal)
class SucursalAdmin(ModeloBaseAdminMixin, ModelAdmin):
    list_display = ('nombre', 'activa', 'borrado', 'orden', 'actualizado')
    list_filter = ('activa', 'borrado')
    search_fields = ('nombre',)
    readonly_fields = _AUDITORIA
    actions = ('restaurar',)


@admin.register(StockProducto)
class StockProductoAdmin(ModeloBaseAdminMixin, ModelAdmin):
    list_display = ('producto', 'sucursal', 'cantidad', 'stock_minimo', 'actualizado')
    list_filter = ('sucursal',)
    search_fields = ('producto__nombre',)
    autocomplete_fields = ('producto',)
    readonly_fields = _AUDITORIA


@admin.register(MovimientoStock)
class MovimientoStockAdmin(ModeloBaseAdminMixin, ModelAdmin):
    list_display = ('creado', 'tipo', 'delta', 'resultante', 'producto', 'sucursal', 'creado_por')
    list_filter = ('tipo', 'sucursal')
    search_fields = ('producto__nombre', 'nota')
    autocomplete_fields = ('producto',)
    readonly_fields = _AUDITORIA
