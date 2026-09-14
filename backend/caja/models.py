"""Caja: turnos con fondo declarado, movimientos con motivo y cierre con arqueo.

Modelo tomado de los POS de referencia (Square, Shopify, Lightspeed, Odoo, Fudo):
la SESION de caja es la entidad central — se abre declarando el fondo, acumula
movimientos (las ventas de mostrador entran solas desde `inventario`) y se
cierra con un arqueo que queda inmutable como comprobante Z numerado.

Los medios de pago son LOS MISMOS que la venta de mostrador (`Venta.FormaPago`):
asi una venta cae en el arqueo sin mapeos raros.
"""
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import models, transaction

from comun.models import ModeloBase
from inventario.models import Sucursal, Venta

# Un solo vocabulario de medios para ventas y arqueo.
MedioPago = Venta.FormaPago


def _denominaciones_default():
    """Billetes ARS que muestra la grilla de arqueo (los chicos van por Sueltos)."""
    return [20000, 10000, 2000, 1000, 500, 200, 100]


def _dict_medios(valor=0.0):
    return {medio: valor for medio in MedioPago.values}


class ConfiguracionCaja(ModeloBase):
    """Preferencias del modulo (singleton): cada funcion pro se prende o apaga."""

    cierre_ciego = models.BooleanField(
        'cierre ciego', default=True,
        help_text='Quien cuenta no ve el esperado del efectivo; se revela al confirmar.',
    )
    tolerancia_activa = models.BooleanField('tolerancia activa', default=True)
    tolerancia_monto = models.DecimalField(
        'tolerancia ($)', max_digits=12, decimal_places=2, default=Decimal('2000'),
        help_text='Si la diferencia supera este monto, el cierre exige motivo y nota.',
    )
    retiros_habilitados = models.BooleanField('retiros a boveda', default=True)
    multi_caja = models.BooleanField(
        'multi-caja', default=False,
        help_text='Varias cajas nombradas, cada una con su turno y su arqueo.',
    )
    exigir_lote = models.BooleanField(
        'exigir cierre de lote', default=True,
        help_text='Si hubo ventas con tarjeta, el pre-cierre pide confirmar el lote.',
    )
    fondo_sugerido = models.DecimalField(
        'fondo sugerido ($)', max_digits=12, decimal_places=2, default=Decimal('10000'),
    )
    denominaciones = models.JSONField('denominaciones', default=_denominaciones_default)
    # Apagado (como siempre): las cajas son del negocio entero y reciben las
    # ventas de todas las sucursales. Prendido: cada sucursal que tiene caja
    # cierra la suya; las de una sucursal sin caja no entran a ningun arqueo.
    # Se cambia con `configurar_por_sucursal`, nunca a mano (valida turnos).
    por_sucursal = models.BooleanField(
        'caja por sucursal', default=False,
        help_text='Cada sucursal cierra su propia caja (con sus dos cajas fiscales).',
    )

    class Meta:
        db_table = 'caja_configuracion'
        verbose_name = 'configuracion de caja'
        verbose_name_plural = 'configuracion de caja'

    def __str__(self):
        return 'Configuracion de caja'

    @classmethod
    def instancia(cls):
        """La unica fila de configuracion (se crea sola con los defaults)."""
        config, _ = cls.objects.get_or_create(pk=1)
        return config


