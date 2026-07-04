"""Precios de service: la lista de precios del taller, hoja "Precios Service".

La hoja tiene N secciones (baterias, modulos, camara trasera, ...) y en cada una
filas con hasta 4 precios: lista USD, cash USD, lista $ y cash $. Casi todos los
valores salen de una formula (verificada celda por celda contra el Excel):

    cash USD = lista USD - descuento %                  (sin redondeo)
    lista $  = lista USD x dolar, redondeado al millar PARA ARRIBA
    cash $   = lista $ - descuento %, redondeado al millar PARA ARRIBA

...pero hay excepciones cargadas a mano (baterias, promos). Por eso cada precio
guarda `precio_lista_usd` y tres columnas de OVERRIDE opcionales: si estan en
NULL se derivan con la formula; si tienen valor, pisan la formula. Cambiar el
dolar en `ConfiguracionService` recalcula toda la lista al instante sin tocar
los overrides (igual que funciona la planilla).

Estructura (todo dato, nada hardcodeado):
- `SeccionService`: cada bloque de la hoja. Con nota (demoras/condiciones) y
  descuento cash propio opcional (la promo "30% OFF" de tapa trasera).
- `VarianteSeccion`: las "calidades" de una seccion (LCD / OLED / Apple
  Original, reconoce o no la bateria como original...). Las secciones simples
  tienen una unica variante.
- `ItemService`: una fila (modelo, grupo de modelos, linea o servicio suelto;
  texto libre porque la hoja mezcla iPhone, iPad, Mac y Apple Watch).
- `PrecioItemService`: los precios de una fila x variante.
"""
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
import math

from django.core.validators import MinValueValidator
from django.db import models
from django.utils.dateparse import parse_datetime

from comun.models import ModeloBase


class ConfiguracionService(ModeloBase):
    """Parametros globales que derivan los precios (fila unica, pk=1)."""

    dolar = models.DecimalField(
        'dolar service',
        max_digits=10,
        decimal_places=2,
        default=Decimal('1550'),
        validators=[MinValueValidator(0)],
        help_text='Cotizacion usada para pasar la lista USD a pesos.',
    )
    descuento_cash_pct = models.DecimalField(
        'descuento cash (%)',
        max_digits=5,
        decimal_places=2,
        default=Decimal('20'),
        validators=[MinValueValidator(0)],
        help_text='Descuento por pago cash sobre el precio de lista. 20 = 20 %.',
    )
    redondeo_ars = models.PositiveIntegerField(
        'redondeo ARS',
        default=1000,
        validators=[MinValueValidator(1)],
        help_text='Los precios en pesos se redondean PARA ARRIBA a este multiplo.',
    )

    class Meta:
        db_table = 'precios_service_configuracion'
        verbose_name = 'configuracion de service'
        verbose_name_plural = 'configuracion de service'

    @classmethod
    def obtener(cls):
        """Devuelve la fila unica de configuracion (la crea si no existe)."""
        config, _ = cls.todos.get_or_create(pk=1)
        return config

    def __str__(self):
        return f'dolar {self.dolar} · cash -{self.descuento_cash_pct} % · redondeo {self.redondeo_ars}'


