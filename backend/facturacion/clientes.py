"""Alta/actualización de la base de clientes a partir de las facturas.

Se llama DESPUÉS de emitir (fuera de la transacción de ARCA), igual que el
descuento de stock: alimentar la base de clientes jamás debe voltear una
emisión ya autorizada. Por eso la vista envuelve la llamada en un try/except.

También vive acá el cruce cliente ↔ compras: como el comprobante no tiene una FK
al cliente (la base se arma sola), las compras de un cliente son los comprobantes
que coinciden por documento y, si no hay, por teléfono (el mismo criterio con el
que se lo dio de alta).
"""
from django.db import transaction
from django.db.models import Count, Max, Sum

from .models import Cliente


def comprobantes_de_cliente(cliente):
    """Comprobantes (compras) de un cliente, del más nuevo al más viejo.

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


def stats_por_cliente():
    """Agregados de compras (cantidad, total, última) por documento y por teléfono.

    Devuelve `{'doc': {doc: row}, 'tel': {tel: row}}` con solo DOS consultas, sin
    importar cuántos clientes haya (para la lista del gestor).
    """
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
    return {'doc': por_doc, 'tel': por_tel}


def registrar_cliente_desde_comprobante(comprobante):
    """Crea o actualiza el `Cliente` con los datos del comprobante emitido.

    Identifica al cliente por número de documento y, si no hay (Consumidor Final),
    por teléfono. Si no hay ninguno de los dos, no registra nada (no habría forma
    de reconocerlo en la próxima factura). Devuelve el Cliente (o None).
    """
    doc = (comprobante.cliente_doc_numero or '').strip()
    tel = (comprobante.cliente_telefono or '').strip()
    if not doc and not tel:
        return None

    with transaction.atomic():
        if doc:
            cliente = Cliente.objects.select_for_update().filter(doc_numero=doc).first()
        else:
            cliente = Cliente.objects.select_for_update().filter(doc_numero='', telefono=tel).first()

        es_nuevo = cliente is None
        if es_nuevo:
            cliente = Cliente()

        cliente.nombre = comprobante.cliente_nombre
        cliente.doc_tipo = comprobante.cliente_doc_tipo
        cliente.condicion = comprobante.cliente_condicion
        # Completamos documento/teléfono si ahora los tenemos, sin pisar con vacío
        # un dato que ya estaba guardado.
        if doc:
            cliente.doc_numero = doc
        if tel:
            cliente.telefono = tel

        usuario = getattr(comprobante, 'actualizado_por', None)
        if es_nuevo:
            cliente.creado_por = usuario
        cliente.actualizado_por = usuario
        cliente.save()

    return cliente
