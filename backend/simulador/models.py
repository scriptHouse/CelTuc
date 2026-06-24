from django.core.validators import MinValueValidator
from django.db import models

from comun.models import ModeloBase


class Tarjeta(ModeloBase):
    """Medio de pago configurable del simulador de cuotas.

    Cada tarjeta agrupa una tabla de planes de cuotas (ver `PlanCuota`), cada uno
    con su recargo. Replica la estructura de la hoja "SIMULADOR TARJETAS": como el
    recargo cambia segun la categoria del producto (accesorios vs. equipos), una
    misma "tarjeta" puede existir en ambas categorias con porcentajes distintos.
    Todo es editable desde el panel: los porcentajes cambian seguido (por mes o
    cuando el negocio lo decide).
    """

    class Categoria(models.TextChoices):
        ACCESORIOS = 'accesorios', 'Accesorios'
        EQUIPOS = 'equipos', 'Equipos'

    nombre = models.CharField('nombre', max_length=120)
    categoria = models.CharField(
        'categoria',
        max_length=20,
        choices=Categoria.choices,
        default=Categoria.ACCESORIOS,
    )
    descripcion = models.CharField('descripcion', max_length=200, blank=True)
    orden = models.PositiveSmallIntegerField('orden', default=0)
    activa = models.BooleanField('activa', default=True)

    # creado / actualizado / *_por / borrado* los aporta ModeloBase.

    class Meta:
        db_table = 'simulador_tarjetas'
        verbose_name = 'tarjeta'
        verbose_name_plural = 'tarjetas'
        ordering = ('categoria', 'orden', 'nombre')

    def __str__(self):
        return f'{self.nombre} ({self.get_categoria_display()})'


class PlanCuota(ModeloBase):
    """Un plan de cuotas dentro de una tarjeta: cuantas cuotas y que recargo.

    El recargo se guarda como PORCENTAJE (35 = 35 %). El simulador calcula:
        total       = monto * (1 + interes / 100)
        valor_cuota = total / cuotas

    `etiqueta` admite planes con nombre libre ("Plan Z", "Prepaga", "3 Sucredito"),
    no solo numericos, tal como aparecen en la hoja de Excel original.
    """

    tarjeta = models.ForeignKey(
        Tarjeta,
        on_delete=models.CASCADE,
        related_name='planes',
        verbose_name='tarjeta',
    )
    etiqueta = models.CharField('etiqueta', max_length=60)
    cuotas = models.PositiveSmallIntegerField(
        'cantidad de cuotas',
        default=1,
        validators=[MinValueValidator(1)],
    )
    interes = models.DecimalField(
        'recargo (%)',
        max_digits=6,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        help_text='Porcentaje de recargo sobre el monto. 35 = 35 %.',
    )
    orden = models.PositiveSmallIntegerField('orden', default=0)
    activo = models.BooleanField('activo', default=True)

    class Meta:
        db_table = 'simulador_planes'
        verbose_name = 'plan de cuotas'
        verbose_name_plural = 'planes de cuotas'
        ordering = ('orden', 'id')

    def __str__(self):
        return f'{self.etiqueta} · {self.interes} %'