class Caja(ModeloBase):
    """Una caja fisica del local ('Principal', 'Mostrador', 'Service'...).

    El ``canal`` separa la plata por regimen fiscal: lo facturado con el
    Responsable Inscripto (Factura A/B) va a su caja, y lo demas (Factura C
    de monotributo o sin factura) a la general. Las ventas de mostrador se
    enrutan solas segun como se facturan; una caja sin canal no participa
    del enrutamiento (comportamiento historico: se elige a mano).
    """

    class Canal(models.TextChoices):
        FACTURA_RI = 'factura_ri', 'Facturado RI (Factura A/B)'
        GENERAL = 'general', 'Monotributo y sin factura'

    nombre = models.CharField('nombre', max_length=120)
    canal = models.CharField(
        'canal fiscal', max_length=20, choices=Canal.choices, blank=True, default='',
        help_text='Que ventas entran solas a esta caja segun como se facturan.',
    )
    # De que sucursal es el cajon. Vacia = caja COMPARTIDA por todo el negocio
    # (como fueron siempre). Con la caja por sucursal prendida, solo las cajas
    # de la sucursal de la venta la reciben. No se cambia despues de creada:
    # sus turnos y cierres son de esa sucursal.
    sucursal = models.ForeignKey(
        Sucursal, on_delete=models.PROTECT, null=True, blank=True,
        related_name='cajas', verbose_name='sucursal',
    )
    orden = models.PositiveSmallIntegerField('orden', default=0)
    activa = models.BooleanField('activa', default=True)

    class Meta:
        db_table = 'caja_cajas'
        verbose_name = 'caja'
        verbose_name_plural = 'cajas'
        ordering = ('orden', 'nombre')
        # Los nombres y los canales son unicos DENTRO de su ambito: entre las
        # compartidas, o entre las cajas de una misma sucursal (asi Solar y
        # Salta pueden tener cada una su «Facturación RI»). Van de a pares
        # porque en SQL dos NULL no chocan en un indice unico.
        constraints = [
            models.UniqueConstraint(
                fields=('nombre',),
                condition=models.Q(borrado=False, sucursal__isnull=True),
                name='uq_caja_viva',
            ),
            models.UniqueConstraint(
                fields=('sucursal', 'nombre'),
                condition=models.Q(borrado=False, sucursal__isnull=False),
                name='uq_caja_viva_sucursal',
            ),
            # Un solo cajon por canal fiscal en cada ambito: si hubiera dos,
            # el enrutamiento de ventas seria ambiguo.
            models.UniqueConstraint(
                fields=('canal',),
                condition=(
                    models.Q(borrado=False, sucursal__isnull=True) & ~models.Q(canal='')
                ),
                name='uq_canal_caja_viva',
            ),
            models.UniqueConstraint(
                fields=('sucursal', 'canal'),
                condition=(
                    models.Q(borrado=False, sucursal__isnull=False) & ~models.Q(canal='')
                ),
                name='uq_canal_caja_viva_sucursal',
            ),
        ]

    def __str__(self):
        if self.sucursal_id:
            return f'{self.nombre} · {self.sucursal}'
        return self.nombre


class SesionCaja(ModeloBase):
    """Un turno de caja: se abre con fondo declarado y se cierra con arqueo.

    La apertura queda en la auditoria de `ModeloBase`: `creado` es la hora de
    apertura y `creado_por` quien abrio.
    """

    class Estado(models.TextChoices):
        ABIERTA = 'abierta', 'Abierta'
        CERRADA = 'cerrada', 'Cerrada'

    caja = models.ForeignKey(
        Caja, on_delete=models.PROTECT, related_name='sesiones', verbose_name='caja',
    )
    numero = models.PositiveIntegerField('numero de turno')
    estado = models.CharField(
        'estado', max_length=10, choices=Estado.choices, default=Estado.ABIERTA,
    )
    fondo_inicial = models.DecimalField('fondo inicial ($)', max_digits=12, decimal_places=2)
    conteo_apertura = models.JSONField(
        'conteo de apertura', null=True, blank=True,
        help_text='Desglose de billetes del fondo, si se conto al abrir.',
    )
    nota_apertura = models.CharField('nota de apertura', max_length=200, blank=True)

    class Meta:
        db_table = 'caja_sesiones'
        verbose_name = 'turno de caja'
        verbose_name_plural = 'turnos de caja'
        ordering = ('-creado', '-id')
        constraints = [
            models.UniqueConstraint(
                fields=('caja',),
                condition=models.Q(estado='abierta', borrado=False),
                name='uq_sesion_abierta_por_caja',
            ),
        ]

    def __str__(self):
        return f'Turno #{self.numero} · {self.caja} ({self.get_estado_display()})'


