from django.contrib import admin
from unfold.admin import ModelAdmin

from comun.admin import ModeloBaseAdminMixin

from .models import (
    Agente,
    AsignacionTurno,
    Dispositivo,
    Fichada,
    Licencia,
    MapeoEmpleado,
    TramoTurno,
    Turno,
)


@admin.register(Dispositivo)
class DispositivoAdmin(ModeloBaseAdminMixin, ModelAdmin):
    list_display = ('nombre', 'sucursal', 'host', 'modelo', 'numero_serie', 'activo')
    list_filter = ('sucursal', 'activo')
    search_fields = ('nombre', 'host', 'numero_serie')


@admin.register(Agente)
class AgenteAdmin(ModeloBaseAdminMixin, ModelAdmin):
    list_display = (
        'nombre', 'dispositivo', 'token_prefijo', 'activo',
        'ultimo_heartbeat', 'eventos_pendientes', 'version',
    )
    list_filter = ('activo',)
    search_fields = ('nombre', 'hostname')
    readonly_fields = (
        'token_hash', 'token_prefijo', 'version', 'hostname', 'ultimo_heartbeat',
        'iniciado_en', 'reloj_alcanzable', 'reloj_error',
        'eventos_pendientes', 'eventos_error', 'ultima_sync_reloj',
    )


@admin.register(MapeoEmpleado)
class MapeoEmpleadoAdmin(ModeloBaseAdminMixin, ModelAdmin):
    list_display = ('numero_reloj', 'empleado', 'dispositivo')
    search_fields = ('numero_reloj', 'empleado__nombre', 'empleado__apellido')


@admin.register(Fichada)
class FichadaAdmin(ModelAdmin):
    """Solo lectura: las fichadas las escriben los agentes."""

    list_display = ('ocurrida_en', 'dispositivo', 'numero_reloj', 'empleado', 'tipo', 'metodo', 'estado_mapeo')
    list_filter = ('dispositivo', 'tipo', 'estado_mapeo')
    search_fields = ('numero_reloj', 'nombre_reloj', 'empleado__nombre', 'empleado__apellido')
    date_hierarchy = 'ocurrida_en'

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


class TramoTurnoInline(admin.TabularInline):
    model = TramoTurno
    extra = 0
    fields = ('dia_semana', 'hora_entrada', 'hora_salida')


@admin.register(Turno)
class TurnoAdmin(ModeloBaseAdminMixin, ModelAdmin):
    list_display = ('nombre', 'activo', 'tolerancia_entrada', 'tolerancia_salida', 'borrado')
    list_filter = ('activo',)
    search_fields = ('nombre',)
    inlines = (TramoTurnoInline,)
    actions = ('restaurar',)


@admin.register(AsignacionTurno)
class AsignacionTurnoAdmin(ModeloBaseAdminMixin, ModelAdmin):
    list_display = ('empleado', 'turno', 'desde', 'hasta', 'borrado')
    list_filter = ('turno',)
    search_fields = ('empleado__nombre', 'empleado__apellido')
    actions = ('restaurar',)


@admin.register(Licencia)
class LicenciaAdmin(ModeloBaseAdminMixin, ModelAdmin):
    list_display = ('empleado', 'tipo', 'desde', 'hasta', 'borrado')
    list_filter = ('tipo',)
    search_fields = ('empleado__nombre', 'empleado__apellido', 'observacion')
    actions = ('restaurar',)
