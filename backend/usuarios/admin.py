from django import forms
from django.contrib import admin, messages
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.forms import ReadOnlyPasswordHashField
from django.http import Http404, HttpResponseRedirect
from django.shortcuts import redirect, render
from django.urls import reverse
from unfold.admin import ModelAdmin
from unfold.decorators import action

from auditoria.registro import registrar_impersonacion
from comun.admin import ModeloBaseAdminMixin

from .impersonacion import DURACION_MAXIMA, motivo_no_impersonable, url_de_retorno
from .models import Permiso, Rol, TicketImpersonacion, Usuario


def _ip_de(request):
    """IP del pedido, respetando el proxy (Traefik/nginx delante de gunicorn)."""
    reenviada = request.META.get('HTTP_X_FORWARDED_FOR', '')
    if reenviada:
        return reenviada.split(',')[0].strip() or None
    return request.META.get('REMOTE_ADDR') or None


class UsuarioCreationForm(forms.ModelForm):
    """Alta de usuario en el admin: pide la contrasena dos veces y la hashea."""

    password1 = forms.CharField(label='Contrasena', widget=forms.PasswordInput)
    password2 = forms.CharField(label='Confirmar contrasena', widget=forms.PasswordInput)

    class Meta:
        model = Usuario
        fields = ('email', 'username', 'is_active', 'is_staff', 'is_superuser')

    def clean_password2(self):
        password1 = self.cleaned_data.get('password1')
        password2 = self.cleaned_data.get('password2')
        if password1 and password2 and password1 != password2:
            raise forms.ValidationError('Las contrasenas no coinciden.')
        return password2

    def save(self, commit=True):
        user = super().save(commit=False)
        user.set_password(self.cleaned_data['password1'])
        if commit:
            user.save()
            self.save_m2m()
        return user


class UsuarioChangeForm(forms.ModelForm):
    """Edicion de usuario: muestra el hash de la contrasena en solo lectura."""

    password = ReadOnlyPasswordHashField(label='Contrasena')

    class Meta:
        model = Usuario
        fields = '__all__'


@admin.register(Usuario)
class UsuarioAdmin(ModeloBaseAdminMixin, BaseUserAdmin, ModelAdmin):
    form = UsuarioChangeForm
    add_form = UsuarioCreationForm
    list_display = ('username', 'email', 'is_active', 'is_staff', 'is_superuser', 'borrado', 'last_login', 'ultima_actividad')
    list_filter = ('is_active', 'is_staff', 'is_superuser', 'borrado', 'groups')
    search_fields = ('username', 'email')
    ordering = ('username',)
    actions = ('restaurar',)
    readonly_fields = ('last_login', 'date_joined', 'ultima_actividad')
    fieldsets = (
        (None, {'fields': ('email', 'username', 'password')}),
        ('Rol y acceso', {'fields': ('rol',)}),
        ('Permisos', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
        ('Fechas', {'fields': ('last_login', 'ultima_actividad', 'date_joined')}),
    )
    add_fieldsets = (
        (
            None,
            {
                'classes': ('wide',),
                'fields': ('email', 'username', 'password1', 'password2', 'rol', 'is_active', 'is_staff', 'is_superuser'),
            },
        ),
    )
    # Boton "Impersonar" en cada renglon del listado (solo lo ve el superadmin).
    actions_row = ('impersonar',)

    def has_impersonar_permission(self, request) -> bool:
        """Quien ve el boton: unicamente el superadministrador."""
        return bool(request.user.is_active and request.user.is_superuser)

    @action(
        description='Impersonar',
        url_path='impersonar',
        permissions=['impersonar'],
        icon='switch_account',
        extra_options={'display_in_dropdown': False},
    )
    def impersonar(self, request, object_id):
        """Entra al panel como esa cuenta (ver usuarios/impersonacion.py).

        En GET muestra la confirmacion; el pase se emite SOLO en el POST: una
        accion con efectos nunca cuelga de un simple link (y asi el formulario
        viaja con su token CSRF).
        """
        try:
            objetivo = self.get_queryset(request).filter(pk=object_id).first()
        except (TypeError, ValueError):
            objetivo = None
        if objetivo is None:
            raise Http404('No existe esa cuenta.')

        motivo = motivo_no_impersonable(request.user, objetivo)
        listado = reverse('admin:usuarios_usuario_changelist')

        if request.method != 'POST':
            contexto = {
                **self.admin_site.each_context(request),
                'title': f'Impersonar a {objetivo.username}',
                'objetivo': objetivo,
                'motivo': motivo,
                'horas': int(DURACION_MAXIMA.total_seconds() // 3600),
                'url_listado': listado,
                'opts': self.model._meta,
            }
            return render(request, 'admin/usuarios/impersonar.html', contexto)

        if motivo is not None:
            self.message_user(request, motivo, level=messages.ERROR)
            return redirect(listado)

        pase = TicketImpersonacion.emitir(request.user, objetivo, ip=_ip_de(request))
        # El historial guarda quien entro como quien, antes de irse al frontend.
        registrar_impersonacion(request.user, objetivo, request)
        return HttpResponseRedirect(url_de_retorno(pase))


@admin.register(Rol)
class RolAdmin(ModeloBaseAdminMixin, ModelAdmin):
    list_display = ('nombre', 'es_admin', 'es_sistema', 'borrado', 'cantidad_usuarios')
    list_filter = ('es_admin', 'es_sistema', 'borrado')
    search_fields = ('nombre', 'descripcion')
    filter_horizontal = ('permisos',)
    actions = ('restaurar',)

    @admin.display(description='Cuentas')
    def cantidad_usuarios(self, obj):
        return obj.usuarios.count()


@admin.register(Permiso)
class PermisoAdmin(ModeloBaseAdminMixin, ModelAdmin):
    list_display = ('nombre', 'codigo', 'orden', 'borrado')
    list_filter = ('borrado',)
    search_fields = ('nombre', 'codigo')
    ordering = ('orden', 'nombre')
    actions = ('restaurar',)