class MovimientoCaja(ModeloBase):
    """Todo lo que mueve plata en un turno (las ventas tambien son movimientos).

    `monto` es siempre positivo: el signo lo da el tipo. Los ingresos, egresos
    y retiros son siempre en efectivo; las ventas llevan su medio de pago.
    """

    class Tipo(models.TextChoices):
        VENTA = 'venta', 'Venta'
        INGRESO = 'ingreso', 'Ingreso'
        EGRESO = 'egreso', 'Egreso'
        RETIRO = 'retiro', 'Retiro a boveda'

    sesion = models.ForeignKey(
        SesionCaja, on_delete=models.CASCADE, related_name='movimientos', verbose_name='turno',
    )
    tipo = models.CharField('tipo', max_length=10, choices=Tipo.choices)
    medio = models.CharField(
        'medio de pago', max_length=20, choices=MedioPago.choices, default=MedioPago.EFECTIVO,
    )
    monto = models.DecimalField('monto ($)', max_digits=14, decimal_places=2)
    motivo = models.CharField('motivo', max_length=200)
    detalle = models.CharField('detalle', max_length=200, blank=True)
    venta = models.ForeignKey(
        Venta, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='movimientos_caja', verbose_name='venta',
        help_text='La venta de mostrador que genero este movimiento, si aplica.',
    )
    # Que PARTE del cobro de esa venta es este movimiento. Una venta cobrada
    # mitad facturada y mitad no genera un movimiento por parte, cada uno en su
    # caja: guardar el pago exacto permite saber como se facturo ESTA plata
    # (el ticket Z agrupa por ahi) aunque la venta tenga varias facturaciones.
    pago = models.ForeignKey(
        'inventario.PagoVenta', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='movimientos_caja', verbose_name='parte del cobro',
    )

    class Meta:
        db_table = 'caja_movimientos'
        verbose_name = 'movimiento de caja'
        verbose_name_plural = 'movimientos de caja'
        ordering = ('creado', 'id')

    def __str__(self):
        return f'{self.get_tipo_display()} ${self.monto} · {self.motivo}'


class CierreCaja(ModeloBase):
    """Comprobante Z: el cierre inmutable de un turno, con el arqueo completo.

    `creado` es la hora de cierre y `creado_por` quien cerro. Los diccionarios
    por medio usan las claves de `MedioPago` con valores numericos.
    """

    numero = models.PositiveIntegerField('numero Z', unique=True)
    sesion = models.OneToOneField(
        SesionCaja, on_delete=models.PROTECT, related_name='cierre', verbose_name='turno',
    )
    caja_nombre = models.CharField('caja (al cierre)', max_length=120)
    # Foto de la sucursal de la caja al cerrar (vacia = caja compartida).
    sucursal_nombre = models.CharField('sucursal (al cierre)', max_length=120, blank=True)

    ventas_por_medio = models.JSONField('ventas por medio', default=_dict_medios)
    operaciones_por_medio = models.JSONField('operaciones por medio', default=_dict_medios)
    ingresos = models.DecimalField('ingresos ($)', max_digits=14, decimal_places=2, default=0)
    egresos = models.DecimalField('egresos ($)', max_digits=14, decimal_places=2, default=0)
    retiros = models.DecimalField('retiros ($)', max_digits=14, decimal_places=2, default=0)

    esperado_por_medio = models.JSONField('esperado por medio', default=_dict_medios)
    contado_por_medio = models.JSONField('contado por medio', default=_dict_medios)
    conteo_cierre = models.JSONField('conteo de billetes', null=True, blank=True)
    diferencia_por_medio = models.JSONField('diferencia por medio', default=_dict_medios)
    diferencia_total = models.DecimalField(
        'diferencia total ($)', max_digits=14, decimal_places=2, default=0,
        help_text='Positivo = sobrante, negativo = faltante.',
    )
    motivo_diferencia = models.CharField('motivo de la diferencia', max_length=120, blank=True)
    nota_diferencia = models.CharField('nota de la diferencia', max_length=500, blank=True)

    cierre_ciego = models.BooleanField('arqueo en modo ciego', default=False)
    fondo_siguiente = models.DecimalField(
        'fondo que queda ($)', max_digits=12, decimal_places=2, default=0,
    )
    retiro_final = models.DecimalField(
        'retirado al cerrar ($)', max_digits=14, decimal_places=2, default=0,
    )

    class Meta:
        db_table = 'caja_cierres'
        verbose_name = 'cierre de caja (Z)'
        verbose_name_plural = 'cierres de caja (Z)'
        ordering = ('-numero',)

    def __str__(self):
        return f'Z-{self.numero:04d} · {self.caja_nombre}'


# ===== Operaciones =====

