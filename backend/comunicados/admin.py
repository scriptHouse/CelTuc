from django.contrib import admin
from unfold.admin import ModelAdmin, TabularInline

from comun.admin import ModeloBaseAdminMixin

from .models import ArchivoComunicado, Comunicado, LecturaComunicado


class ArchivoComunicadoInline(TabularInline):
    model = ArchivoComunicado
    extra = 0
    can_delete = False
    fields = ('nombre', 'tipo', 'content_type', 'tamanio')
    readonly_fields = fields


class LecturaComunicadoInline(TabularInline):
    model = LecturaComunicado
    extra = 0
    can_delete = False
    fields = ('usuario', 'creado')
    readonly_fields = fields


@admin.register(Comunicado)
class ComunicadoAdmin(ModeloBaseAdminMixin, ModelAdmin):
    list_display = ('titulo', 'fijado', 'creado', 'creado_por', 'borrado')
    list_filter = ('fijado', 'borrado')
    search_fields = ('titulo', 'cuerpo')
    inlines = (ArchivoComunicadoInline, LecturaComunicadoInline)
    readonly_fields = (
        'creado', 'actualizado', 'creado_por', 'actualizado_por',
        'fecha_borrado', 'borrado_por',
    )
    actions = ('restaurar',)
