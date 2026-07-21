"""Modelos de facturacion electronica (ARCA / ex AFIP).

Cinco tablas, todas en español:

- ``facturacion_emisores``  -> :class:`Emisor`: cada cuenta que factura, con su
  CUIT, punto de venta y credenciales (certificado + clave privada) para hablar
  con ARCA. Puede haber N responsables inscriptos y N monotributistas.
- ``facturacion_limites_mensuales`` -> :class:`LimiteMensual`: tope de
  facturacion por emisor y mes calendario. Control INTERNO de la app (no viaja a
  ARCA): al emitir se avisa si se supera y el usuario decide.
- ``facturacion_comprobantes`` -> :class:`Comprobante`: cada factura emitida, con
  su CAE (autorizacion fiscal) y los datos del cliente.
- ``facturacion_items`` -> :class:`ItemComprobante`: los renglones de cada
  comprobante.
- ``facturacion_tickets_acceso`` -> :class:`TicketAcceso`: cache del "Ticket de
  Acceso" de ARCA (token + sign) que vale ~12 h, para no re-autenticar en cada
  pedido (ARCA rechaza pedir un TA nuevo si ya hay uno vigente).
"""
from decimal import Decimal

from django.core.validators import MaxValueValidator, MinValueValidator, RegexValidator
from django.db import models
from django.utils import timezone

from comun.models import ModeloBase

# Un CUIT son 11 digitos sin guiones. El front puede mostrarlo con guiones, pero
# se guarda y se manda a ARCA como 11 digitos.
cuit_validator = RegexValidator(
    regex=r'^\d{11}$',
    message='El CUIT debe tener 11 digitos (sin guiones).',
)


class Emisor(ModeloBase):
    """Una cuenta que emite comprobantes ante ARCA.

    El tipo de comprobante que puede emitir depende de su ``condicion``:
    un Responsable Inscripto emite Factura A (a otro RI) o B (al resto); un
    Monotributista emite siempre Factura C. Las credenciales (``certificado`` y
    ``clave_privada``) son las que ARCA entrega al habilitar el Web Service de
    Facturacion Electronica (wsfe) para ese CUIT; nunca se devuelven por la API.
    """

    class Condicion(models.TextChoices):
        RESPONSABLE_INSCRIPTO = 'responsable_inscripto', 'Responsable Inscripto'
        MONOTRIBUTISTA = 'monotributista', 'Monotributista'

    nombre = models.CharField('nombre / razon social', max_length=120)
    condicion = models.CharField(
        'condicion fiscal',
        max_length=30,
        choices=Condicion.choices,
        default=Condicion.RESPONSABLE_INSCRIPTO,
    )
    cuit = models.CharField('CUIT', max_length=11, validators=[cuit_validator])
    punto_venta = models.PositiveIntegerField(
        'punto de venta',
        default=1,
        help_text='Punto de venta habilitado para Web Services en ARCA.',
    )

    # Credenciales para ARCA. Se guardan como texto PEM (contenido del .crt y del
    # .key). Son write-only en la API: se cargan pero no se devuelven.
    certificado = models.TextField(
        'certificado (.crt/.pem)',
        blank=True,
        help_text='Contenido PEM del certificado emitido por ARCA.',
    )
    clave_privada = models.TextField(
        'clave privada (.key)',
        blank=True,
        help_text='Contenido PEM de la clave privada del certificado.',
    )

    produccion = models.BooleanField(
        'produccion',
        default=False,
        help_text='Apagado = homologacion (testing, sin CAE real). '
                  'Encendido = produccion (CAE con valor fiscal).',
    )
    activo = models.BooleanField('activo', default=True)

    # creado / actualizado / *_por / borrado* los aporta ModeloBase.

    class Meta:
        db_table = 'facturacion_emisores'
        verbose_name = 'emisor'
        verbose_name_plural = 'emisores'
        ordering = ('nombre',)

    def __str__(self):
        return f'{self.nombre} ({self.cuit})'

    @property
    def tiene_credenciales(self) -> bool:
        """True si tiene cargados certificado y clave (puede autenticar)."""
        return bool(self.certificado.strip() and self.clave_privada.strip())


