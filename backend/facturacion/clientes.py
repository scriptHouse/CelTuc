"""Alta/actualización de la base de clientes y su historial de compras.

El alta se llama DESPUÉS de emitir (fuera de la transacción de ARCA), igual que
el descuento de stock: alimentar la base de clientes jamás debe voltear una
emisión ya autorizada. Por eso la vista envuelve la llamada en un try/except.

También vive acá el cruce cliente ↔ compras. Hoy el sistema guarda DOS tipos de
compra y las dos entran al historial:

- **Facturas** (`Comprobante`): el comprobante no tiene FK al cliente (la base se
  arma sola), así que se cruzan por documento y, si no hay, por teléfono — el
  mismo criterio de identidad con el que se dio de alta al cliente.
- **Ventas de mostrador** (`inventario.Venta`): apuntan al cliente con una FK.
  Si esa venta terminó facturada (`venta.comprobante`), NO se cuenta: la factura
  ya la representa y contarla dos veces inflaría el total gastado.
"""
from django.db import transaction
from django.db.models import Count, Max, Sum
from django.utils import timezone

from .models import Cliente


def fecha_local(momento):
    """La fecha (día) de un datetime guardado, en la hora de Argentina.

    Las ventas no tienen fecha propia: se ubican por su alta (`creado`), que se
    guarda en UTC. Sin convertir, una venta de las 22 h caería en el día
    siguiente.
    """
    return timezone.localtime(momento).date() if momento else None


def comprobantes_de_cliente(cliente):
    """Facturas del cliente, de la más nueva a la más vieja.

    Se cruzan por documento y, si el cliente no tiene, por teléfono — el mismo
    criterio de identidad con el que se arma la base.
    """
    from .models import Comprobante

    qs = Comprobante.objects.select_related('emisor').prefetch_related('items')
    if cliente.doc_numero:
        qs = qs.filter(cliente_doc_numero=cliente.doc_numero)
    elif cliente.telefono:
        qs = qs.filter(cliente_doc_numero='', cliente_telefono=cliente.telefono)
    else:
        return qs.none()
    return qs.order_by('-fecha', '-numero', '-id')


def ventas_de_cliente(cliente):
    """Ventas de mostrador del cliente que NO terminaron facturadas.

    Las facturadas se excluyen: ya aparecen como factura (misma plata).
    """
    from inventario.models import Venta

    return (
        Venta.objects.filter(cliente=cliente, comprobante__isnull=True)
        .select_related('sucursal')
        .prefetch_related('items__producto', 'pagos')
        .order_by('-creado', '-id')
    )


def _compra_de_comprobante(comprobante):
    return {
        'id': comprobante.pk,
        'origen': 'factura',
        'titulo': f'Factura {comprobante.tipo} · {comprobante.numero_formateado}',
        'detalle': comprobante.emisor.nombre if comprobante.emisor_id else '',
        'fecha': comprobante.fecha.isoformat(),
        'total': float(comprobante.total or 0),
        'estado_cobro': comprobante.estado_cobro,
        'items': [
            {
                'descripcion': item.descripcion,
                'cantidad': float(item.cantidad or 0),
                'precio_unitario': float(item.precio_unitario or 0),
                'subtotal': float(item.subtotal or 0),
            }
            for item in comprobante.items.all()
        ],
    }


def _compra_de_venta(venta):
    # Cobrada con varios medios, se muestran todos ("Efectivo + Transferencia");
    # las ventas viejas (sin filas de pago) siguen mostrando su `forma_pago`.
    medios = [pago.get_medio_display() for pago in venta.pagos.all()]
    partes = (
        venta.sucursal.nombre if venta.sucursal_id else '',
        ' + '.join(dict.fromkeys(medios)) if medios else venta.get_forma_pago_display(),
    )
    return {
        'id': venta.pk,
        'origen': 'venta',
        'titulo': f'Venta de mostrador #{venta.pk}',
        'detalle': ' · '.join(parte for parte in partes if parte),
        # La venta no tiene fecha propia: la del alta (el mostrador vende en el día).
        'fecha': fecha_local(venta.creado).isoformat(),
        'total': float(venta.total or 0),
        # La venta de mostrador se cobra en el acto.
        'estado_cobro': 'pagada',
        'items': [
            {
                # `detalle` sirve para los tres tipos de renglon: mercaderia,
                # service del taller e item libre.
                'descripcion': item.detalle,
                'cantidad': float(item.cantidad or 0),
                'precio_unitario': float(item.precio_unitario or 0),
                'subtotal': float(item.subtotal or 0),
            }
            for item in venta.items.all()
        ],
    }


def compras_de_cliente(cliente):
    """Todas las compras del cliente (facturas + ventas), de la más nueva a la más vieja.

    Devuelve dicts con una forma común para que el front las liste en una sola
    línea de tiempo, distinguidas por `origen`.
    """
    compras = [_compra_de_comprobante(c) for c in comprobantes_de_cliente(cliente)]
    compras += [_compra_de_venta(v) for v in ventas_de_cliente(cliente)]
    # Empate de fechas: primero las facturas (tienen número; ordenan más claro).
    compras.sort(key=lambda c: (c['fecha'], c['origen'] == 'factura', c['id']), reverse=True)
    return compras


