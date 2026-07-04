from django.contrib import admin
from unfold.admin import ModelAdmin, TabularInline

from comun.admin import ModeloBaseAdminMixin

from .models import (
    ConfiguracionService,
    CotizacionDolarBlue,
    Dispositivo,
    ItemService,
    PrecioItemService,
    SeccionService,
    VarianteSeccion,
)

_AUDITORIA = (
    'creado', 'actualizado', 'creado_por', 'actualizado_por',
    'fecha_borrado', 'borrado_por',
)


@admin.register(ConfiguracionService)
class ConfiguracionServiceAdmin(ModeloBaseAdminMixin, ModelAdmin):
    list_display = ('dolar', 'descuento_cash_pct', 'redondeo_ars', 'actualizado')
    readonly_fields = _AUDITORIA

    def has_add_permission(self, request):
        # Fila unica: se crea sola via obtener(); no tiene sentido agregar mas.
        return not ConfiguracionService.todos.exists()


@admin.register(CotizacionDolarBlue)
class CotizacionDolarBlueAdmin(ModeloBaseAdminMixin, ModelAdmin):
    list_display = ('compra', 'venta', 'fecha', 'actualizado')
    readonly_fields = _AUDITORIA

    def has_add_permission(self, request):
        # Fila unica: la escribe el proxy de DolarAPI en cada consulta exitosa.
        return not CotizacionDolarBlue.todos.exists()


@admin.register(Dispositivo)
class DispositivoAdmin(ModeloBaseAdminMixin, ModelAdmin):
    list_display = ('nombre', 'linea', 'activo', 'borrado', 'orden', 'actualizado')
    list_filter = ('linea', 'activo', 'borrado')
    search_fields = ('nombre', 'linea')
    readonly_fields = _AUDITORIA
    actions = ('restaurar',)


class VarianteSeccionInline(TabularInline):
    model = VarianteSeccion
    extra = 0
    fields = ('nombre', 'orden')


@admin.register(SeccionService)
class SeccionServiceAdmin(ModeloBaseAdminMixin, ModelAdmin):
    list_display = ('nombre', 'descuento_cash_pct', 'activo', 'borrado', 'orden', 'actualizado')
    list_filter = ('activo', 'borrado')
    search_fields = ('nombre', 'nota')
    inlines = (VarianteSeccionInline,)
    readonly_fields = _AUDITORIA
    actions = ('restaurar',)


class PrecioItemServiceInline(TabularInline):
    model = PrecioItemService
    extra = 0
    fields = (
        'variante',
        'precio_lista_usd', 'precio_cash_usd', 'precio_lista_ars', 'precio_cash_ars',
    )


@admin.register(ItemService)
class ItemServiceAdmin(ModeloBaseAdminMixin, ModelAdmin):
    list_display = ('etiqueta', 'seccion', 'activo', 'borrado', 'orden', 'actualizado')
    list_filter = ('seccion', 'activo', 'borrado')
    search_fields = ('etiqueta', 'nota')
    inlines = (PrecioItemServiceInline,)
    readonly_fields = _AUDITORIA
    actions = ('restaurar',)
