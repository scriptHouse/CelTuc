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

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models, transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from comun.models import ModeloBase


class ConfiguracionService(ModeloBase):
    """Parametros globales que derivan los precios (fila unica, pk=1).

    El dolar es EL valor del negocio: lo leen Service, Productos, los dos
    importadores y los presupuestos. Puede fijarse a mano (modo manual, como
    siempre) o seguir al blue de DolarAPI con un ajuste (modo automatico): en
    los dos casos lo que cambia es este mismo campo `dolar`, asi que todo lo
    que lo consume no se entera de como se obtuvo. Cada valor que estuvo
    vigente queda en `HistorialDolar` (desde, hasta, origen y quien).
    """

    class Modo(models.TextChoices):
        MANUAL = 'manual', 'Manual (lo fija una persona)'
        AUTOMATICO = 'automatico', 'Automatico (sigue al dolar blue)'

    class Referencia(models.TextChoices):
        """Que cotizacion del blue se toma como base del calculo."""

        VENTA = 'venta', 'Blue venta'
        COMPRA = 'compra', 'Blue compra'
        PROMEDIO = 'promedio', 'Promedio compra/venta'

    class AjusteTipo(models.TextChoices):
        MONTO = 'monto', 'Pesos fijos'
        PORCENTAJE = 'porcentaje', 'Porcentaje'

    dolar = models.DecimalField(
        'dolar service',
        max_digits=10,
        decimal_places=2,
        default=Decimal('1550'),
        validators=[MinValueValidator(0)],
        help_text='Cotizacion usada para pasar la lista USD a pesos.',
    )
    # --- Como se obtiene el dolar (modo automatico) ---
    dolar_modo = models.CharField(
        'como se define el dolar', max_length=12, choices=Modo.choices, default=Modo.MANUAL,
    )
    dolar_referencia = models.CharField(
        'referencia del blue', max_length=10, choices=Referencia.choices,
        default=Referencia.VENTA,
        help_text='Sobre que cotizacion del blue se aplica el ajuste.',
    )
    dolar_ajuste_tipo = models.CharField(
        'tipo de ajuste', max_length=10, choices=AjusteTipo.choices, default=AjusteTipo.MONTO,
    )
    dolar_ajuste_valor = models.DecimalField(
        'ajuste', max_digits=10, decimal_places=2, default=Decimal('0'),
        help_text='Con signo: +25 suma $25 (o 25 %); -10 resta. 0 = el blue tal cual.',
    )
    dolar_redondeo = models.DecimalField(
        'redondeo del dolar', max_digits=8, decimal_places=2, default=Decimal('1'),
        validators=[MinValueValidator(0)],
        help_text='El resultado se redondea al multiplo mas cercano ($1, $5, $10...). 0 = sin redondear.',
    )
    dolar_cambio_minimo = models.DecimalField(
        'cambio minimo', max_digits=10, decimal_places=2, default=Decimal('0'),
        validators=[MinValueValidator(0)],
        help_text='En automatico, no se actualiza si la diferencia con el vigente es menor a esto.',
    )
    dolar_calculado_en = models.DateTimeField(
        'ultima revision automatica', null=True, blank=True,
        help_text='Cuando se reviso el blue por ultima vez en modo automatico (cambie o no).',
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

    @property
    def es_automatico(self) -> bool:
        return self.dolar_modo == self.Modo.AUTOMATICO

    @property
    def regla(self) -> dict:
        """La regla del modo automatico, como diccionario plano (para el historial)."""
        return {
            'referencia': self.dolar_referencia,
            'ajuste_tipo': self.dolar_ajuste_tipo,
            'ajuste_valor': self.dolar_ajuste_valor,
            'redondeo': self.dolar_redondeo,
        }

    @property
    def regla_descripcion(self) -> str:
        """La regla en una frase: «blue venta + $25, redondeado a $5»."""
        return describir_regla(**self.regla)

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


class HistorialDolar(models.Model):
    """Cada valor que tuvo el dolar del negocio: desde cuando, hasta cuando y por que.

    Es una bitacora de solo escritura (tabla plana, sin `ModeloBase`): no se
    edita ni se borra. La fila con `vigente_hasta` vacio es la que rige hoy.
    Se escribe tanto cuando una persona fija el dolar a mano como cuando el
    modo automatico lo recalcula a partir del blue; en ese caso guarda ademas
    la cotizacion que uso y la regla con la que la ajusto, asi el historial
    explica cada numero.
    """

    class Origen(models.TextChoices):
        MANUAL = 'manual', 'Fijado a mano'
        AUTOMATICO = 'automatico', 'Calculado del blue'
        INICIAL = 'inicial', 'Valor inicial (antes del historial)'

    valor = models.DecimalField('dolar', max_digits=10, decimal_places=2)
    valor_anterior = models.DecimalField(
        'dolar anterior', max_digits=10, decimal_places=2, null=True, blank=True,
    )
    vigente_desde = models.DateTimeField('vigente desde', db_index=True)
    vigente_hasta = models.DateTimeField('vigente hasta', null=True, blank=True)
    origen = models.CharField('origen', max_length=12, choices=Origen.choices)
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
        verbose_name='usuario',
    )
    # Foto del nombre: el historial se lee igual si la cuenta se elimina.
    usuario_username = models.CharField('usuario (foto)', max_length=150, blank=True)
    # La cotizacion del blue que se uso (solo en automatico; informativa en manual).
    blue_compra = models.DecimalField('blue compra', max_digits=10, decimal_places=2, null=True, blank=True)
    blue_venta = models.DecimalField('blue venta', max_digits=10, decimal_places=2, null=True, blank=True)
    blue_fecha = models.DateTimeField('fecha del blue', null=True, blank=True)
    # La regla vigente al calcular (vacia en manual).
    referencia = models.CharField(
        'referencia', max_length=10, choices=ConfiguracionService.Referencia.choices, blank=True,
    )
    ajuste_tipo = models.CharField(
        'tipo de ajuste', max_length=10, choices=ConfiguracionService.AjusteTipo.choices, blank=True,
    )
    ajuste_valor = models.DecimalField('ajuste', max_digits=10, decimal_places=2, null=True, blank=True)
    redondeo = models.DecimalField('redondeo', max_digits=8, decimal_places=2, null=True, blank=True)
    nota = models.CharField('nota', max_length=200, blank=True)

    class Meta:
        db_table = 'precios_service_dolar_historial'
        verbose_name = 'historial del dolar'
        verbose_name_plural = 'historial del dolar'
        ordering = ('-vigente_desde', '-id')

    def __str__(self):
        return f'${self.valor} desde {self.vigente_desde:%d/%m/%Y %H:%M} ({self.get_origen_display()})'

    @property
    def vigente(self) -> bool:
        return self.vigente_hasta is None

    @property
    def regla_descripcion(self) -> str:
        if self.origen != self.Origen.AUTOMATICO or not self.referencia:
            return ''
        return describir_regla(
            referencia=self.referencia,
            ajuste_tipo=self.ajuste_tipo,
            ajuste_valor=self.ajuste_valor or Decimal('0'),
            redondeo=self.redondeo or Decimal('0'),
        )