def resumen_de_cliente(cliente):
    """Cantidad de compras, total gastado y fecha de la última (los dos tipos)."""
    factura = comprobantes_de_cliente(cliente).aggregate(
        cantidad=Count('id'), total=Sum('total'), ultima=Max('fecha'),
    )
    venta = ventas_de_cliente(cliente).aggregate(
        cantidad=Count('id'), total=Sum('total'), ultima=Max('creado'),
    )
    ultimas = [f for f in (factura['ultima'], fecha_local(venta['ultima'])) if f]
    return {
        'cantidad': (factura['cantidad'] or 0) + (venta['cantidad'] or 0),
        'total': float((factura['total'] or 0) + (venta['total'] or 0)),
        'ultima': max(ultimas).isoformat() if ultimas else None,
        'facturas': factura['cantidad'] or 0,
        'ventas': venta['cantidad'] or 0,
    }


def stats_por_cliente():
    """Agregados de compras por documento, por teléfono y por cliente (ventas).

    Devuelve `{'doc': {...}, 'tel': {...}, 'venta': {cliente_id: fila}}` con solo
    TRES consultas, sin importar cuántos clientes haya (para la lista del gestor).
    """
    from inventario.models import Venta

    from .models import Comprobante

    base = Comprobante.objects.all()  # ManagerVivos: excluye los borrados
    por_doc, por_tel = {}, {}
    for row in (
        base.exclude(cliente_doc_numero='')
        .values('cliente_doc_numero')
        .annotate(cantidad=Count('id'), total=Sum('total'), ultima=Max('fecha'))
    ):
        por_doc[row['cliente_doc_numero']] = row
    for row in (
        base.filter(cliente_doc_numero='')
        .exclude(cliente_telefono='')
        .values('cliente_telefono')
        .annotate(cantidad=Count('id'), total=Sum('total'), ultima=Max('fecha'))
    ):
        por_tel[row['cliente_telefono']] = row
    por_venta = {}
    for row in (
        Venta.objects.filter(cliente__isnull=False, comprobante__isnull=True)
        .values('cliente_id')
        .annotate(cantidad=Count('id'), total=Sum('total'), ultima=Max('creado'))
    ):
        por_venta[row['cliente_id']] = row
    return {'doc': por_doc, 'tel': por_tel, 'venta': por_venta}


def registrar_cliente(*, nombre, doc_tipo='', doc_numero='', condicion='', telefono='',
                      email='', usuario=None):
    """Crea o actualiza el cliente identificado por documento / teléfono / email.

    Es el único lugar donde se da de alta un cliente: lo usan la emisión de
    facturas, la venta de mostrador y los documentos del módulo Documentos. Si
    no llega ninguno de los tres datos de identidad no registra nada (no habría
    forma de reconocerlo después) y devuelve None. Nunca pisa con vacío un dato
    ya guardado.

    El cliente devuelto trae `recien_creado` (atributo de instancia, no se
    guarda): dice si esta llamada lo dio de alta o solo lo actualizó, para que
    quien llama pueda avisarlo sin repetir la búsqueda de identidad.
    """
    nombre = (nombre or '').strip()
    doc = (doc_numero or '').strip()
    tel = (telefono or '').strip()
    mail = (email or '').strip().lower()
    if not doc and not tel and not mail:
        return None

    with transaction.atomic():
        vivos = Cliente.objects.select_for_update()
        cliente = None
        if doc:
            # El documento manda: es la identidad fuerte (y tiene indice unico).
            cliente = vivos.filter(doc_numero=doc).first()
        else:
            # Sin documento: teléfono y, si no aparece, email.
            if tel:
                cliente = vivos.filter(doc_numero='', telefono=tel).first()
            if cliente is None and mail:
                cliente = vivos.filter(doc_numero='', email=mail).first()

        es_nuevo = cliente is None
        if es_nuevo:
            cliente = Cliente()

        if nombre:
            cliente.nombre = nombre
        elif es_nuevo:
            cliente.nombre = doc or tel or mail
        if doc_tipo:
            cliente.doc_tipo = doc_tipo
        if condicion:
            cliente.condicion = condicion
        # Completamos documento/teléfono/email si ahora los tenemos, sin pisar
        # con vacío un dato que ya estaba guardado.
        if doc:
            cliente.doc_numero = doc
        if tel:
            cliente.telefono = tel
        if mail:
            cliente.email = mail

        if es_nuevo:
            cliente.creado_por = usuario
        cliente.actualizado_por = usuario
        cliente.save()

    cliente.recien_creado = es_nuevo
    return cliente


def registrar_cliente_desde_comprobante(comprobante):
    """Crea o actualiza el `Cliente` con los datos del comprobante emitido.

    Devuelve el Cliente (o None si la factura no traía con qué identificarlo).
    """
    return registrar_cliente(
        nombre=comprobante.cliente_nombre,
        doc_tipo=comprobante.cliente_doc_tipo,
        doc_numero=comprobante.cliente_doc_numero,
        condicion=comprobante.cliente_condicion,
        telefono=comprobante.cliente_telefono,
        email=comprobante.cliente_email,
        usuario=getattr(comprobante, 'actualizado_por', None),
    )
