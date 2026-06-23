from django.conf import settings
from django.db import models


class Empleado(models.Model):
    """Empleado de la tienda.

    Puede tener (o no) una cuenta de `Usuario` vinculada para iniciar sesion en
    el sistema. El vinculo es opcional: un empleado sin cuenta simplemente no
    puede loguearse. Si se borra la cuenta, el empleado queda (sin login).
    """

    nombre = models.CharField('nombre', max_length=120)
    apellido = models.CharField('apellido', max_length=120, blank=True)

    usuario = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='empleado',
        verbose_name='usuario para login',
        help_text='Opcional: cuenta con la que este empleado inicia sesion.',
    )

    creado = models.DateTimeField('fecha de alta', auto_now_add=True)

    class Meta:
        db_table = 'empleados'
        verbose_name = 'empleado'
        verbose_name_plural = 'empleados'
        ordering = ('apellido', 'nombre')

    def __str__(self):
        return self.nombre_completo

    @property
    def nombre_completo(self):
        return f'{self.nombre} {self.apellido}'.strip()

    @property
    def puede_loguear(self):
        """True si tiene una cuenta de usuario activa vinculada."""
        return self.usuario_id is not None and self.usuario.is_active
