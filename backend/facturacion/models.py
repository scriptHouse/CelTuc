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
    # Marca INTERNA (no fiscal): distingue las cuentas de la sucursal Yerba Buena
    # de las del Centro. Solo cambia la etiqueta que muestra la app; NO afecta la
    # emision ni el tipo de comprobante (eso sale siempre de `condicion`).
    responsable_yb = models.BooleanField('responsable Yerba Buena', default=False)

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


class ConceptoFactura(ModeloBase):
    """Un texto del banco de conceptos: que dice la factura en vez del detalle.

    Cuando una factura se emite "con concepto", TODOS sus renglones se juntan en
    uno solo que dice este texto (ver ``concepto.py``). Los administradores arman
    el banco (crear, editar, desactivar) y marcan uno como ``predeterminado``: ese
    es el que aparece elegido al abrir una factura nueva. Quien factura puede
    cambiarlo por cualquier otro ACTIVO, o no usar concepto.

    NO tiene efecto fiscal: ARCA solo recibe importes, nunca el detalle de los
    renglones. Cambiar estos textos no toca ningun CAE ni ningun total.
    """

    texto = models.CharField(
        'texto',
        max_length=200,
        help_text='Lo que se lee en la factura. Maximo 200 caracteres (un renglon).',
    )
    predeterminado = models.BooleanField(
        'predeterminado',
        default=False,
        help_text='El que aparece elegido al abrir una factura nueva. Solo uno.',
    )
    orden = models.PositiveSmallIntegerField('orden', default=0)
    activo = models.BooleanField(
        'activo',
        default=True,
        help_text='Los inactivos no se pueden elegir en facturas nuevas.',
    )

    class Meta:
        db_table = 'facturacion_conceptos'
        verbose_name = 'concepto de factura'
        verbose_name_plural = 'conceptos de factura'
        ordering = ('orden', 'id')

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        # Un solo predeterminado vivo: marcar este destapa a los demas. Se hace
        # despues de guardar para que la fila nueva ya tenga pk que excluir.
        if self.predeterminado:
            ConceptoFactura.todos.filter(predeterminado=True).exclude(pk=self.pk).update(
                predeterminado=False,
            )

    @classmethod
    def por_defecto(cls):
        """El concepto que arranca elegido: el predeterminado, o el primero activo."""
        vivos = cls.objects.filter(activo=True)
        return vivos.filter(predeterminado=True).first() or vivos.first()

    def __str__(self):
        return self.texto


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
    """Un comprobante emitido con su CAE: una factura o una nota de credito.

    Las dos clases viven en esta tabla porque son el mismo documento fiscal
    (mismo CAE, mismo QR, mismos items, mismo PDF); lo que cambia es el codigo
    que se le pide a ARCA y el SIGNO: una nota de credito RESTA de lo facturado.
    Por eso hay dos campos y no uno:

    - ``clase``: factura o nota de credito.
    - ``tipo``: la letra (A, B o C), que se hereda de la factura acreditada.

    Cada combinacion lleva su propia numeracion en ARCA (una Factura B 0001-15 y
    una Nota de credito B 0001-15 son documentos distintos), por eso la clase
    entra en la unicidad del numero.

    Una vez emitido es inmutable a nivel fiscal: el CAE es la autorizacion de
    ARCA. Lo unico editable es el estado de cobro (interno, no fiscal). El
    borrado es logico (oculta de la lista) y NO anula nada en ARCA: para anular
    una factura se emite una nota de credito.
    """

    class Clase(models.TextChoices):
        FACTURA = 'factura', 'Factura'
        NOTA_CREDITO = 'nota_credito', 'Nota de crédito'

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

    class MedioPago(models.TextChoices):
        """Con que se cobro la factura. Dato INTERNO (no viaja a ARCA).

        Es el MISMO vocabulario que la venta de mostrador (`inventario.Venta.
        FormaPago`), asi el resumen mensual de facturacion (Efectivo /
        Transferencias / Tarjetas por dia) sale sin mapeos. Vacio = no se
        informo: en ese caso el resumen intenta deducirlo del cobro real de la
        venta de mostrador ligada (`ventas` -> `PagoVenta`), y si no, queda
        como "sin medio informado".
        """

        EFECTIVO = 'efectivo', 'Efectivo'
        TRANSFERENCIA = 'transferencia', 'Transferencia'
        TRANSF_FINANCIERA = 'transf_financiera', 'Transferencia financiera'
        TARJETA = 'tarjeta', 'Tarjeta'
        OTRO = 'otro', 'Otro'

    emisor = models.ForeignKey(
        Emisor,
        on_delete=models.PROTECT,
        related_name='comprobantes',
        verbose_name='emisor',
    )
    clase = models.CharField(
        'clase', max_length=20, choices=Clase.choices, default=Clase.FACTURA, db_index=True,
        help_text='Factura o nota de credito. La letra (A/B/C) va aparte, en "tipo".',
    )
    tipo = models.CharField('tipo', max_length=1, choices=Tipo.choices)
    # Que factura acredita esta nota de credito (vacio en las facturas). Es
    # PROTECT porque en la app el borrado es logico: si alguna vez se borrara de
    # verdad una factura acreditada, la base tiene que frenarlo, no dejar la nota
    # de credito colgada.
    comprobante_asociado = models.ForeignKey(
        'self', on_delete=models.PROTECT, null=True, blank=True,
        related_name='notas_credito', verbose_name='factura acreditada',
    )
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
    # Email del cliente. Tambien INTERNO: precarga el envio del PDF por mail y
    # alimenta la base de clientes.
    cliente_email = models.EmailField('email del cliente', max_length=254, blank=True)

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
    # Medio con el que se cobro. Interno y editable despues de emitir (como el
    # estado de cobro): no toca nada fiscal. Blank = no informado.
    medio_pago = models.CharField(
        'medio de cobro', max_length=20, choices=MedioPago.choices, blank=True, default='',
        help_text='Con que se cobro. Dato interno para el resumen mensual; no viaja a ARCA.',
    )
    observaciones = models.TextField('observaciones', blank=True)

    class Meta:
        db_table = 'facturacion_comprobantes'
        verbose_name = 'comprobante'
        verbose_name_plural = 'comprobantes'
        ordering = ('-fecha', '-numero', '-id')
        constraints = [
            # ARCA numera por separado cada (punto de venta, tipo de comprobante):
            # la Factura B 0001-00000015 y la Nota de credito B 0001-00000015 son
            # documentos distintos, asi que la clase entra en la unicidad.
            models.UniqueConstraint(
                fields=('emisor', 'clase', 'tipo', 'punto_venta', 'numero'),
                name='uniq_comprobante_numero',
            ),
        ]

    def __str__(self):
        return f'{self.nombre_comprobante} {self.numero_formateado}'

    @property
    def numero_formateado(self) -> str:
        """Numero con formato AFIP: 0001-00000007."""
        return f'{self.punto_venta:04d}-{self.numero:08d}'

    @property
    def es_nota_credito(self) -> bool:
        return self.clase == self.Clase.NOTA_CREDITO

    @property
    def signo(self) -> int:
        """+1 la factura suma a lo facturado; -1 la nota de credito lo resta."""
        return -1 if self.es_nota_credito else 1

    @property
    def total_firmado(self) -> Decimal:
        """El total con su signo: lo que este comprobante mueve de facturacion."""
        return (self.total or Decimal('0')) * self.signo

    @property
    def nombre_comprobante(self) -> str:
        """Como se llama el documento: 'Factura B', 'Nota de crédito B'."""
        etiqueta = 'Nota de crédito' if self.es_nota_credito else 'Factura'
        return f'{etiqueta} {self.tipo}'

    @property
    def acreditado(self) -> Decimal:
        """Cuanto de esta factura ya se acredito con notas de credito.

        Cuenta las notas OCULTAS de la lista tambien (``todos``): el borrado en
        la app es logico y no anula el CAE, asi que esa plata sigue acreditada en
        ARCA y no puede volver a acreditarse.
        """
        if self.es_nota_credito or not self.pk:
            return Decimal('0')
        agregado = Comprobante.todos.filter(comprobante_asociado_id=self.pk).aggregate(
            total=models.Sum('total'),
        )
        return agregado['total'] or Decimal('0')

    @property
    def saldo_acreditable(self) -> Decimal:
        """Cuanto queda de esta factura sin acreditar (nunca negativo)."""
        if self.es_nota_credito:
            return Decimal('0')
        return max((self.total or Decimal('0')) - self.acreditado, Decimal('0'))


