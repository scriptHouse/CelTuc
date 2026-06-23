from django import forms
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.forms import ReadOnlyPasswordHashField
from unfold.admin import ModelAdmin

from .models import Usuario


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
class UsuarioAdmin(BaseUserAdmin, ModelAdmin):
    form = UsuarioChangeForm
    add_form = UsuarioCreationForm
    list_display = ('username', 'email', 'is_active', 'is_staff', 'is_superuser', 'date_joined')
    list_filter = ('is_active', 'is_staff', 'is_superuser', 'groups')
    search_fields = ('username', 'email')
    ordering = ('username',)
    readonly_fields = ('last_login', 'date_joined')
    fieldsets = (
        (None, {'fields': ('email', 'username', 'password')}),
        ('Permisos', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
        ('Fechas', {'fields': ('last_login', 'date_joined')}),
    )
    add_fieldsets = (
        (
            None,
            {
                'classes': ('wide',),
                'fields': ('email', 'username', 'password1', 'password2', 'is_active', 'is_staff', 'is_superuser'),
            },
        ),
    )