class LimiteMensual(ModeloBase):
    """Tope de facturacion de un emisor para un mes calendario (1 al ultimo dia).

    Es un control INTERNO de la app, sin efecto fiscal: no viaja a ARCA ni toca
    la emision. Antes de pedir el CAE se compara el acumulado del mes (todos los
    comprobantes emitidos, incluso los ocultados de la lista: el CAE existe
    igual) mas la factura nueva contra ``monto``; si se supera, la API responde
    409 y el front pide confirmacion. El usuario siempre puede emitir igual.
    """

    emisor = models.ForeignKey(
        Emisor,
        on_delete=models.CASCADE,
        related_name='limites_mensuales',
        verbose_name='emisor',
    )
    anio = models.PositiveIntegerField('año')
    mes = models.PositiveSmallIntegerField(
        'mes',
        validators=[MinValueValidator(1), MaxValueValidator(12)],
        help_text='1 = enero … 12 = diciembre.',
    )
    monto = models.DecimalField(
        'monto tope', max_digits=14, decimal_places=2,
        validators=[MinValueValidator(0)],
    )

    class Meta:
        db_table = 'facturacion_limites_mensuales'
        verbose_name = 'limite mensual'
        verbose_name_plural = 'limites mensuales'
        ordering = ('emisor', 'anio', 'mes')
        constraints = [
            # Un solo limite vivo por emisor y mes (el borrado logico libera el
            # lugar para volver a configurarlo).
            models.UniqueConstraint(
                fields=('emisor', 'anio', 'mes'),
                condition=models.Q(borrado=False),
                name='uniq_limite_emisor_mes_vivo',
            ),
        ]

    def __str__(self):
        return f'Limite {self.mes:02d}/{self.anio} de {self.emisor_id}: {self.monto}'


class TicketAcceso(models.Model):
    """Cache del Ticket de Acceso (TA) de ARCA para un emisor.

    El TA (``token`` + ``sign``) lo entrega el WSAA y vale ~12 h. Lo guardamos
    para reusarlo entre pedidos y entre workers de gunicorn: si pedimos uno nuevo
    teniendo otro vigente, ARCA responde "el CEE ya posee un TA valido". Se
    invalida solo al vencer, o si cambia el ambiente (homologacion <-> produccion).
    """

    emisor = models.ForeignKey(
        Emisor,
        on_delete=models.CASCADE,
        related_name='tickets_acceso',
        verbose_name='emisor',
    )
    servicio = models.CharField('servicio', max_length=20, default='wsfe')
    produccion = models.BooleanField('produccion', default=False)
    token = models.TextField('token')
    sign = models.TextField('sign')
    generado = models.DateTimeField('generado', default=timezone.now)
    expiracion = models.DateTimeField('expiracion')

    class Meta:
        db_table = 'facturacion_tickets_acceso'
        verbose_name = 'ticket de acceso'
        verbose_name_plural = 'tickets de acceso'
        constraints = [
            models.UniqueConstraint(
                fields=('emisor', 'servicio'),
                name='uniq_ta_emisor_servicio',
            ),
        ]

    def __str__(self):
        return f'TA {self.servicio} de {self.emisor_id} (vence {self.expiracion:%d/%m %H:%M})'

    def vigente(self, margen_segundos: int = 600) -> bool:
        """True si el TA todavia sirve (con un margen de seguridad)."""
        return timezone.now() < self.expiracion - timezone.timedelta(seconds=margen_segundos)


