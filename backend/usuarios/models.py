from datetime import timedelta

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


class Permiso(models.Model):
    """Permiso atomico del sistema.

    Hoy cada permiso representa el acceso a un modulo del panel (un item del
    sidebar). El catalogo se siembra por migracion y se puede ampliar agregando
    filas, sin tocar codigo: cada `codigo` se mapea a un modulo en el frontend.
    """

    codigo = models.SlugField('codigo', max_length=50, unique=True)
    nombre = models.CharField('nombre', max_length=80)
    descripcion = models.CharField('descripcion', max_length=200, blank=True)
    orden = models.PositiveSmallIntegerField('orden', default=0)

    class Meta:
        db_table = 'permisos'
        verbose_name = 'permiso'
        verbose_name_plural = 'permisos'
        ordering = ('orden', 'nombre')

    def __str__(self):
        return self.nombre


class Rol(models.Model):
    """Conjunto de permisos asignable a una cuenta (RBAC).

    - `es_admin`: el rol concede administracion total (gestiona roles, empleados
      y usuarios) y ve todos los modulos, sin importar la lista `permisos`.
    - `es_sistema`: roles base (Administrador, Empleado) que no se pueden eliminar
      ni cambiar su naturaleza de admin. Sus permisos si se pueden ajustar.
    """

    nombre = models.CharField('nombre', max_length=60, unique=True)
    descripcion = models.CharField('descripcion', max_length=200, blank=True)
    es_admin = models.BooleanField(
        'administra el sistema',
        default=False,
        help_text='Acceso total: gestiona roles, empleados y usuarios, y ve todos los modulos.',
    )
    es_sistema = models.BooleanField(
        'rol del sistema',
        default=False,
        help_text='Roles base que no se pueden eliminar.',
    )
    permisos = models.ManyToManyField(
        Permiso, blank=True, related_name='roles', verbose_name='permisos',
    )
    creado = models.DateTimeField('fecha de alta', auto_now_add=True)

    class Meta:
        db_table = 'roles'
        verbose_name = 'rol'
        verbose_name_plural = 'roles'
        ordering = ('nombre',)

    def __str__(self):
        return self.nombre


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

    rol = models.ForeignKey(
        Rol,
        verbose_name='rol',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='usuarios',
        help_text='Define a que modulos puede entrar la cuenta. Vacio = sin acceso.',
    )

    date_joined = models.DateTimeField('fecha de alta', default=timezone.now)

    # Ultima vez que la cuenta dio señales de vida: login, request a la API o
    # latido del front mientras usa el sistema. Alimenta "ultima vez activo" y el
    # estado "en linea", sin tablas de sesiones ni logs aparte. `last_login` (que
    # aporta AbstractBaseUser) guarda solo el momento del inicio de sesion.
    ultima_actividad = models.DateTimeField('ultima actividad', null=True, blank=True)

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

    @property
    def es_administrador(self) -> bool:
        """Acceso total al sistema.

        Lo es el superusuario (dueño, intacto), el staff de Django (compat con el
        esquema previo) y cualquier cuenta con un rol marcado `es_admin`.
        """
        return bool(
            self.is_superuser
            or self.is_staff
            or (self.rol_id and self.rol.es_admin)
        )

    def codigos_permisos(self) -> list[str]:
        """Codigos de los modulos visibles para esta cuenta.

        Los administradores ven todo; el resto, solo lo que conceda su rol; una
        cuenta sin rol no ve ningun modulo.
        """
        if self.es_administrador:
            return list(Permiso.objects.values_list('codigo', flat=True))
        if self.rol_id:
            return list(self.rol.permisos.values_list('codigo', flat=True))
        return []

    # Ventana para considerar a una cuenta "en linea": si dio señales de vida en
    # los ultimos minutos. Es mayor que el intervalo de latido del front para que
    # el estado no parpadee.
    VENTANA_EN_LINEA = timedelta(minutes=5)

    @property
    def en_linea(self) -> bool:
        """True si la cuenta dio señales de actividad hace poco."""
        if not self.ultima_actividad:
            return False
        return timezone.now() - self.ultima_actividad <= self.VENTANA_EN_LINEA