def resumen_sesion(sesion):
    """Ventas/operaciones/esperado por medio + totales del turno (en Decimal).

    Efectivo esperado = fondo + ventas en efectivo + ingresos - egresos - retiros;
    el resto de los medios esperan exactamente sus ventas.
    """
    ventas = {medio: Decimal('0') for medio in MedioPago.values}
    operaciones = {medio: 0 for medio in MedioPago.values}
    ingresos = egresos = retiros = Decimal('0')

    for mov in sesion.movimientos.all():
        if mov.tipo == MovimientoCaja.Tipo.VENTA:
            ventas[mov.medio] += mov.monto
            operaciones[mov.medio] += 1
        elif mov.tipo == MovimientoCaja.Tipo.INGRESO:
            ingresos += mov.monto
        elif mov.tipo == MovimientoCaja.Tipo.EGRESO:
            egresos += mov.monto
        elif mov.tipo == MovimientoCaja.Tipo.RETIRO:
            retiros += mov.monto

    esperado = dict(ventas)
    esperado[MedioPago.EFECTIVO] = (
        sesion.fondo_inicial + ventas[MedioPago.EFECTIVO] + ingresos - egresos - retiros
    )
    return {
        'ventas_por_medio': ventas,
        'operaciones_por_medio': operaciones,
        'ingresos': ingresos,
        'egresos': egresos,
        'retiros': retiros,
        'esperado_por_medio': esperado,
    }


def _config_bloqueada():
    """La configuracion con lock de fila (dentro de una transaccion).

    Todo lo que depende del modo (abrir un turno, cambiar el modo, dar o quitar
    la caja de una sucursal) toma PRIMERO este lock y despues el de las cajas:
    asi dos operaciones cruzadas no se bloquean mutuamente, y un turno no puede
    abrirse justo mientras se cambia el modo.
    """
    config = ConfiguracionCaja.instancia()
    return ConfiguracionCaja.objects.select_for_update().get(pk=config.pk)


def abrir_caja(caja, *, fondo_inicial, conteo_apertura=None, nota_apertura='', usuario=None):
    """Abre el turno de una caja declarando el fondo. Una sola sesion abierta por caja."""
    fondo = Decimal(str(fondo_inicial))
    if fondo < 0:
        raise ValidationError('El fondo inicial no puede ser negativo.')
    if not caja.activa:
        raise ValidationError('Esa caja esta desactivada.')
    with transaction.atomic():
        config = _config_bloqueada()
        # Solo se abren las cajas del modo vigente: una caja que no recibe
        # ventas tendria un arqueo que nunca cuadra con lo vendido.
        if config.por_sucursal and caja.sucursal_id is None:
            raise ValidationError(
                'Cada sucursal tiene su propia caja: las cajas compartidas de antes ya no '
                'se abren. Abri la caja de tu sucursal.'
            )
        if not config.por_sucursal and caja.sucursal_id is not None:
            raise ValidationError(
                'Esa caja es de una sucursal y la caja por sucursal esta apagada: '
                'se trabaja con las cajas compartidas.'
            )
        # Serializa aperturas concurrentes sobre la misma caja.
        Caja.objects.select_for_update().get(pk=caja.pk)
        if SesionCaja.objects.filter(caja=caja, estado=SesionCaja.Estado.ABIERTA).exists():
            raise ValidationError('Esa caja ya tiene un turno abierto.')
        numero = (SesionCaja.todos.aggregate(models.Max('numero'))['numero__max'] or 0) + 1
        return SesionCaja.objects.create(
            caja=caja,
            numero=numero,
            fondo_inicial=fondo,
            conteo_apertura=conteo_apertura or None,
            nota_apertura=(nota_apertura or '').strip(),
            creado_por=usuario,
            actualizado_por=usuario,
        )


