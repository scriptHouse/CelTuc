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
from inventario.models import Venta

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
    """Una caja fisica del local ('Principal', 'Mostrador', 'Service'...)."""

    nombre = models.CharField('nombre', max_length=120)
    orden = models.PositiveSmallIntegerField('orden', default=0)
    activa = models.BooleanField('activa', default=True)

    class Meta:
        db_table = 'caja_cajas'
        verbose_name = 'caja'
        verbose_name_plural = 'cajas'
        ordering = ('orden', 'nombre')
        constraints = [
            models.UniqueConstraint(
                fields=('nombre',),
                condition=models.Q(borrado=False),
                name='uq_caja_viva',
            ),
        ]

    def __str__(self):
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


def abrir_caja(caja, *, fondo_inicial, conteo_apertura=None, nota_apertura='', usuario=None):
    """Abre el turno de una caja declarando el fondo. Una sola sesion abierta por caja."""
    fondo = Decimal(str(fondo_inicial))
    if fondo < 0:
        raise ValidationError('El fondo inicial no puede ser negativo.')
    if not caja.activa:
        raise ValidationError('Esa caja esta desactivada.')
    with transaction.atomic():
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
                         usuario=None, venta=None):
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
            creado_por=usuario,
            actualizado_por=usuario,
        )


def registrar_venta_en_caja(venta, *, caja=None, usuario=None):
    """Engancha una venta de mostrador al turno abierto (mejor esfuerzo).

    Busca la sesion abierta de la `caja` indicada; sin caja, usa la unica sesion
    abierta si hay exactamente una. Si no hay turno donde anotarla devuelve None
    (la venta vale igual: el descuento de stock ya ocurrio en inventario).
    """
    if venta.total is None or venta.total <= 0:
        return None
    sesion = None
    if caja is not None:
        sesion = SesionCaja.objects.filter(caja=caja, estado=SesionCaja.Estado.ABIERTA).first()
    if sesion is None:
        abiertas = list(SesionCaja.objects.filter(estado=SesionCaja.Estado.ABIERTA)[:2])
        if len(abiertas) == 1:
            sesion = abiertas[0]
    if sesion is None:
        return None

    items = list(venta.items.select_related('producto')[:4])
    detalle = ', '.join(f'{i.cantidad}x {i.producto.nombre}' for i in items)[:200]
    return registrar_movimiento(
        sesion,
        tipo=MovimientoCaja.Tipo.VENTA,
        medio=venta.forma_pago,
        monto=venta.total,
        motivo=f'Venta #{venta.pk}',
        detalle=detalle,
        usuario=usuario,
        venta=venta,
    )


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
