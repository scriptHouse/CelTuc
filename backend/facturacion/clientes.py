"""Alta/actualización de la base de clientes a partir de las facturas.

Se llama DESPUÉS de emitir (fuera de la transacción de ARCA), igual que el
descuento de stock: alimentar la base de clientes jamás debe voltear una
emisión ya autorizada. Por eso la vista envuelve la llamada en un try/except.
"""
from django.db import transaction

from .models import Cliente


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