def registrar_movimiento(sesion, *, tipo, medio='', monto, motivo, detalle='',
                         usuario=None, venta=None, pago=None):
    """Registra un movimiento en un turno abierto, con las guardas del arqueo."""
    monto = Decimal(str(monto))
    if monto <= 0:
        raise ValidationError('El monto tiene que ser mayor a cero.')
    if not (motivo or '').strip():
        raise ValidationError('El motivo es obligatorio.')

    config = ConfiguracionCaja.instancia()
    if tipo == MovimientoCaja.Tipo.RETIRO and not config.retiros_habilitados:
        raise ValidationError('Los retiros a boveda estan deshabilitados en la configuracion.')

    # Ingresos/egresos/retiros son siempre de efectivo.
    if tipo != MovimientoCaja.Tipo.VENTA:
        medio = MedioPago.EFECTIVO

    with transaction.atomic():
        # Estado FRESCO y con lock: un cierre concurrente no puede colarse entre
        # la verificacion y el alta del movimiento.
        sesion = SesionCaja.objects.select_for_update().get(pk=sesion.pk)
        if sesion.estado != SesionCaja.Estado.ABIERTA:
            raise ValidationError('El turno ya no esta abierto.')

        # Un egreso/retiro no puede sacar mas efectivo del que hay en el cajon.
        if tipo in (MovimientoCaja.Tipo.EGRESO, MovimientoCaja.Tipo.RETIRO):
            disponible = resumen_sesion(sesion)['esperado_por_medio'][MedioPago.EFECTIVO]
            if monto > disponible:
                raise ValidationError(
                    f'No hay suficiente efectivo en caja: hay ${disponible} y el movimiento saca ${monto}.'
                )

        return MovimientoCaja.objects.create(
            sesion=sesion,
            tipo=tipo,
            medio=medio,
            monto=monto,
            motivo=motivo.strip(),
            detalle=(detalle or '').strip(),
            venta=venta,
            pago=pago,
            creado_por=usuario,
            actualizado_por=usuario,
        )


# Que canal de caja recibe cada forma de facturar la venta: lo del RI a su
# caja; la Factura C del monotributo y lo sin facturar, juntos en la general.
CANAL_POR_FACTURACION = {
    Venta.Facturacion.FACTURA_RI: Caja.Canal.FACTURA_RI,
    Venta.Facturacion.FACTURA_C: Caja.Canal.GENERAL,
    Venta.Facturacion.SIN_FACTURA: Caja.Canal.GENERAL,
}


def cajas_del_ambito(sucursal=None, *, config=None):
    """Las cajas (vivas, activas o no) que atienden las ventas de una sucursal.

    Con la caja por sucursal apagada son las COMPARTIDAS (sin sucursal), sin
    importar de que sucursal sea la venta: el comportamiento de siempre. Con el
    modo prendido son solo las de esa sucursal (ninguna, si no tiene caja).
    """
    config = config or ConfiguracionCaja.instancia()
    if not config.por_sucursal:
        return Caja.objects.filter(sucursal__isnull=True)
    if sucursal is None:
        return Caja.objects.none()
    return Caja.objects.filter(sucursal=sucursal)


def caja_para_facturacion(facturacion, sucursal=None):
    """La caja del canal fiscal indicado, si el ambito tiene cajas con canal."""
    canal = CANAL_POR_FACTURACION.get(facturacion)
    if not canal:
        return None
    return cajas_del_ambito(sucursal).filter(canal=canal, activa=True).first()


def caja_para_venta(venta):
    """La caja del canal fiscal de la venta (su facturacion principal)."""
    return caja_para_facturacion(venta.facturacion, venta.sucursal)