class Comprobante(ModeloBase):
    """Un comprobante emitido (Factura A, B o C) con su CAE.

    Una vez emitido es inmutable a nivel fiscal: el CAE es la autorizacion de
    ARCA. Lo unico editable es el estado de cobro (interno, no fiscal). El borrado
    es logico (oculta de la lista) y NO anula el comprobante en ARCA: para eso se
    emite una Nota de Credito.
    """

    class Tipo(models.TextChoices):
        A = 'A', 'Factura A'
        B = 'B', 'Factura B'
        C = 'C', 'Factura C'

    class Concepto(models.IntegerChoices):
        PRODUCTOS = 1, 'Productos'
        SERVICIOS = 2, 'Servicios'
        PRODUCTOS_Y_SERVICIOS = 3, 'Productos y Servicios'

    class DocTipo(models.TextChoices):
        CUIT = 'CUIT', 'CUIT'
        CUIL = 'CUIL', 'CUIL'
        DNI = 'DNI', 'DNI'
        CF = 'CF', 'Consumidor Final'

    class CondicionReceptor(models.TextChoices):
        RESPONSABLE_INSCRIPTO = 'responsable_inscripto', 'Responsable Inscripto'
        MONOTRIBUTISTA = 'monotributista', 'Monotributista'
        CONSUMIDOR_FINAL = 'consumidor_final', 'Consumidor Final'
        EXENTO = 'exento', 'Exento'

    class EstadoCobro(models.TextChoices):
        PENDIENTE = 'pendiente', 'Pendiente'
        PAGADA = 'pagada', 'Pagada'

    emisor = models.ForeignKey(
        Emisor,
        on_delete=models.PROTECT,
        related_name='comprobantes',
        verbose_name='emisor',
    )
    tipo = models.CharField('tipo', max_length=1, choices=Tipo.choices)
    concepto = models.PositiveSmallIntegerField(
        'concepto', choices=Concepto.choices, default=Concepto.PRODUCTOS,
    )
    punto_venta = models.PositiveIntegerField('punto de venta')
    numero = models.PositiveIntegerField('numero', help_text='Numero autorizado por ARCA.')

    # Datos del receptor (cliente).
    cliente_nombre = models.CharField('cliente', max_length=160)
    cliente_doc_tipo = models.CharField(
        'tipo de documento', max_length=4, choices=DocTipo.choices, default=DocTipo.CF,
    )
    cliente_doc_numero = models.CharField('numero de documento', max_length=11, blank=True)
    cliente_condicion = models.CharField(
        'condicion del cliente',
        max_length=30,
        choices=CondicionReceptor.choices,
        default=CondicionReceptor.CONSUMIDOR_FINAL,
    )
    # Telefono/celular del cliente. Dato INTERNO (no se manda a ARCA): sirve para
    # el contacto y para ir armando la base de clientes (ver `Cliente`).
    cliente_telefono = models.CharField('telefono del cliente', max_length=30, blank=True)

    fecha = models.DateField('fecha de emision', default=timezone.localdate)
    vencimiento = models.DateField('vencimiento de pago', null=True, blank=True)

    # Importes (en pesos). El precio de los items es NETO (sin IVA); el IVA se
    # agrega en A/B segun `alicuota_iva` y en C es 0.
    alicuota_iva = models.DecimalField(
        'alicuota de IVA (%)', max_digits=5, decimal_places=2, default=Decimal('21'),
    )
    neto = models.DecimalField('neto gravado', max_digits=14, decimal_places=2, default=0)
    iva = models.DecimalField('IVA', max_digits=14, decimal_places=2, default=0)
    importe_exento = models.DecimalField('exento', max_digits=14, decimal_places=2, default=0)
    importe_no_gravado = models.DecimalField('no gravado', max_digits=14, decimal_places=2, default=0)
    total = models.DecimalField('total', max_digits=14, decimal_places=2, default=0)

    # Resultado de ARCA.
    cae = models.CharField('CAE', max_length=14, blank=True)
    cae_vencimiento = models.DateField('vencimiento del CAE', null=True, blank=True)
    qr_url = models.TextField('URL del QR', blank=True)
    respuesta_afip = models.JSONField('respuesta de ARCA', null=True, blank=True)

    estado_cobro = models.CharField(
        'estado de cobro', max_length=12, choices=EstadoCobro.choices, default=EstadoCobro.PENDIENTE,
    )
    observaciones = models.TextField('observaciones', blank=True)

    class Meta:
        db_table = 'facturacion_comprobantes'
        verbose_name = 'comprobante'
        verbose_name_plural = 'comprobantes'
        ordering = ('-fecha', '-numero', '-id')
        constraints = [
            models.UniqueConstraint(
                fields=('emisor', 'tipo', 'punto_venta', 'numero'),
                name='uniq_comprobante_numero',
            ),
        ]

    def __str__(self):
        return f'Factura {self.tipo} {self.numero_formateado}'

    @property
    def numero_formateado(self) -> str:
        """Numero con formato AFIP: 0001-00000007."""
        return f'{self.punto_venta:04d}-{self.numero:08d}'