def total_firmado():
    """Expresion SQL del total CON SIGNO, para sumar facturas y notas juntas.

    La usan el resumen mensual, el limite del mes y el historial del cliente: en
    todos, una nota de credito tiene que restar. Es una funcion (y no una
    constante) porque una expresion de Django no se puede reusar entre queries.
    """
    return models.Case(
        models.When(clase=Comprobante.Clase.NOTA_CREDITO, then=-models.F('total')),
        default=models.F('total'),
        output_field=models.DecimalField(max_digits=14, decimal_places=2),
    )


class Cliente(ModeloBase):
    """Cliente del negocio, alimentado con lo que se carga al vender.

    No se cargan a mano: se crea o actualiza solo con los datos del receptor de
    cada factura y con el cliente elegido en la venta de mostrador, armando una
    base reutilizable (para autocompletar la proxima operacion). Se identifica
    por numero de documento y, si no hay (Consumidor Final), por telefono y por
    email; sin ninguno de los tres no se registra (no habria como reconocerlo
    despues).

    Sus compras son de los dos tipos que el sistema guarda: las facturas
    (`Comprobante`, cruzadas por documento/telefono) y las ventas de mostrador
    (`inventario.Venta`, que apunta al cliente con una FK). Ver `clientes.py`.
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
    email = models.EmailField('email', max_length=254, blank=True)

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