class CotizacionDolarBlue(ModeloBase):
    """Ultima cotizacion del blue traida de DolarAPI (fila unica, pk=1).

    Cada consulta exitosa del proxy la pisa. Es el RESPALDO del gestor de
    dolar: si DolarAPI no responde, se muestra esta (marcada como
    desactualizada) en vez de "no disponible". NUNCA alimenta los precios:
    esos se calculan siempre con `ConfiguracionService.dolar`.
    """

    compra = models.DecimalField('compra', max_digits=10, decimal_places=2, null=True, blank=True)
    venta = models.DecimalField('venta', max_digits=10, decimal_places=2, null=True, blank=True)
    fecha = models.DateTimeField(
        'fecha de la cotizacion',
        null=True,
        blank=True,
        help_text='La fecha que informa DolarAPI para esta cotizacion.',
    )

    class Meta:
        db_table = 'precios_service_dolar_blue'
        verbose_name = 'cotizacion dolar blue'
        verbose_name_plural = 'cotizacion dolar blue'

    @classmethod
    def guardar(cls, compra, venta, fecha_iso):
        """Pisa la fila unica con la cotizacion recien obtenida."""

        def _decimal(valor):
            try:
                return None if valor is None else Decimal(str(valor))
            except (InvalidOperation, ValueError):
                return None

        try:
            fecha = parse_datetime(fecha_iso) if fecha_iso else None
        except ValueError:
            fecha = None
        fila, _ = cls.todos.update_or_create(pk=1, defaults={
            'compra': _decimal(compra),
            'venta': _decimal(venta),
            'fecha': fecha,
            'borrado': False,
            'fecha_borrado': None,
        })
        return fila

    @classmethod
    def ultima(cls):
        """La ultima cotizacion guardada, o None si nunca se obtuvo una."""
        fila = cls.todos.filter(pk=1).first()
        return fila if fila is not None and fila.venta is not None else None

    def __str__(self):
        return f'blue compra {self.compra} · venta {self.venta}'


class Dispositivo(ModeloBase):
    """Un equipo reparable del taller (iPhone 11 Pro, iPad, Apple Watch...).

    Es el catalogo del selector de la pagina Service: elegir un dispositivo
    muestra todas las filas vinculadas a el; elegir una linea ("11") muestra
    lo de todos los dispositivos de esa linea. Es un catalogo APARTE del de
    Cotizaciones a proposito: este es "lo que reparamos" (iPhone 6 en
    adelante, iPad, Mac, Watch), aquel es "lo que compramos usado".
    """

    nombre = models.CharField('nombre', max_length=120)
    linea = models.CharField(
        'linea',
        max_length=40,
        blank=True,
        help_text='Agrupa para el filtro por linea: "11" junta a 11, 11 Pro y 11 Pro Max.',
    )
    orden = models.PositiveSmallIntegerField('orden', default=0)
    activo = models.BooleanField('activo', default=True)

    class Meta:
        db_table = 'precios_service_dispositivos'
        verbose_name = 'dispositivo'
        verbose_name_plural = 'dispositivos'
        ordering = ('orden', 'nombre')
        constraints = [
            models.UniqueConstraint(
                fields=('nombre',),
                condition=models.Q(borrado=False),
                name='uq_dispositivo_vivo',
            ),
        ]

    def __str__(self):
        return self.nombre


class SeccionService(ModeloBase):
    """Un bloque de la hoja (Baterias, Modulos, Camara trasera, ...)."""

    nombre = models.CharField('nombre', max_length=120)
    nota = models.TextField(
        'nota',
        blank=True,
        help_text='Demoras y condiciones que se muestran en la seccion.',
    )
    descuento_cash_pct = models.DecimalField(
        'descuento cash propio (%)',
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        help_text='Si esta vacio usa el descuento global. Sirve para promos (ej: tapa 30 %).',
    )
    orden = models.PositiveSmallIntegerField('orden', default=0)
    activo = models.BooleanField('activo', default=True)

    class Meta:
        db_table = 'precios_service_secciones'
        verbose_name = 'seccion de service'
        verbose_name_plural = 'secciones de service'
        ordering = ('orden', 'nombre')

    def __str__(self):
        return self.nombre


class VarianteSeccion(ModeloBase):
    """Una calidad/columna de la seccion (LCD, OLED, Apple Original...)."""

    seccion = models.ForeignKey(
        SeccionService,
        on_delete=models.CASCADE,
        related_name='variantes',
        verbose_name='seccion',
    )
    nombre = models.CharField('nombre', max_length=120)
    orden = models.PositiveSmallIntegerField('orden', default=0)

    class Meta:
        db_table = 'precios_service_variantes'
        verbose_name = 'variante de seccion'
        verbose_name_plural = 'variantes de seccion'
        ordering = ('orden', 'id')

    def __str__(self):
        return f'{self.seccion} · {self.nombre}'


