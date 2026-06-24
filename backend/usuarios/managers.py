from django.contrib.auth.base_user import BaseUserManager
from django.core.exceptions import FieldDoesNotExist


class UsuarioManager(BaseUserManager):
    """Manager del usuario. Cada cuenta necesita email + nombre de usuario.

    Oculta las cuentas borradas logicamente (`borrado=True`). La comprobacion del
    campo evita romper las migraciones historicas (estados previos a que la
    columna `borrado` exista), donde este manager tambien se usa (`use_in_migrations`).
    """

    use_in_migrations = True

    def get_queryset(self):
        qs = super().get_queryset()
        try:
            self.model._meta.get_field('borrado')
        except FieldDoesNotExist:
            return qs
        return qs.filter(borrado=False)

    def _create_user(self, email, username, password, **extra_fields):
        if not email:
            raise ValueError('El email es obligatorio')
        if not username:
            raise ValueError('El nombre de usuario es obligatorio')
        # normalize_email solo baja el dominio a minusculas; bajamos todo (igual
        # que el username en Usuario.save) para que sean identificadores unicos.
        email = self.normalize_email(email).lower()
        user = self.model(email=email, username=username.lower(), **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, username, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', False)
        extra_fields.setdefault('is_superuser', False)
        return self._create_user(email, username, password, **extra_fields)

    def create_superuser(self, email, username, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)

        if extra_fields.get('is_staff') is not True:
            raise ValueError('Un superusuario debe tener is_staff=True')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Un superusuario debe tener is_superuser=True')

        return self._create_user(email, username, password, **extra_fields)
