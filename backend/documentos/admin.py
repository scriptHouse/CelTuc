from django.contrib import admin
from unfold.admin import ModelAdmin

from comun.admin import ModeloBaseAdminMixin

from .models import DocumentoGenerado


@admin.register(DocumentoGenerado)
class DocumentoGeneradoAdmin(ModeloBaseAdminMixin, ModelAdmin):
    list_display = ('creado', 'tipo_nombre', 'formato', 'cliente', 'referencia',
                    'sucursal', 'creado_por', 'borrado')
    list_filter = ('tipo', 'formato', 'sucursal', 'borrado')
    search_fields = ('cliente', 'cliente_documento', 'referencia', 'detalle', 'nombre_archivo')
    date_hierarchy = 'creado'
    readonly_fields = (
        'tipo', 'tipo_nombre', 'formato', 'archivo', 'nombre_archivo', 'content_type',
        'tamanio', 'sucursal', 'referencia', 'cliente', 'cliente_documento', 'detalle',
        'total', 'datos',
        'creado', 'actualizado', 'creado_por', 'actualizado_por',
        'fecha_borrado', 'borrado_por',
    )
    actions = ('restaurar',)

    def has_add_permission(self, request):
        # El historial lo escribe la app al exportar, no se carga a mano.
        return False
