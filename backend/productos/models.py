"""Productos: el catalogo central de TODO lo que se vende (hoja "Accesorios").

La tabla `Producto` centraliza accesorios, parlantes, consolas, Xiaomi, Samsung,
productos Apple y los iPhone que se quieran cargar. Cada producto cuelga de una
`CategoriaProducto` (jerarquica: "Cables" tiene hijas "USB-C a Lightning", etc.)
que define lo comun: garantia/nota, descuento cash, redondeo, si existe precio
cash y que tabla de cuotas del simulador aplica.

Formula de precios (verificada contra las 391 filas de la hoja; solo 2 tienen
override manual):

    cash USD  = lista USD - descuento %        (20 % global; 30 % en auriculares
                                                y smartwatch, via la categoria)
    lista $   = lista USD x dolar, redondeado ARRIBA a $100 ($1.000 en
                Samsung/Apple, via la categoria)
    cash $    = cash USD x dolar, redondeado ARRIBA a $1.000
                (OJO: deriva del cash USD, no de la lista $ — distinto a Service)

El dolar es EL MISMO del negocio que usa Precios de Service (una sola cotizacion
compartida): cambiarlo recalcula las dos listas.

Cada producto puede vincularse a los `Dispositivo` del catalogo de Service
("compatible con" / "es el equipo"): eso alimenta la Ficha de equipo.
"""
from decimal import ROUND_HALF_UP, Decimal
import math

from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models

from comun.models import ModeloBase
from precios_service.models import ConfiguracionService, Dispositivo


class ConfiguracionProductos(ModeloBase):
    """Parametros globales del catalogo (fila unica, pk=1).

    El dolar NO vive aca: se lee de `ConfiguracionService` (cotizacion unica
    del negocio, compartida con la lista de service).
    """

    descuento_cash_pct = models.DecimalField(
        'descuento cash (%)',
        max_digits=5,
        decimal_places=2,
        default=Decimal('20'),
        validators=[MinValueValidator(0)],
        help_text='Descuento global por pago cash. Las categorias pueden pisarlo.',
    )
    redondeo_lista_ars = models.PositiveIntegerField(
        'redondeo lista ($)',
        default=100,
        validators=[MinValueValidator(1)],
        help_text='La lista en pesos se redondea PARA ARRIBA a este multiplo.',
    )
    redondeo_cash_ars = models.PositiveIntegerField(
        'redondeo cash ($)',
        default=1000,
        validators=[MinValueValidator(1)],
        help_text='El cash en pesos se redondea PARA ARRIBA a este multiplo.',
    )

    class Meta:
        db_table = 'productos_configuracion'
        verbose_name = 'configuracion de productos'
        verbose_name_plural = 'configuracion de productos'

    @classmethod
    def obtener(cls):
        config, _ = cls.todos.get_or_create(pk=1)
        return config

    @property
    def dolar(self):
        """Cotizacion unica del negocio (compartida con Precios de Service)."""
        return ConfiguracionService.obtener().dolar

    def __str__(self):
        return f'cash -{self.descuento_cash_pct} % · redondeos {self.redondeo_lista_ars}/{self.redondeo_cash_ars}'


class CategoriaProducto(ModeloBase):
    """Una seccion de la lista (Fuentes, Cables, ...), opcionalmente anidada.

    Maximo dos niveles: una categoria con `padre` es un subgrupo (los
    sub-titulos de la hoja, ej: "USB-C a Lightning" dentro de "Cables") y se
    muestra como separador dentro de la categoria madre.
    """

    class TarifaCuotas(models.TextChoices):
        ACCESORIOS = 'accesorios', 'Accesorios'
        EQUIPOS = 'equipos', 'Equipos'

    padre = models.ForeignKey(
        'self',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='hijas',
        verbose_name='categoria madre',
    )
    nombre = models.CharField('nombre', max_length=120)
    nota = models.TextField(
        'nota',
        blank=True,
        help_text='Garantia y condiciones que se muestran en la seccion.',
    )
    descuento_cash_pct = models.DecimalField(
        'descuento cash propio (%)',
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        help_text='Vacio = usa el global. Auriculares y smartwatch usan 30.',
    )
    redondeo_ars = models.PositiveIntegerField(
        'redondeo lista propio ($)',
        null=True,
        blank=True,
        validators=[MinValueValidator(1)],
        help_text='Vacio = usa el global ($100). Samsung/Apple usan $1.000.',
    )
    muestra_cash = models.BooleanField(
        'muestra precio cash',
        default=True,
        help_text='Samsung y Apple no tienen precio cash: va lista + cuotas.',
    )
    tarifa_cuotas = models.CharField(
        'tarifa de cuotas',
        max_length=20,
        choices=TarifaCuotas.choices,
        default=TarifaCuotas.ACCESORIOS,
        help_text='Que tabla del simulador de tarjetas aplica a esta categoria.',
    )
    es_equipo = models.BooleanField(
        'es venta de equipos',
        default=False,
        help_text='En la Ficha de equipo, sus productos salen como VENTA (no como accesorio compatible).',
    )
    orden = models.PositiveSmallIntegerField('orden', default=0)
    activo = models.BooleanField('activo', default=True)

    class Meta:
        db_table = 'productos_categorias'
        verbose_name = 'categoria de producto'
        verbose_name_plural = 'categorias de producto'
        ordering = ('orden', 'nombre')

    def clean(self):
        if self.padre_id:
            if self.padre_id == self.pk:
                raise ValidationError('Una categoria no puede ser su propia madre.')
            if self.padre.padre_id:
                raise ValidationError('Maximo dos niveles: la madre no puede ser a su vez un subgrupo.')

    def __str__(self):
        return f'{self.padre.nombre} · {self.nombre}' if self.padre_id else self.nombre


