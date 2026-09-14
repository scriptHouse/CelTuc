from django.contrib import admin
from unfold.admin import ModelAdmin, TabularInline

from comun.admin import ModeloBaseAdminMixin

from .models import Caja, CierreCaja, ConfiguracionCaja, MovimientoCaja, SesionCaja

_AUDITORIA = ('creado', 'actualizado', 'creado_por', 'actualizado_por', 'fecha_borrado', 'borrado_por')


@admin.register(ConfiguracionCaja)
class ConfiguracionCajaAdmin(ModeloBaseAdminMixin, ModelAdmin):
    list_display = ('__str__', 'cierre_ciego', 'tolerancia_activa', 'tolerancia_monto',
                    'multi_caja', 'por_sucursal', 'fondo_sugerido', 'actualizado')
    # La caja por sucursal se cambia desde la app (Caja > Configurar): valida
    # que no queden turnos abiertos y arma las cajas de cada sucursal.
    readonly_fields = ('por_sucursal', *_AUDITORIA)

    def has_add_permission(self, request):
        # Singleton: la fila se crea sola; desde el admin solo se edita.
        return not ConfiguracionCaja.todos.exists()


@admin.register(Caja)
class CajaAdmin(ModeloBaseAdminMixin, ModelAdmin):
    list_display = ('nombre', 'sucursal', 'canal', 'orden', 'activa', 'creado')
    list_filter = ('activa', 'sucursal')
    search_fields = ('nombre',)
    readonly_fields = _AUDITORIA


class MovimientoCajaInline(TabularInline):
    model = MovimientoCaja
    extra = 0
    fields = ('creado', 'tipo', 'medio', 'monto', 'motivo', 'venta')
    readonly_fields = ('creado',)
    can_delete = False


@admin.register(SesionCaja)
class SesionCajaAdmin(ModeloBaseAdminMixin, ModelAdmin):
    list_display = ('numero', 'caja', 'estado', 'fondo_inicial', 'creado', 'creado_por')
    list_filter = ('estado', 'caja')
    readonly_fields = _AUDITORIA
    inlines = (MovimientoCajaInline,)


@admin.register(MovimientoCaja)
class MovimientoCajaAdmin(ModeloBaseAdminMixin, ModelAdmin):
    list_display = ('creado', 'sesion', 'tipo', 'medio', 'monto', 'motivo', 'creado_por')
    list_filter = ('tipo', 'medio')
    search_fields = ('motivo', 'detalle')
    readonly_fields = _AUDITORIA


@admin.register(CierreCaja)
class CierreCajaAdmin(ModeloBaseAdminMixin, ModelAdmin):
    list_display = ('numero', 'caja_nombre', 'sucursal_nombre', 'diferencia_total',
                    'fondo_siguiente', 'retiro_final', 'creado', 'creado_por')
    list_filter = ('caja_nombre', 'sucursal_nombre')
    search_fields = ('caja_nombre', 'motivo_diferencia', 'nota_diferencia')
    readonly_fields = _AUDITORIA
