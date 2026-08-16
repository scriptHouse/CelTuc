"""Resumen mensual de facturacion: lo que alimenta el boton "Exportar facturacion".

Que se facturo con factura electronica en un mes calendario, agrupado POR DIA y
POR MEDIO DE COBRO (efectivo, transferencia, transferencia financiera, tarjeta,
otro), lo mismo abierto POR CUENTA (cada CUIT que factura), mas el detalle de
cada comprobante. El Excel (la planilla "Facturacion" con Fecha / Efectivo /
Transferencias / Tarjetas / TOTAL / ESTADO / INDICE, mas la hoja "Por cuenta")
lo arma el front con estos numeros; aca solo se calcula, sin formato.

Como se decide el medio de cobro de cada comprobante, en este orden:

1. ``Comprobante.medio_pago`` si se informo (al emitir o editando el detalle).
2. Si no, el cobro REAL de la venta de mostrador ligada (``Venta.comprobante``
   -> ``PagoVenta``): el total del comprobante se reparte entre los medios de
   las partes que ese comprobante representa, en proporcion a sus montos. Una
   venta cobrada mitad en efectivo y mitad con tarjeta, facturada entera,
   aporta mitad y mitad. Si las partes no cierran con el total de la factura
   (por ejemplo, una venta repartida en DOS facturas: la venta apunta a una
   sola), no se inventa nada y cae al punto 3.
3. Si no hay nada: ``sin_medio``. Aparece como columna aparte, asi la plata
   nunca se pierde del total: se ve que falta informar el medio.

Nada de esto toca ARCA ni los comprobantes: es solo lectura.
"""
from collections import defaultdict
from decimal import ROUND_HALF_UP, Decimal
import calendar
import datetime

from .models import Comprobante

# Los "baldes" del resumen: los medios del comprobante mas el de "no informado".
SIN_MEDIO = 'sin_medio'
MEDIOS = [*Comprobante.MedioPago.values, SIN_MEDIO]

CENTAVO = Decimal('0.01')


def _cero_por_medio():
    return {medio: Decimal('0') for medio in MEDIOS}


def _repartir(total: Decimal, pesos: dict) -> dict:
    """Reparte ``total`` entre los medios en proporcion a ``pesos`` (montos).

    Redondea a centavos y le carga la diferencia por redondeo al medio de mayor
    peso, asi la suma de las partes es EXACTAMENTE ``total``.
    """
    suma_pesos = sum(pesos.values(), Decimal('0'))
    if suma_pesos <= 0:
        return {}
    partes = {}
    for medio, peso in pesos.items():
        partes[medio] = (total * peso / suma_pesos).quantize(CENTAVO, rounding=ROUND_HALF_UP)
    diferencia = total - sum(partes.values(), Decimal('0'))
    if diferencia:
        mayor = max(pesos, key=lambda m: pesos[m])
        partes[mayor] += diferencia
    return {medio: monto for medio, monto in partes.items() if monto}


# Cuanto puede diferir el total de la factura de lo cobrado para seguir
# considerandolos "el mismo dinero": el IVA se redondea al centavo, asi que un
# peso de diferencia es ruido, no otra operacion.
TOLERANCIA = Decimal('1')


def _partes_del_comprobante(comprobante, pagos):
    """Que partes del cobro de la venta representan ESTE comprobante.

    Se prueban tres conjuntos, del mas especifico al mas amplio: las partes
    facturadas con la MISMA cuenta que el comprobante, las facturadas con
    cualquier cuenta, y por ultimo todas (por si la venta quedo marcada sin
    factura y se facturo igual). De cada uno se acepta:

    - el conjunto entero, si su suma es el total del comprobante (el caso
      normal: la factura cubre todo lo que ese conjunto cobro);
    - o UNA sola parte cuyo monto sea exactamente el total, si el conjunto suma
      de mas (una venta partida en varias facturas: `Venta.comprobante` apunta a
      una sola, y repartir el total entre todas las partes le inventaria medios
      que no le corresponden).

    Si nada encaja se devuelve vacio: el comprobante queda como "sin informar",
    que es preferible a atribuirle un medio equivocado.
    """
    from inventario.models import Venta

    total = comprobante.total or Decimal('0')
    facturados = [p for p in pagos if p[1] != Venta.Facturacion.SIN_FACTURA]
    misma_cuenta = [p for p in facturados if p[2] == comprobante.emisor_id]
    for grupo in (misma_cuenta, facturados, pagos):
        if not grupo:
            continue
        if abs(sum((p[3] for p in grupo), Decimal('0')) - total) <= TOLERANCIA:
            return grupo
        exactas = [p for p in grupo if abs(p[3] - total) <= TOLERANCIA]
        if len(exactas) == 1:
            return exactas
    return []


