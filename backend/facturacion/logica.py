"""Reglas fiscales puras (sin tocar ARCA ni la base).

Mismas reglas que el frontend, para que el tipo de comprobante y los totales
coincidan de los dos lados:

- Un emisor MONOTRIBUTISTA siempre emite Factura C (sin IVA discriminado).
- Un emisor RESPONSABLE INSCRIPTO emite Factura A a otro Responsable Inscripto e
  IVA discriminado; Factura B al resto (consumidor final, monotributo, exento).
"""
from decimal import ROUND_HALF_UP, Decimal


def tipo_comprobante(condicion_emisor: str, condicion_receptor: str) -> str:
    """Letra del comprobante ('A', 'B' o 'C') segun emisor y receptor."""
    if condicion_emisor == 'monotributista':
        return 'C'
    return 'A' if condicion_receptor == 'responsable_inscripto' else 'B'


def _dos_decimales(valor: Decimal) -> Decimal:
    return valor.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def calcular_totales(items, tipo: str, alicuota_iva) -> dict:
    """Calcula neto, IVA y total a partir de los items.

    ``items`` es una lista de dicts con ``cantidad`` y ``precio_unitario`` (el
    precio es NETO, sin IVA). En Factura C el IVA es 0 y el total es el neto.
    """
    neto = sum(
        (Decimal(str(i['cantidad'])) * Decimal(str(i['precio_unitario'])) for i in items),
        Decimal('0'),
    )
    neto = _dos_decimales(neto)

    if tipo == 'C':
        iva = Decimal('0.00')
    else:
        iva = _dos_decimales(neto * Decimal(str(alicuota_iva)) / Decimal('100'))

    total = _dos_decimales(neto + iva)
    return {'neto': neto, 'iva': iva, 'total': total}
