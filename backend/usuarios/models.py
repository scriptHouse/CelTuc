from django.contrib.auth.base_user import AbstractBaseUser
from django.contrib.auth.models import PermissionsMixin
from django.core.validators import MinLengthValidator, RegexValidator
from django.db import models
from django.utils import timezone

from .managers import UsuarioManager

# El nombre de usuario admite letras, numeros y . _ - (estilo handle). Se guarda
# en minuscula (ver save()), asi la unicidad y el login son insensibles a mayus.
username_validator = RegexValidator(
    regex=r'^[a-zA-Z0-9._-]+$',
    message='El nombre de usuario solo puede tener letras, numeros y los signos . _ -',
)


class Usuario(AbstractBaseUser, PermissionsMixin):
    """Usuario del sistema de gestion CelTuc.

    Identidad minima: email + nombre de usuario + contrasena. El login se puede
    hacer indistintamente con el email o con el nombre de usuario. Las cuentas
    las crea un administrador (no hay autoregistro).
    """

    email = models.EmailField('correo electronico', unique=True)
    username = models.CharField(
        'nombre de usuario',
        max_length=30,
        unique=True,
        validators=[MinLengthValidator(3), username_validator],
        help_text='Entre 3 y 30 caracteres: letras, numeros y . _ -',
    )

    is_active = models.BooleanField('activo', default=True)
    is_staff = models.BooleanField('acceso al panel', default=False)
    # is_superuser, groups y user_permissions los aporta PermissionsMixin.

    date_joined = models.DateTimeField('fecha de alta', default=timezone.now)

    # Login indistinto: el identificador canonico es el email, pero la vista de
    # login tambien acepta el username (ver usuarios/serializers.py).
    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username']

    objects = UsuarioManager()

    class Meta:
        db_table = 'usuarios'
        verbose_name = 'usuario'
        verbose_name_plural = 'usuarios'
        ordering = ('username',)

    def __str__(self):
        return self.username or self.email

    def save(self, *args, **kwargs):
        # email y username siempre en minuscula: identificadores unicos sin
        # ambiguedad y login predecible con cualquiera de los dos.
        if self.email:
            self.email = self.email.lower()
        if self.username:
            self.username = self.username.lower()
        super().save(*args, **kwargs)