# ===== Dolar automatico =====

_CENTAVO = Decimal('0.01')


def _plata(valor) -> str:
    """Un numero como lo diria una persona: «1.580», «25,50»."""
    valor = Decimal(valor).quantize(_CENTAVO)
    entero, _, decimales = f'{valor:,.2f}'.partition('.')
    entero = entero.replace(',', '.')
    return entero if decimales == '00' else f'{entero},{decimales}'


def describir_regla(*, referencia, ajuste_tipo, ajuste_valor, redondeo) -> str:
    """La regla del automatico en una frase corta, la misma que muestra la UI."""
    base = {
        ConfiguracionService.Referencia.VENTA: 'blue venta',
        ConfiguracionService.Referencia.COMPRA: 'blue compra',
        ConfiguracionService.Referencia.PROMEDIO: 'promedio del blue',
    }.get(referencia, 'blue venta')
    ajuste = Decimal(ajuste_valor or 0)
    if ajuste == 0:
        frase = f'{base} tal cual'
    else:
        signo = '+' if ajuste > 0 else '−'
        if ajuste_tipo == ConfiguracionService.AjusteTipo.PORCENTAJE:
            frase = f'{base} {signo} {_plata(abs(ajuste))} %'
        else:
            frase = f'{base} {signo} ${_plata(abs(ajuste))}'
    redondeo = Decimal(redondeo or 0)
    if redondeo > 0 and redondeo != 1:
        frase += f', redondeado a ${_plata(redondeo)}'
    return frase


def _referencia_del_blue(referencia, compra, venta):
    """La cotizacion base segun la referencia elegida (None si falta el dato)."""
    compra = None if compra is None else Decimal(str(compra))
    venta = None if venta is None else Decimal(str(venta))
    if referencia == ConfiguracionService.Referencia.COMPRA:
        return compra
    if referencia == ConfiguracionService.Referencia.PROMEDIO:
        if compra is None or venta is None:
            return venta if compra is None else compra
        return (compra + venta) / 2
    return venta


def calcular_dolar_automatico(config, compra, venta):
    """El dolar que resulta de aplicar la regla de `config` al blue.

    Devuelve un Decimal con dos decimales, o None si el blue no trae la
    cotizacion que la regla necesita. Es una funcion pura: no escribe nada.
    """
    base = _referencia_del_blue(config.dolar_referencia, compra, venta)
    if base is None or base <= 0:
        return None
    ajuste = Decimal(config.dolar_ajuste_valor or 0)
    if config.dolar_ajuste_tipo == ConfiguracionService.AjusteTipo.PORCENTAJE:
        resultado = base * (Decimal('1') + ajuste / Decimal('100'))
    else:
        resultado = base + ajuste
    redondeo = Decimal(config.dolar_redondeo or 0)
    if redondeo > 0:
        resultado = (resultado / redondeo).quantize(Decimal('1'), rounding=ROUND_HALF_UP) * redondeo
    resultado = resultado.quantize(_CENTAVO, rounding=ROUND_HALF_UP)
    if resultado <= 0:
        return None
    return resultado


