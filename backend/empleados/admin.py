from django.contrib import admin
from unfold.admin import ModelAdmin

from comun.admin import ModeloBaseAdminMixin

from .models import Empleado


@admin.register(Empleado)
class EmpleadoAdmin(ModeloBaseAdminMixin, ModelAdmin):
    list_display = ('nombre', 'apellido', 'tiene_login', 'usuario', 'borrado', 'creado')
    list_filter = ('borrado',)
    search_fields = ('nombre', 'apellido', 'usuario__email', 'usuario__username')
    actions = ('restaurar',)
    autocomplete_fields = ('usuario',)
    readonly_fields = ('creado',)
    fieldsets = (
        (None, {'fields': ('nombre', 'apellido')}),
        (
            'Acceso al sistema',
            {
                'fields': ('usuario',),
                'description': 'Opcional. Vinculá una cuenta si este empleado debe poder iniciar sesión.',
            },
        ),
        ('Fechas', {'fields': ('creado',)}),
    )

    @admin.display(description='Login', boolean=True)
    def tiene_login(self, obj):
        return obj.usuario_id is not None
