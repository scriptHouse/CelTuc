from django.contrib import admin
from unfold.admin import ModelAdmin

from comun.admin import ModeloBaseAdminMixin

from unfold.admin import TabularInline

from .models import (
    ItemVenta,
    MovimientoStock,
    PagoVenta,
    StockProducto,
    Sucursal,
    VaciadoStock,
    VaciadoStockItem,
    Venta,
)

_AUDITORIA = (
    'creado', 'actualizado', 'creado_por', 'actualizado_por',
    'fecha_borrado', 'borrado_por',
)


@admin.register(Sucursal)
class SucursalAdmin(ModeloBaseAdminMixin, ModelAdmin):
    list_display = ('nombre', 'codigo_postal', 'activa', 'borrado', 'orden', 'actualizado')
    list_filter = ('activa', 'borrado')
    search_fields = ('nombre', 'codigo_postal')
    readonly_fields = _AUDITORIA
    actions = ('restaurar',)


@admin.register(StockProducto)
class StockProductoAdmin(ModeloBaseAdminMixin, ModelAdmin):
    list_display = ('producto', 'sucursal', 'cantidad', 'stock_minimo', 'actualizado')
    list_filter = ('sucursal',)
    search_fields = ('producto__nombre',)
    autocomplete_fields = ('producto',)
    readonly_fields = _AUDITORIA


class ItemVentaInline(TabularInline):
    model = ItemVenta
    extra = 0
    fields = ('tipo', 'producto', 'descripcion', 'cantidad', 'precio_unitario')
    autocomplete_fields = ('producto',)
    raw_id_fields = ('item_service',)


class PagoVentaInline(TabularInline):
    """Las partes del cobro: con un solo medio hay una sola fila."""

    model = PagoVenta
    extra = 0
    fields = ('medio', 'monto')


@admin.register(Venta)
class VentaAdmin(ModeloBaseAdminMixin, ModelAdmin):
    list_display = ('id', 'creado', 'sucursal', 'cliente', 'forma_pago', 'total', 'creado_por')
    list_filter = ('sucursal', 'forma_pago')
    search_fields = ('nota', 'items__producto__nombre', 'cliente__nombre')
    raw_id_fields = ('cliente', 'comprobante')
    inlines = (ItemVentaInline, PagoVentaInline)
    readonly_fields = _AUDITORIA


class VaciadoStockItemInline(TabularInline):
    """La foto del stock borrado: solo lectura (es un respaldo, no un formulario)."""

    model = VaciadoStockItem
    extra = 0
    fields = ('producto_nombre', 'sucursal', 'cantidad', 'stock_minimo', 'sin_dato')
    readonly_fields = fields
    can_delete = False
    max_num = 0


@admin.register(VaciadoStock)
class VaciadoStockAdmin(ModeloBaseAdminMixin, ModelAdmin):
    list_display = (
        'id', 'creado', 'sucursales_nombres', 'productos', 'unidades', 'estado', 'creado_por',
    )
    list_filter = ('estado', 'sucursales')
    search_fields = ('sucursales_nombres', 'motivo')
    filter_horizontal = ('sucursales',)
    inlines = (VaciadoStockItemInline,)
    readonly_fields = _AUDITORIA + ('restaurado', 'restaurado_por', 'modo_restauracion')


@admin.register(MovimientoStock)
class MovimientoStockAdmin(ModeloBaseAdminMixin, ModelAdmin):
    list_display = ('creado', 'tipo', 'delta', 'resultante', 'producto', 'sucursal', 'creado_por')
    list_filter = ('tipo', 'sucursal')
    search_fields = ('producto__nombre', 'nota')
    autocomplete_fields = ('producto',)
    readonly_fields = _AUDITORIA