def registrar_venta_en_caja(venta, *, caja=None, usuario=None):
    """Engancha una venta de mostrador al turno abierto que corresponde.

    Devuelve `(movimientos, avisos)`: un movimiento POR PARTE del cobro (una
    venta cobrada mitad en efectivo y mitad por transferencia genera dos), todos
    apuntando a la misma venta, para que el conteo por medio del arqueo siga
    cerrando. `avisos` son los mensajes de las partes que NO pudieron anotarse.

    Cada parte va a la caja de SU facturacion: lo facturado con el RI a su caja
    y lo de monotributo o sin factura a la general. Asi una venta con una parte
    facturada y otra no se reparte entre las dos cajas sin dejar de ser una sola
    venta. Si la caja de una parte esta cerrada, esa parte no entra y se avisa
    (las otras si); si NINGUNA parte pudo anotarse se lanza ValidationError, en
    vez de mezclar la plata en el cajon equivocado. Sin cajas con canal vale el
    comportamiento historico: la `caja` indicada o la unica sesion abierta. La
    venta vale igual en todos los casos (el stock ya se desconto).

    Con la caja por sucursal prendida todo lo anterior pasa DENTRO de las cajas
    de la sucursal de la venta: la plata de Salta nunca cae en un cajon de
    Solar. Si la sucursal no tiene caja, la venta no se anota y se avisa.
    """
    if venta.total is None or venta.total <= 0:
        return [], []

    config = ConfiguracionCaja.instancia()
    ambito = cajas_del_ambito(venta.sucursal, config=config)
    if config.por_sucursal and not ambito.filter(activa=True).exists():
        return [], [
            f'La sucursal "{venta.sucursal.nombre}" no tiene caja: '
            'la venta no entra en ningun arqueo.'
        ]

    items = list(venta.items.select_related('producto')[:4])
    # `detalle` del item sirve para las tres clases de renglon (mercaderia,
    # service e item libre); los services no tienen producto asociado.
    detalle = ', '.join(f'{i.cantidad}x {i.detalle}' for i in items)

    # Una parte por medio y facturacion. Las ventas viejas (sin filas de pago)
    # se anotan enteras con sus valores principales, exactamente como antes.
    partes = [
        (pago, pago.medio, pago.facturacion, pago.monto)
        for pago in venta.pagos.all()
        if pago.monto > 0
    ]
    if not partes:
        partes = [(None, venta.forma_pago, venta.facturacion, venta.total)]

    # La sesion de respaldo (sin cajas con canal fiscal): la indicada o la unica
    # abierta, siempre dentro del ambito. Se calcula una sola vez para todas las
    # partes.
    def _sesion_de_respaldo():
        sesion = None
        abiertas_del_ambito = SesionCaja.objects.filter(
            estado=SesionCaja.Estado.ABIERTA, caja__in=ambito,
        )
        if caja is not None:
            sesion = abiertas_del_ambito.filter(caja=caja).first()
        if sesion is None:
            abiertas = list(abiertas_del_ambito[:2])
            if len(abiertas) == 1:
                sesion = abiertas[0]
        return sesion

    movimientos = []
    avisos = []
    for indice, (pago, medio, facturacion, monto) in enumerate(partes, start=1):
        canal = CANAL_POR_FACTURACION.get(facturacion)
        caja_canal = ambito.filter(canal=canal, activa=True).first() if canal else None
        if caja_canal is not None:
            sesion = SesionCaja.objects.filter(
                caja=caja_canal, estado=SesionCaja.Estado.ABIERTA,
            ).first()
            if sesion is None:
                # `str` suma la sucursal («Facturación RI · Salta»); en una caja
                # compartida es solo el nombre, como siempre.
                avisos.append(
                    f'La caja "{caja_canal}" no tiene turno abierto: '
                    'abrila para que esta venta entre a su arqueo.'
                )
                continue
        else:
            sesion = _sesion_de_respaldo()
            if sesion is None:
                continue

        prefijo = f'Pago {indice} de {len(partes)} · ' if len(partes) > 1 else ''
        movimientos.append(
            registrar_movimiento(
                sesion,
                tipo=MovimientoCaja.Tipo.VENTA,
                medio=medio,
                monto=monto,
                motivo=f'Venta #{venta.pk}',
                detalle=(prefijo + detalle)[:200],
                usuario=usuario,
                venta=venta,
                pago=pago,
            )
        )

    # Ninguna parte entro y hay cajas de canal cerradas: se corta con el mismo
    # error de siempre (nada se anota en la caja equivocada).
    if not movimientos and avisos:
        raise ValidationError(' '.join(dict.fromkeys(avisos)))
    return movimientos, list(dict.fromkeys(avisos))


def eliminar_movimiento(movimiento, *, usuario=None):
    """Borra (logico) un movimiento manual de un turno abierto."""
    # Estado FRESCO desde la base (el objeto en memoria puede estar viejo).
    estado = (
        SesionCaja.todos.filter(pk=movimiento.sesion_id)
        .values_list('estado', flat=True)
        .first()
    )
    if estado != SesionCaja.Estado.ABIERTA:
        raise ValidationError('Los movimientos de un turno cerrado son inmutables.')
    if movimiento.venta_id is not None:
        raise ValidationError(
            'Este movimiento viene de una venta de mostrador: no se elimina desde Caja.'
        )
    movimiento.delete(usuario=usuario)