class Producto(ModeloBase):
    """Un producto vendible del catalogo central."""

    categoria = models.ForeignKey(
        CategoriaProducto,
        on_delete=models.CASCADE,
        related_name='productos',
        verbose_name='categoria',
    )
    nombre = models.CharField('nombre', max_length=200)
    marca = models.CharField('marca', max_length=60, blank=True)
    calidad = models.CharField(
        'calidad',
        max_length=60,
        blank=True,
        help_text='Ej: "Calidad original", "Apple original", "Original".',
    )
    nota = models.CharField(
        'nota',
        max_length=200,
        blank=True,
        help_text='Aclaracion de la fila (ej: "x2 $6.000", "precio si compran equipo").',
    )
    a_pedido = models.BooleanField('a pedido', default=False,
                                   help_text='Requiere seña previa (no hay stock inmediato).')
    nuevo = models.BooleanField('producto nuevo', default=False)
    dispositivos = models.ManyToManyField(
        Dispositivo,
        blank=True,
        related_name='productos',
        verbose_name='equipos vinculados',
        help_text='Para la Ficha de equipo: el equipo que ES o con los que es compatible.',
    )
    costo_usd = models.DecimalField(
        'costo (USD)',
        max_digits=12, decimal_places=2, null=True, blank=True,
        validators=[MinValueValidator(0)],
        help_text='Costo de reposicion. Solo lo ven los administradores.',
    )
    precio_lista_usd = models.DecimalField(
        'precio de lista (USD)',
        max_digits=12, decimal_places=2, null=True, blank=True,
        validators=[MinValueValidator(0)],
    )
    precio_cash_usd = models.DecimalField(
        'override cash (USD)',
        max_digits=12, decimal_places=2, null=True, blank=True,
        validators=[MinValueValidator(0)],
    )
    precio_lista_ars = models.DecimalField(
        'override lista ($)',
        max_digits=12, decimal_places=2, null=True, blank=True,
        validators=[MinValueValidator(0)],
    )
    precio_cash_ars = models.DecimalField(
        'override cash ($)',
        max_digits=12, decimal_places=2, null=True, blank=True,
        validators=[MinValueValidator(0)],
    )
    orden = models.PositiveSmallIntegerField('orden', default=0)
    activo = models.BooleanField('activo', default=True)

    class Meta:
        db_table = 'productos_items'
        verbose_name = 'producto'
        verbose_name_plural = 'productos'
        ordering = ('orden', 'id')

    def __str__(self):
        return self.nombre


# ===== Derivacion de precios efectivos =====

def _ceil_multiplo(valor, multiplo):
    multiplo = int(multiplo) or 1
    return Decimal(math.ceil(Decimal(valor) / multiplo) * multiplo)


def resolver_descuento_cash(categoria, config):
    """Descuento cash efectivo de una categoria: propio, si no el de la madre,
    si no el general. Asi un subgrupo sigue a su categoria madre salvo que
    tenga un valor propio."""
    descuento = categoria.descuento_cash_pct
    if descuento is None and categoria.padre_id:
        descuento = categoria.padre.descuento_cash_pct
    if descuento is None:
        descuento = config.descuento_cash_pct
    return descuento


def resolver_precio_producto(producto, config, categoria=None):
    """Los 4 precios efectivos de un producto (override si hay, formula si no).

    A diferencia de Service, el cash $ deriva del cash USD (verificado contra
    la hoja: 391/391 filas). Si la categoria no muestra cash, solo un override
    explicito produce valor.
    """
    categoria = categoria or producto.categoria
    descuento = resolver_descuento_cash(categoria, config)
    factor = (Decimal('100') - Decimal(descuento)) / Decimal('100')
    dolar = config.dolar

    lista_usd = producto.precio_lista_usd

    cash_usd = producto.precio_cash_usd
    if cash_usd is None and lista_usd is not None and categoria.muestra_cash:
        cash_usd = (lista_usd * factor).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    lista_ars = producto.precio_lista_ars
    if lista_ars is None and lista_usd is not None:
        redondeo = categoria.redondeo_ars or config.redondeo_lista_ars
        lista_ars = _ceil_multiplo(lista_usd * dolar, redondeo)

    cash_ars = producto.precio_cash_ars
    if cash_ars is None and cash_usd is not None:
        cash_ars = _ceil_multiplo(cash_usd * dolar, config.redondeo_cash_ars)

    return {
        'lista_usd': lista_usd,
        'cash_usd': cash_usd,
        'lista_ars': lista_ars,
        'cash_ars': cash_ars,
    }
