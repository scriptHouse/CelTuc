from django.contrib import admin
from unfold.admin import ModelAdmin

from comun.admin import ModeloBaseAdminMixin

from .models import CategoriaProducto, ConfiguracionProductos, Producto

_AUDITORIA = (
    'creado', 'actualizado', 'creado_por', 'actualizado_por',
    'fecha_borrado', 'borrado_por',
)


@admin.register(ConfiguracionProductos)
class ConfiguracionProductosAdmin(ModeloBaseAdminMixin, ModelAdmin):
    list_display = ('descuento_cash_pct', 'redondeo_lista_ars', 'redondeo_cash_ars', 'actualizado')
    readonly_fields = _AUDITORIA

    def has_add_permission(self, request):
        return not ConfiguracionProductos.todos.exists()


@admin.register(CategoriaProducto)
class CategoriaProductoAdmin(ModeloBaseAdminMixin, ModelAdmin):
    list_display = ('nombre', 'padre', 'muestra_cash', 'tarifa_cuotas', 'es_equipo',
                    'activo', 'borrado', 'orden', 'actualizado')
    list_filter = ('muestra_cash', 'tarifa_cuotas', 'es_equipo', 'activo', 'borrado')
    search_fields = ('nombre', 'nota')
    readonly_fields = _AUDITORIA
    actions = ('restaurar',)


@admin.register(Producto)
class ProductoAdmin(ModeloBaseAdminMixin, ModelAdmin):
    list_display = ('nombre', 'categoria', 'marca', 'calidad', 'precio_lista_usd',
                    'a_pedido', 'activo', 'borrado', 'actualizado')
    list_filter = ('categoria', 'marca', 'a_pedido', 'nuevo', 'activo', 'borrado')
    search_fields = ('nombre', 'marca', 'calidad', 'nota')
    filter_horizontal = ('dispositivos',)
    readonly_fields = _AUDITORIA
    actions = ('restaurar',)