def _medios_desde_ventas(comprobantes):
    """Para los comprobantes SIN medio informado, el reparto por medio segun el
    cobro real de la venta de mostrador ligada. Devuelve {id: {medio: monto}}.
    """
    from inventario.models import PagoVenta

    pendientes = {c.pk: c for c in comprobantes if not c.medio_pago}
    if not pendientes:
        return {}
    filas = (
        PagoVenta.objects
        .filter(venta__comprobante_id__in=pendientes.keys(), venta__borrado=False)
        .values_list('venta__comprobante_id', 'medio', 'facturacion', 'emisor_id', 'monto')
    )
    por_comprobante = defaultdict(list)
    for comprobante_id, medio, facturacion, emisor_id, monto in filas:
        if monto and monto > 0:
            por_comprobante[comprobante_id].append((medio, facturacion, emisor_id, monto))

    resultado = {}
    for comprobante_id, pagos in por_comprobante.items():
        comprobante = pendientes[comprobante_id]
        elegidos = _partes_del_comprobante(comprobante, pagos)
        if not elegidos:
            continue
        pesos = defaultdict(Decimal)
        for medio, _facturacion, _emisor, monto in elegidos:
            pesos[medio] += monto
        reparto = _repartir(comprobante.total, dict(pesos))
        if reparto:
            resultado[comprobante_id] = reparto
    return resultado