class ItemService(ModeloBase):
    """Una fila de la seccion: modelo, grupo, linea o servicio suelto."""

    seccion = models.ForeignKey(
        SeccionService,
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name='seccion',
    )
    etiqueta = models.CharField('etiqueta', max_length=200)
    nota = models.CharField(
        'nota',
        max_length=200,
        blank=True,
        help_text='Aclaracion de la fila (ej: "CON LASER 2-3 DIAS").',
    )
    dispositivos = models.ManyToManyField(
        Dispositivo,
        blank=True,
        related_name='items',
        verbose_name='dispositivos',
        help_text='Equipos a los que aplica esta fila (alimenta el selector de la pagina).',
    )
    orden = models.PositiveSmallIntegerField('orden', default=0)
    activo = models.BooleanField('activo', default=True)

    class Meta:
        db_table = 'precios_service_items'
        verbose_name = 'item de service'
        verbose_name_plural = 'items de service'
        ordering = ('orden', 'id')

    def __str__(self):
        return f'{self.seccion} · {self.etiqueta}'


def _precio(max_digits=12):
    return dict(max_digits=max_digits, decimal_places=2, null=True, blank=True,
                validators=[MinValueValidator(0)])


class PrecioItemService(ModeloBase):
    """Precios de una fila x variante. NULL = se deriva con la formula."""

    item = models.ForeignKey(
        ItemService,
        on_delete=models.CASCADE,
        related_name='precios',
        verbose_name='item',
    )
    variante = models.ForeignKey(
        VarianteSeccion,
        on_delete=models.CASCADE,
        related_name='precios',
        verbose_name='variante',
    )
    precio_lista_usd = models.DecimalField('precio de lista (USD)', **_precio())
    precio_cash_usd = models.DecimalField('override cash (USD)', **_precio())
    precio_lista_ars = models.DecimalField('override lista ($)', **_precio())
    precio_cash_ars = models.DecimalField('override cash ($)', **_precio())

    class Meta:
        db_table = 'precios_service_precios'
        verbose_name = 'precio de item'
        verbose_name_plural = 'precios de items'
        ordering = ('variante__orden', 'id')
        constraints = [
            models.UniqueConstraint(
                fields=('item', 'variante'),
                condition=models.Q(borrado=False),
                name='uq_precio_item_variante_vivo',
            ),
        ]

    def __str__(self):
        return f'{self.item} · {self.variante.nombre}'


# ===== Derivacion de precios efectivos =====

def _ceil_multiplo(valor, multiplo):
    """Redondeo PARA ARRIBA al multiplo (asi arma los $ la planilla)."""
    multiplo = int(multiplo) or 1
    return Decimal(math.ceil(Decimal(valor) / multiplo) * multiplo)


def resolver_precios(precio, config, descuento_pct=None):
    """Devuelve los 4 precios efectivos de un `PrecioItemService`.

    Cada valor usa el override si esta cargado; si no, se deriva:
      cash_usd  = lista_usd - descuento %              (redondeado a 2 dec.)
      lista_ars = ceil(lista_usd x dolar, redondeo)
      cash_ars  = ceil(lista_ars - descuento %, redondeo)
    Cualquier valor puede quedar en None (ej: variantes solo en pesos).
    """
    if descuento_pct is None:
        descuento_pct = config.descuento_cash_pct
    factor = (Decimal('100') - Decimal(descuento_pct)) / Decimal('100')

    lista_usd = precio.precio_lista_usd

    cash_usd = precio.precio_cash_usd
    if cash_usd is None and lista_usd is not None:
        cash_usd = (lista_usd * factor).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    lista_ars = precio.precio_lista_ars
    if lista_ars is None and lista_usd is not None:
        lista_ars = _ceil_multiplo(lista_usd * config.dolar, config.redondeo_ars)

    cash_ars = precio.precio_cash_ars
    if cash_ars is None and lista_ars is not None:
        cash_ars = _ceil_multiplo(lista_ars * factor, config.redondeo_ars)

    return {
        'lista_usd': lista_usd,
        'cash_usd': cash_usd,
        'lista_ars': lista_ars,
        'cash_ars': cash_ars,
    }