class Cliente(ModeloBase):
    """Cliente del negocio, alimentado con los datos cargados en las facturas.

    No se cargan a mano: cada vez que se emite un comprobante se crea o actualiza
    el cliente con lo que se puso en la factura, armando una base reutilizable
    (para autocompletar la proxima factura del mismo cliente). Se identifica por
    numero de documento y, si no hay (Consumidor Final), por telefono; si no hay
    ninguno de los dos, no se registra (no habria como reconocerlo despues).

    Los campos espejan a los del receptor del comprobante.
    """

    nombre = models.CharField('nombre / razon social', max_length=160)
    doc_tipo = models.CharField(
        'tipo de documento', max_length=4,
        choices=Comprobante.DocTipo.choices, default=Comprobante.DocTipo.CF,
    )
    doc_numero = models.CharField('numero de documento', max_length=11, blank=True)
    condicion = models.CharField(
        'condicion fiscal', max_length=30,
        choices=Comprobante.CondicionReceptor.choices,
        default=Comprobante.CondicionReceptor.CONSUMIDOR_FINAL,
    )
    telefono = models.CharField('telefono', max_length=30, blank=True)

    # creado / actualizado / *_por / borrado* los aporta ModeloBase.

    class Meta:
        db_table = 'facturacion_clientes'
        verbose_name = 'cliente'
        verbose_name_plural = 'clientes'
        ordering = ('nombre',)
        constraints = [
            # Un documento identifica a un unico cliente vivo. El dedup por
            # telefono (para los sin documento) se maneja en la logica de alta,
            # porque su unicidad depende de que el documento este vacio.
            models.UniqueConstraint(
                fields=('doc_numero',),
                condition=models.Q(borrado=False) & ~models.Q(doc_numero=''),
                name='uq_cliente_doc_vivo',
            ),
        ]

    def __str__(self):
        return self.nombre


class ItemComprobante(models.Model):
    """Un renglon de un comprobante. El precio unitario es NETO (sin IVA)."""

    comprobante = models.ForeignKey(
        Comprobante,
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name='comprobante',
    )
    descripcion = models.CharField('descripcion', max_length=200)
    cantidad = models.DecimalField(
        'cantidad', max_digits=12, decimal_places=2, default=1,
        validators=[MinValueValidator(0)],
    )
    precio_unitario = models.DecimalField(
        'precio unitario (neto)', max_digits=14, decimal_places=2, default=0,
        validators=[MinValueValidator(0)],
    )

    class Meta:
        db_table = 'facturacion_items'
        verbose_name = 'item del comprobante'
        verbose_name_plural = 'items del comprobante'
        ordering = ('id',)

    def __str__(self):
        return f'{self.descripcion} x{self.cantidad}'

    @property
    def subtotal(self) -> Decimal:
        return (self.cantidad or Decimal('0')) * (self.precio_unitario or Decimal('0'))
