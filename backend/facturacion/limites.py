"""Limite de facturacion mensual por emisor (control interno, sin tocar ARCA).

El tope se configura por mes calendario (del 1 al ultimo dia) en
:class:`~facturacion.models.LimiteMensual`. Antes de emitir, la vista llama a
:func:`verificar_limite_mensual`: si la factura nueva hace superar el tope del
mes, devuelve los datos del aviso y la API responde 409 para que el front pida
confirmacion. Nada de esto corre dentro de ``arca/`` ni afecta la emision.
"""
from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone

from . import logica
from .models import Comprobante, Emisor, LimiteMensual

MESES = (
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
    'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
)


def nombre_mes(mes: int) -> str:
    return MESES[mes - 1] if 1 <= mes <= 12 else str(mes)


def facturado_del_mes(emisor: Emisor, anio: int, mes: int) -> Decimal:
    """Total emitido por el emisor en ese mes calendario.

    Usa ``Comprobante.todos`` (incluye los ocultados de la lista): el borrado en
    la app es logico y NO anula el comprobante en ARCA, asi que fiscalmente ese
    monto se facturo igual y cuenta para el tope.
    """
    agg = Comprobante.todos.filter(
        emisor=emisor, fecha__year=anio, fecha__month=mes,
    ).aggregate(total=Sum('total'))
    return agg['total'] or Decimal('0')


def estado_limites_del_anio(emisor: Emisor, anio: int) -> list[dict]:
    """Los 12 meses del año con su tope (o None) y lo ya facturado."""
    topes = {
        limite.mes: limite.monto
        for limite in LimiteMensual.objects.filter(emisor=emisor, anio=anio)
    }
    facturado_por_mes = {mes: Decimal('0') for mes in range(1, 13)}
    filas = (
        Comprobante.todos.filter(emisor=emisor, fecha__year=anio)
        .values('fecha__month')
        .annotate(total=Sum('total'))
    )
    for fila in filas:
        facturado_por_mes[fila['fecha__month']] = fila['total'] or Decimal('0')
    return [
        {
            'mes': mes,
            'monto': float(topes[mes]) if mes in topes else None,
            'facturado': float(facturado_por_mes[mes]),
        }
        for mes in range(1, 13)
    ]


def guardar_limites(emisor: Emisor, anio: int, limites: list[dict], usuario=None) -> None:
    """Aplica los topes de los meses recibidos (monto None = quitar el limite).

    Los meses que no vienen en la lista quedan como estaban.
    """
    for entrada in limites:
        mes, monto = entrada['mes'], entrada['monto']
        if monto is None:
            for limite in LimiteMensual.objects.filter(emisor=emisor, anio=anio, mes=mes):
                limite.delete(usuario=usuario)
            continue
        limite, creado = LimiteMensual.objects.update_or_create(
            emisor=emisor, anio=anio, mes=mes,
            defaults={'monto': monto, 'actualizado_por': usuario},
        )
        if creado and usuario is not None:
            limite.creado_por = usuario
            limite.save(update_fields=['creado_por'])


def verificar_limite_mensual(emisor: Emisor, datos: dict) -> dict | None:
    """Chequea el tope del mes ANTES de emitir. Devuelve el aviso o None.

    ``datos`` es el ``validated_data`` de :class:`CrearComprobanteSerializer` ya
    limpio (items sin ``producto``). El mes que cuenta es el de la fecha de
    emision de la factura.
    """
    fecha = datos.get('fecha') or timezone.localdate()
    limite = LimiteMensual.objects.filter(
        emisor=emisor, anio=fecha.year, mes=fecha.month,
    ).first()
    if limite is None:
        return None

    tipo = logica.tipo_comprobante(emisor.condicion, datos['cliente_condicion'])
    totales = logica.calcular_totales(
        datos['items'], tipo, datos.get('alicuota_iva') or Decimal('21'),
    )
    facturado = facturado_del_mes(emisor, fecha.year, fecha.month)
    acumulado = facturado + totales['total']
    if acumulado <= limite.monto:
        return None

    mes_legible = f'{nombre_mes(fecha.month)} {fecha.year}'
    return {
        'codigo': 'limite_mensual_excedido',
        'detail': (
            f'Con esta factura se supera el limite de facturacion de '
            f'{mes_legible} para {emisor.nombre}: el tope es '
            f'${limite.monto:,.2f} y el mes quedaria en ${acumulado:,.2f}.'
        ),
        'anio': fecha.year,
        'mes': fecha.month,
        'mes_nombre': nombre_mes(fecha.month),
        'limite': float(limite.monto),
        'facturado': float(facturado),
        'total_factura': float(totales['total']),
        'excedente': float(acumulado - limite.monto),
    }
