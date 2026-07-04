"""Cotizaciones: cuanto se toma cada equipo usado y cuanto cuesta cada service.

Replica la hoja "Cotizaciones" del Excel del negocio con cuatro tablas:

- `ModeloEquipo`: catalogo de modelos (iPhone 11, 11 Pro, ...). En la hoja el
  listado esta repetido en cada seccion (toma, bateria, modulo, tapa); aca vive
  UNA sola vez y las demas tablas lo referencian.
- `CotizacionEquipo`: rango MIN-MAX en dolares por capacidad (128 GB, 256 GB...).
  Las combinaciones que en la hoja figuran con "-" simplemente no tienen fila.
- `TipoServicio`: cada "seccion" de service (cambio de bateria, de modulo, de
  tapa...). Agregar una seccion nueva es crear un registro, no tocar el esquema.
- `PrecioServicio`: el precio en dolares de un tipo de service para un modelo.

Todos los precios se guardan en USD (asi maneja los valores el negocio).
"""
from django.core.validators import MinValueValidator
from django.db import models

from comun.models import ModeloBase


class ModeloEquipo(ModeloBase):
    """Un modelo de celular cotizable (ej: iPhone 13 Pro Max)."""

    marca = models.CharField('marca', max_length=60, default='iPhone', blank=True)
    nombre = models.CharField('nombre', max_length=120)
    dispositivo = models.ForeignKey(
        'precios_service.Dispositivo',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='modelos_cotizacion',
        verbose_name='equipo del catalogo',
        help_text='Puente al catalogo unico de equipos (alimenta la Ficha de equipo). '
                  'Se completa solo si el nombre coincide.',
    )
    orden = models.PositiveSmallIntegerField('orden', default=0)
    activo = models.BooleanField('activo', default=True)

    # creado / actualizado / *_por / borrado* los aporta ModeloBase.

    class Meta:
        db_table = 'cotizaciones_modelos'
        verbose_name = 'modelo de equipo'
        verbose_name_plural = 'modelos de equipo'
        ordering = ('orden', 'nombre')
        constraints = [
            # Unico entre los registros vivos: permite recrear un modelo que fue
            # borrado logicamente sin chocar con la fila vieja.
            models.UniqueConstraint(
                fields=('marca', 'nombre'),
                condition=models.Q(borrado=False),
                name='uq_modelo_equipo_vivo',
            ),
        ]

    @property
    def nombre_completo(self):
        return f'{self.marca} {self.nombre}'.strip()

    def __str__(self):
        return self.nombre_completo


class CotizacionEquipo(ModeloBase):
    """Rango de toma (MIN-MAX, en USD) de un modelo para una capacidad."""

    modelo = models.ForeignKey(
        ModeloEquipo,
        on_delete=models.CASCADE,
        related_name='cotizaciones',
        verbose_name='modelo',
    )
    capacidad_gb = models.PositiveSmallIntegerField(
        'capacidad (GB)',
        validators=[MinValueValidator(1)],
        help_text='En gigabytes: 128, 256, 512, 1024 (= 1 TB)...',
    )
    precio_min = models.DecimalField(
        'precio minimo (USD)',
        max_digits=8,
        decimal_places=2,
        validators=[MinValueValidator(0)],
    )
    precio_max = models.DecimalField(
        'precio maximo (USD)',
        max_digits=8,
        decimal_places=2,
        validators=[MinValueValidator(0)],
        help_text='Corresponde a un equipo impecable, sin piezas cambiadas y bateria 98 % o mas.',
    )

    class Meta:
        db_table = 'cotizaciones_precios_equipos'
        verbose_name = 'cotizacion de equipo'
        verbose_name_plural = 'cotizaciones de equipos'
        ordering = ('capacidad_gb',)
        constraints = [
            models.UniqueConstraint(
                fields=('modelo', 'capacidad_gb'),
                condition=models.Q(borrado=False),
                name='uq_cotizacion_capacidad_viva',
            ),
        ]

    @property
    def capacidad_label(self):
        gb = self.capacidad_gb
        if gb >= 1024 and gb % 1024 == 0:
            return f'{gb // 1024} TB'
        return f'{gb} GB'

    def __str__(self):
        return f'{self.modelo} {self.capacidad_label} · {self.precio_min}-{self.precio_max} USD'


class TipoServicio(ModeloBase):
    """Un tipo de service cotizable (cambio de bateria, de modulo, de tapa...)."""

    nombre = models.CharField('nombre', max_length=120)
    orden = models.PositiveSmallIntegerField('orden', default=0)
    activo = models.BooleanField('activo', default=True)

    class Meta:
        db_table = 'cotizaciones_tipos_servicio'
        verbose_name = 'tipo de service'
        verbose_name_plural = 'tipos de service'
        ordering = ('orden', 'nombre')

    def __str__(self):
        return self.nombre


class PrecioServicio(ModeloBase):
    """Precio (USD) de un tipo de service para un modelo concreto.

    Los modelos sin precio para un tipo ("-" en la hoja) no tienen fila.
    """

    modelo = models.ForeignKey(
        ModeloEquipo,
        on_delete=models.CASCADE,
        related_name='servicios',
        verbose_name='modelo',
    )
    tipo = models.ForeignKey(
        TipoServicio,
        on_delete=models.CASCADE,
        related_name='precios',
        verbose_name='tipo de service',
    )
    precio = models.DecimalField(
        'precio (USD)',
        max_digits=8,
        decimal_places=2,
        validators=[MinValueValidator(0)],
    )

    class Meta:
        db_table = 'cotizaciones_precios_servicio'
        verbose_name = 'precio de service'
        verbose_name_plural = 'precios de service'
        ordering = ('tipo__orden', 'tipo__nombre')
        constraints = [
            models.UniqueConstraint(
                fields=('modelo', 'tipo'),
                condition=models.Q(borrado=False),
                name='uq_precio_servicio_vivo',
            ),
        ]

    def __str__(self):
        return f'{self.tipo} · {self.modelo} · {self.precio} USD'