def cerrar_caja(sesion, *, contado_por_medio, conteo_cierre=None, fondo_siguiente,
                motivo_diferencia='', nota_diferencia='', usuario=None):
    """Cierra el turno: calcula la diferencia por medio y emite el comprobante Z.

    El fondo que queda no puede superar el efectivo contado (lo que se deja en
    el cajon es fisico); el excedente es el retiro final a boveda/deposito.
    """
    fondo_siguiente = Decimal(str(fondo_siguiente))
    if fondo_siguiente < 0:
        raise ValidationError('El fondo siguiente no puede ser negativo.')

    with transaction.atomic():
        sesion = SesionCaja.objects.select_for_update().get(pk=sesion.pk)
        if sesion.estado != SesionCaja.Estado.ABIERTA:
            raise ValidationError('El turno ya no esta abierto.')

        resumen = resumen_sesion(sesion)
        contado = {
            medio: Decimal(str(contado_por_medio.get(medio, 0) or 0))
            for medio in MedioPago.values
        }
        diferencia = {
            medio: contado[medio] - resumen['esperado_por_medio'][medio]
            for medio in MedioPago.values
        }
        diferencia_total = sum(diferencia.values(), Decimal('0'))

        config = ConfiguracionCaja.instancia()
        if (
            config.tolerancia_activa
            and abs(diferencia_total) > config.tolerancia_monto
            and not ((motivo_diferencia or '').strip() and (nota_diferencia or '').strip())
        ):
            raise ValidationError(
                f'La diferencia supera la tolerancia de ${config.tolerancia_monto}: '
                'indica motivo y nota (o reconta).'
            )

        contado_efectivo = contado[MedioPago.EFECTIVO]
        fondo_siguiente = min(fondo_siguiente, contado_efectivo)

        numero = (CierreCaja.todos.aggregate(models.Max('numero'))['numero__max'] or 0) + 1
        cierre = CierreCaja.objects.create(
            numero=numero,
            sesion=sesion,
            caja_nombre=sesion.caja.nombre,
            sucursal_nombre=sesion.caja.sucursal.nombre if sesion.caja.sucursal_id else '',
            ventas_por_medio={m: float(v) for m, v in resumen['ventas_por_medio'].items()},
            operaciones_por_medio=resumen['operaciones_por_medio'],
            ingresos=resumen['ingresos'],
            egresos=resumen['egresos'],
            retiros=resumen['retiros'],
            esperado_por_medio={m: float(v) for m, v in resumen['esperado_por_medio'].items()},
            contado_por_medio={m: float(v) for m, v in contado.items()},
            conteo_cierre=conteo_cierre or None,
            diferencia_por_medio={m: float(v) for m, v in diferencia.items()},
            diferencia_total=diferencia_total,
            motivo_diferencia=(motivo_diferencia or '').strip(),
            nota_diferencia=(nota_diferencia or '').strip(),
            cierre_ciego=config.cierre_ciego,
            fondo_siguiente=fondo_siguiente,
            retiro_final=max(Decimal('0'), contado_efectivo - fondo_siguiente),
            creado_por=usuario,
            actualizado_por=usuario,
        )
        sesion.estado = SesionCaja.Estado.CERRADA
        sesion.actualizado_por = usuario
        sesion.save(update_fields=['estado', 'actualizado_por'])
        return cierre


# ===== Caja por sucursal =====

# Las dos cajas que recibe cada sucursal con caja (mismos nombres y orden que
# las compartidas sembradas en la migracion 0004).
CAJAS_FISCALES = (
    (Caja.Canal.FACTURA_RI, 'Facturación RI', 0),
    (Caja.Canal.GENERAL, 'Monotributo y sin factura', 1),
)


def _nombres_de_turnos(sesiones):
    return ', '.join(f'«{s.caja}»' for s in sesiones)


def _nombre_libre(sucursal, nombre):
    """`nombre`, o con un numero al final si esa sucursal ya tiene una caja asi."""
    candidato, n = nombre, 2
    while Caja.objects.filter(sucursal=sucursal, nombre__iexact=candidato).exists():
        candidato, n = f'{nombre} {n}', n + 1
    return candidato


def _habilitar(sucursal, usuario):
    """Deja activas las dos cajas fiscales de la sucursal (las crea si faltan)."""
    for canal, nombre, orden in CAJAS_FISCALES:
        caja = Caja.objects.select_for_update().filter(sucursal=sucursal, canal=canal).first()
        if caja is None:
            Caja.objects.create(
                sucursal=sucursal,
                canal=canal,
                nombre=_nombre_libre(sucursal, nombre),
                orden=orden,
                activa=True,
                creado_por=usuario,
                actualizado_por=usuario,
            )
        elif not caja.activa:
            caja.activa = True
            caja.actualizado_por = usuario
            caja.save(update_fields=['activa', 'actualizado_por'])