def resumen_mensual(anio: int, mes: int, *, emisores=None, incluir_ocultos=False) -> dict:
    """Facturacion del mes ``mes``/``anio``, por dia y por medio de cobro.

    - ``emisores``: ids de las cuentas que entran (None o vacio = todas).
    - ``incluir_ocultos``: True suma tambien los comprobantes ocultados de la
      lista (borrado logico). Fiscalmente existen igual (tienen CAE), pero por
      defecto se respeta lo que la persona ve en pantalla.

    Los importes salen como float (listos para JSON); el reparto se hace en
    Decimal para que las sumas cierren al centavo.
    """
    if not 1 <= mes <= 12:
        raise ValueError('El mes debe estar entre 1 y 12.')
    ultimo_dia = calendar.monthrange(anio, mes)[1]
    desde = datetime.date(anio, mes, 1)
    hasta = datetime.date(anio, mes, ultimo_dia)

    base = Comprobante.todos if incluir_ocultos else Comprobante.objects
    qs = base.filter(fecha__gte=desde, fecha__lte=hasta).select_related('emisor')
    ids_emisores = [int(e) for e in (emisores or []) if str(e).strip()]
    if ids_emisores:
        qs = qs.filter(emisor_id__in=ids_emisores)
    comprobantes = list(qs.order_by('fecha', 'emisor_id', 'tipo', 'numero', 'id'))

    desde_ventas = _medios_desde_ventas(comprobantes)

    dias = {}
    totales = {
        'cantidad': 0, 'total': Decimal('0'), 'por_medio': _cero_por_medio(),
        'ri': Decimal('0'), 'mono': Decimal('0'),
        'cobrado': Decimal('0'), 'pendiente': Decimal('0'),
    }
    # Lo mismo, pero abierto POR CUENTA (cada CUIT que factura): cuanto entro
    # por cada medio en cada una. Es el corte que pide la conciliacion, porque
    # cada CUIT rinde por separado.
    cuentas = {}
    detalle = []
    sin_medio = {'cantidad': 0, 'total': Decimal('0')}

    for c in comprobantes:
        total = c.total or Decimal('0')
        if c.medio_pago:
            por_medio = {c.medio_pago: total}
            origen = 'comprobante'
        elif c.pk in desde_ventas:
            por_medio = desde_ventas[c.pk]
            origen = 'venta'
        else:
            por_medio = {SIN_MEDIO: total}
            origen = ''
            sin_medio['cantidad'] += 1
            sin_medio['total'] += total

        clave = c.fecha.isoformat()
        dia = dias.get(clave)
        if dia is None:
            dia = dias[clave] = {
                'fecha': clave, 'cantidad': 0, 'total': Decimal('0'),
                'por_medio': _cero_por_medio(),
                'ri': Decimal('0'), 'mono': Decimal('0'),
                'cobrado': Decimal('0'), 'pendiente': Decimal('0'),
            }
        cuenta = cuentas.get(c.emisor_id)
        if cuenta is None:
            cuenta = cuentas[c.emisor_id] = {
                'emisor': c.emisor_id,
                'nombre': c.emisor.nombre,
                'cuit': c.emisor.cuit,
                'condicion': c.emisor.condicion,
                'punto_venta': c.emisor.punto_venta,
                'cantidad': 0, 'total': Decimal('0'),
                'por_medio': _cero_por_medio(),
                'ri': Decimal('0'), 'mono': Decimal('0'),
                'cobrado': Decimal('0'), 'pendiente': Decimal('0'),
            }

        for acumulador in (dia, totales, cuenta):
            acumulador['cantidad'] += 1
            acumulador['total'] += total
            for medio, monto in por_medio.items():
                acumulador['por_medio'][medio] += monto
            if c.tipo == Comprobante.Tipo.C:
                acumulador['mono'] += total
            else:
                acumulador['ri'] += total
            if c.estado_cobro == Comprobante.EstadoCobro.PAGADA:
                acumulador['cobrado'] += total
            else:
                acumulador['pendiente'] += total

        detalle.append({
            'id': c.pk,
            'fecha': clave,
            'tipo': c.tipo,
            'numero_formateado': c.numero_formateado,
            'emisor': c.emisor_id,
            'emisor_nombre': c.emisor.nombre,
            'emisor_cuit': c.emisor.cuit,
            'cliente_nombre': c.cliente_nombre,
            'total': float(total),
            'estado_cobro': c.estado_cobro,
            'cae': c.cae,
            'oculto': bool(c.borrado),
            'medio_pago': c.medio_pago,
            'medio_origen': origen,
            'por_medio': {medio: float(monto) for medio, monto in por_medio.items()},
        })

    def _serializar(acumulador):
        return {
            'cantidad': acumulador['cantidad'],
            'total': float(acumulador['total']),
            'por_medio': {m: float(v) for m, v in acumulador['por_medio'].items()},
            'ri': float(acumulador['ri']),
            'mono': float(acumulador['mono']),
            'cobrado': float(acumulador['cobrado']),
            'pendiente': float(acumulador['pendiente']),
        }

    return {
        'anio': anio,
        'mes': mes,
        'desde': desde.isoformat(),
        'hasta': hasta.isoformat(),
        'dias_del_mes': ultimo_dia,
        'emisores': ids_emisores,
        'incluir_ocultos': bool(incluir_ocultos),
        'medios': list(MEDIOS),
        'dias': [
            {'fecha': clave, **_serializar(dia)}
            for clave, dia in sorted(dias.items())
        ],
        'comprobantes': detalle,
        # Una fila por cuenta (CUIT), de la que mas facturo a la que menos.
        'por_cuenta': [
            {
                'emisor': cuenta['emisor'],
                'nombre': cuenta['nombre'],
                'cuit': cuenta['cuit'],
                'condicion': cuenta['condicion'],
                'punto_venta': cuenta['punto_venta'],
                **_serializar(cuenta),
            }
            for cuenta in sorted(cuentas.values(), key=lambda c: (-c['total'], c['nombre']))
        ],
        'totales': _serializar(totales),
        'sin_medio': {'cantidad': sin_medio['cantidad'], 'total': float(sin_medio['total'])},
    }
