from django.contrib import admin
from unfold.admin import ModelAdmin, TabularInline

from comun.admin import ModeloBaseAdminMixin

from .models import Comprobante, Emisor, ItemComprobante, TicketAcceso


@admin.register(Emisor)
class EmisorAdmin(ModeloBaseAdminMixin, ModelAdmin):
    list_display = (
        'nombre', 'cuit', 'condicion', 'punto_venta', 'produccion', 'activo',
        'tiene_credenciales', 'borrado',
    )
    list_filter = ('condicion', 'produccion', 'activo', 'borrado')
    search_fields = ('nombre', 'cuit')
    readonly_fields = (
        'tiene_credenciales', 'creado', 'actualizado', 'creado_por',
        'actualizado_por', 'fecha_borrado', 'borrado_por',
    )
    actions = ('restaurar',)


class ItemComprobanteInline(TabularInline):
    model = ItemComprobante
    extra = 0
    can_delete = False
    fields = ('descripcion', 'cantidad', 'precio_unitario')


@admin.register(Comprobante)
class ComprobanteAdmin(ModeloBaseAdminMixin, ModelAdmin):
    list_display = (
        'numero_formateado', 'tipo', 'emisor', 'cliente_nombre', 'total', 'cae',
        'fecha', 'estado_cobro', 'borrado',
    )
    list_filter = ('tipo', 'estado_cobro', 'emisor', 'borrado')
    search_fields = ('cliente_nombre', 'cliente_doc_numero', 'cae', 'numero')
    inlines = (ItemComprobanteInline,)
    # Lo fiscal no se edita; solo el estado de cobro y las observaciones.
    readonly_fields = (
        'emisor', 'tipo', 'concepto', 'punto_venta', 'numero', 'cliente_nombre',
        'cliente_doc_tipo', 'cliente_doc_numero', 'cliente_condicion', 'fecha',
        'vencimiento', 'alicuota_iva', 'neto', 'iva', 'importe_exento',
        'importe_no_gravado', 'total', 'cae', 'cae_vencimiento', 'qr_url',
        'respuesta_afip', 'numero_formateado', 'creado', 'actualizado',
        'creado_por', 'actualizado_por', 'fecha_borrado', 'borrado_por',
    )
    actions = ('restaurar',)


@admin.register(TicketAcceso)
class TicketAccesoAdmin(ModelAdmin):
    """Solo lectura: cache del Ticket de Acceso (se puede borrar para re-autenticar)."""

    list_display = ('emisor', 'servicio', 'produccion', 'generado', 'expiracion')
    list_filter = ('servicio', 'produccion')
    readonly_fields = ('emisor', 'servicio', 'produccion', 'token', 'sign', 'generado', 'expiracion')

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