def registrar_cambio_dolar(config, nuevo, *, origen, usuario=None, blue=None, nota=''):
    """Escribe el dolar nuevo en la configuracion y deja constancia en el historial.

    Cierra la fila vigente (`vigente_hasta` = ahora), abre la nueva y guarda el
    valor en `ConfiguracionService.dolar`, todo en una transaccion. Si el valor
    es el mismo que ya rige, no toca nada y devuelve None: un historial sin
    filas repetidas es el que se puede leer.

    `blue` es un diccionario opcional con `compra`, `venta` y `fecha` (la
    cotizacion que se uso, o la que habia a la vista al fijarlo a mano).
    """
    nuevo = Decimal(str(nuevo)).quantize(_CENTAVO, rounding=ROUND_HALF_UP)
    if nuevo <= 0:
        raise ValidationError('El dolar tiene que ser mayor a 0.')

    blue = blue or {}
    automatico = origen == HistorialDolar.Origen.AUTOMATICO
    with transaction.atomic():
        # Se bloquea la fila de configuracion y se compara contra lo que hay EN
        # LA BASE, no contra la instancia que trajo quien llama: con varios
        # workers, dos peticiones simultaneas calculaban el mismo dolar y las
        # dos lo registraban (dos filas «vigente ahora»). Con el bloqueo, la
        # segunda espera, ve el valor ya escrito y no hace nada.
        en_base = (
            ConfiguracionService.todos.select_for_update()
            .filter(pk=config.pk)
            .values_list('dolar', flat=True)
            .first()
        )
        anterior = Decimal(en_base).quantize(_CENTAVO) if en_base is not None else None
        if anterior is not None and anterior == nuevo:
            config.dolar = nuevo  # la instancia se pone al dia con la base
            return None

        ahora = timezone.now()
        HistorialDolar.objects.filter(vigente_hasta__isnull=True).update(vigente_hasta=ahora)
        fila = HistorialDolar.objects.create(
            valor=nuevo,
            valor_anterior=anterior,
            vigente_desde=ahora,
            origen=origen,
            usuario=usuario if getattr(usuario, 'pk', None) else None,
            usuario_username=getattr(usuario, 'username', '') or '',
            blue_compra=blue.get('compra'),
            blue_venta=blue.get('venta'),
            blue_fecha=blue.get('fecha'),
            referencia=config.dolar_referencia if automatico else '',
            ajuste_tipo=config.dolar_ajuste_tipo if automatico else '',
            ajuste_valor=config.dolar_ajuste_valor if automatico else None,
            redondeo=config.dolar_redondeo if automatico else None,
            nota=(nota or '')[:200],
        )
        config.dolar = nuevo
        campos = ['dolar']
        if usuario is not None and getattr(usuario, 'pk', None):
            config.actualizado_por = usuario
            campos.append('actualizado_por')
        # Un recalculo automatico no es una accion de la cuenta que lo disparo
        # (puede ser cualquier empleado abriendo el Panel): la auditoria lo
        # saltea y la constancia queda en el historial del dolar.
        config._auditoria_omitir = automatico
        try:
            config.save(update_fields=campos)
        finally:
            config._auditoria_omitir = False
    return fila


def aplicar_dolar_automatico(config, blue, *, usuario=None):
    """Recalcula el dolar con la regla de `config` y lo aplica si corresponde.

    Solo actua en modo automatico y con un blue utilizable. Respeta el cambio
    minimo configurado: una oscilacion chica del blue no mueve todos los
    precios. Devuelve la fila de historial creada, o None si no cambio nada.
    Siempre deja anotado `dolar_calculado_en` (se reviso, haya cambiado o no).
    """
    if not config.es_automatico or not blue:
        return None
    nuevo = calcular_dolar_automatico(config, blue.get('compra'), blue.get('venta'))
    ahora = timezone.now()
    config.dolar_calculado_en = ahora
    # `update()` directo: es un dato de servicio, no un cambio que auditar.
    ConfiguracionService.todos.filter(pk=config.pk).update(dolar_calculado_en=ahora)
    if nuevo is None:
        return None
    actual = Decimal(config.dolar)
    minimo = Decimal(config.dolar_cambio_minimo or 0)
    if nuevo != actual and abs(nuevo - actual) < minimo:
        return None
    # El autor de un valor automatico es la regla, no la cuenta que paso por
    # ahi: el historial lo deja sin usuario a proposito.
    del usuario
    return registrar_cambio_dolar(
        config, nuevo, origen=HistorialDolar.Origen.AUTOMATICO, usuario=None,
        blue=blue, nota='',
    )


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
    concepto_generico_factura = models.BooleanField(
        'concepto generico en factura',
        default=False,
        help_text=(
            'En la factura esta fila NO figura por su nombre: se agrupa en un '
            'renglon con el mensaje configurado en Facturacion. Marcado en los '
            'repuestos (baterias, modulos, camaras, flex, placas, tapas).'
        ),
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
