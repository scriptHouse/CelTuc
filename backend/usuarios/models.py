from django.contrib.auth.base_user import AbstractBaseUser
from django.contrib.auth.models import PermissionsMixin
from django.db import models
from django.utils import timezone

from .managers import UsuarioManager


class Usuario(AbstractBaseUser, PermissionsMixin):
    """Usuario del sistema de gestion CelTuc, identificado por su email.

    Modela al personal de la tienda que entra al sistema (no a los clientes).
    Las cuentas las crea un administrador desde el panel; no hay autoregistro.
    """

    class Rol(models.TextChoices):
        ADMINISTRADOR = 'administrador', 'Administrador'
        ENCARGADO = 'encargado', 'Encargado'
        VENDEDOR = 'vendedor', 'Vendedor'

    email = models.EmailField('correo electronico', unique=True)
    nombre = models.CharField('nombre', max_length=120)
    apellido = models.CharField('apellido', max_length=120, blank=True)
    # DNI / documento. Unico cuando esta cargado; vacio se guarda como NULL para
    # que varios usuarios sin documento no choquen con la restriccion de unicidad.
    documento = models.CharField(
        'documento (DNI)', max_length=20, unique=True, null=True, blank=True,
    )
    telefono = models.CharField('telefono', max_length=30, blank=True)
    rol = models.CharField(
        'rol', max_length=20, choices=Rol.choices, default=Rol.VENDEDOR,
    )

    is_active = models.BooleanField('activo', default=True)
    is_staff = models.BooleanField('acceso al panel', default=False)
    # is_superuser, groups y user_permissions los aporta PermissionsMixin.

    date_joined = models.DateTimeField('fecha de alta', default=timezone.now)
    updated_at = models.DateTimeField('ultima actualizacion', auto_now=True)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['nombre']

    objects = UsuarioManager()

    class Meta:
        db_table = 'usuarios'
        verbose_name = 'usuario'
        verbose_name_plural = 'usuarios'
        ordering = ('apellido', 'nombre')

    def __str__(self):
        return self.nombre_completo or self.email

    @property
    def nombre_completo(self):
        return f'{self.nombre} {self.apellido}'.strip()

    def save(self, *args, **kwargs):
        # El email siempre en minusculas (identificador unico sin ambiguedad) y
        # el documento vacio como NULL (ver comentario del campo).
        if self.email:
            self.email = self.email.lower()
        if not self.documento:
            self.documento = None
        super().save(*args, **kwargs)