def _deshabilitar(sucursal, usuario):
    """Desactiva las cajas de la sucursal (nunca las borra: tienen historial)."""
    cajas = list(Caja.objects.select_for_update().filter(sucursal=sucursal, activa=True))
    abiertas = list(
        SesionCaja.objects.filter(caja__in=cajas, estado=SesionCaja.Estado.ABIERTA)
        .select_related('caja', 'caja__sucursal')
    )
    if abiertas:
        raise ValidationError(
            f'«{sucursal.nombre}» tiene turnos abiertos ({_nombres_de_turnos(abiertas)}): '
            'cerralos antes de quitarle la caja.'
        )
    for caja in cajas:
        caja.activa = False
        caja.actualizado_por = usuario
        caja.save(update_fields=['activa', 'actualizado_por'])


def sucursal_tiene_caja(sucursal):
    """Una sucursal tiene caja si le queda al menos una caja activa."""
    return Caja.objects.filter(sucursal=sucursal, activa=True).exists()


def habilitar_caja_sucursal(sucursal, *, usuario=None):
    """Le da caja a una sucursal: sus dos cajas fiscales, nuevas o reactivadas."""
    if not sucursal.activa:
        raise ValidationError('Esa sucursal esta desactivada.')
    with transaction.atomic():
        _config_bloqueada()
        _habilitar(sucursal, usuario)


def deshabilitar_caja_sucursal(sucursal, *, usuario=None):
    """Le quita la caja a una sucursal (sin turnos abiertos): sus ventas dejan de
    entrar a un arqueo. Las cajas quedan desactivadas con todo su historial."""
    with transaction.atomic():
        _config_bloqueada()
        _deshabilitar(sucursal, usuario)


def configurar_por_sucursal(*, activar, sucursales=None, usuario=None):
    """Prende o apaga la caja por sucursal. Devuelve la configuracion.

    El cambio de modo exige que no quede ningun turno abierto en las cajas del
    modo que se deja: un turno siempre empieza y termina con las mismas reglas,
    asi su arqueo cuadra con lo que vendio.

    Al prender, `sucursales` (si viene) dice cuales tienen caja: esas quedan con
    sus dos cajas fiscales y las demas sin caja. Sin lista, si ninguna sucursal
    tiene caja todavia, se les da a todas las activas (despues se apaga la que
    no corresponda). Al apagar, las cajas de las sucursales quedan como estan
    (en pausa) y las ventas vuelven a las compartidas; si no queda ninguna
    compartida activa, se reactivan (o se crean) las dos fiscales.
    """
    with transaction.atomic():
        config = _config_bloqueada()
        if activar:
            abiertas = list(
                SesionCaja.objects.filter(
                    estado=SesionCaja.Estado.ABIERTA, caja__sucursal__isnull=True,
                ).select_related('caja')
            )
            if abiertas:
                raise ValidationError(
                    'Antes de separar las cajas por sucursal, cerra los turnos abiertos de '
                    f'{_nombres_de_turnos(abiertas)}.'
                )
            if sucursales is not None:
                elegidas = {s.pk for s in sucursales}
                for sucursal in Sucursal.objects.filter(pk__in=elegidas, activa=True):
                    _habilitar(sucursal, usuario)
                otras = Sucursal.objects.filter(cajas__activa=True, cajas__borrado=False)
                for sucursal in otras.exclude(pk__in=elegidas).distinct():
                    _deshabilitar(sucursal, usuario)
            elif not Caja.objects.filter(sucursal__isnull=False, activa=True).exists():
                for sucursal in Sucursal.objects.filter(activa=True):
                    _habilitar(sucursal, usuario)
        else:
            abiertas = list(
                SesionCaja.objects.filter(
                    estado=SesionCaja.Estado.ABIERTA, caja__sucursal__isnull=False,
                ).select_related('caja', 'caja__sucursal')
            )
            if abiertas:
                raise ValidationError(
                    'Antes de volver a las cajas compartidas, cerra los turnos abiertos de '
                    f'{_nombres_de_turnos(abiertas)}.'
                )
            if not Caja.objects.filter(sucursal__isnull=True, activa=True).exists():
                _habilitar(None, usuario)

        if config.por_sucursal != activar:
            config.por_sucursal = activar
            config.actualizado_por = usuario
            config.save(update_fields=['por_sucursal', 'actualizado_por'])
        return config
