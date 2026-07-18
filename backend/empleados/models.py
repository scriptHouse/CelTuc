from django.conf import settings
from django.db import models

from comun.models import ModeloBase


class Sucursal(ModeloBase):
    """Sucursal (local) del negocio a la que puede pertenecer un empleado.

    Es una identidad simple: nombre, codigo postal y estado (activa/inactiva).
    No se confunde con `inventario.Sucursal`, que modela el stock por local:
    esta describe la pertenencia de los empleados y, con eso, la direccion que
    los documentos traen preseleccionada segun quien esta logueado.
    """

    nombre = models.CharField('nombre', max_length=120)
    codigo_postal = models.CharField('codigo postal', max_length=10, blank=True)
    activa = models.BooleanField('activa', default=True)

    class Meta:
        db_table = 'empleados_sucursales'
        verbose_name = 'sucursal'
        verbose_name_plural = 'sucursales'
        ordering = ('nombre',)
        constraints = [
            models.UniqueConstraint(
                fields=('nombre',),
                condition=models.Q(borrado=False),
                name='uq_empleado_sucursal_viva',
            ),
        ]

    def __str__(self):
        return self.nombre


class Empleado(ModeloBase):
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

    sucursal = models.ForeignKey(
        Sucursal,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='empleados',
        verbose_name='sucursal',
        help_text='Opcional: local al que pertenece el empleado.',
    )

    # creado / actualizado / *_por / borrado* los aporta ModeloBase.

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
