"""Concepto de factura: emitir sin detallar lo que se vendio.

Una factura se puede emitir "con concepto": en vez de un renglon por producto,
sale UN solo renglon con un texto del banco de conceptos
(:class:`ConceptoFactura`) por el total de la factura.

Quien decide es quien factura, en el modal de emision:

- Emisor **Monotributista**: el check arranca TILDADO (es lo habitual).
- Emisor **Responsable Inscripto**: arranca DESTILDADO (detalle real).

En los dos casos se puede cambiar, y el concepto elegido puede ser cualquiera
de los activos del banco.

Que NO cambia, y es la razon de que esto sea seguro:

- **ARCA no se entera.** El WSFEv1 solo recibe importes (``ImpTotal``,
  ``ImpNeto``, ``ImpIVA``, ``DocTipo``, ...); el detalle de los renglones nunca
  viaja. Cambiar descripciones no puede alterar un CAE.
- **El total no se mueve.** El renglon lleva ``cantidad = 1`` y como precio la
  SUMA de los subtotales, y los totales se calculan DESPUES de agrupar, sobre la
  lista final. La factura siempre cierra consigo misma (que es lo que ARCA
  valida contra ``ImpTotal``).
- **El stock se descuenta aparte**, con la lista de items ORIGINAL (ver
  ``views._descontar_stock``): agrupar no le saca el descuento a ningun producto.
- Una factura emitida sin concepto sale exactamente igual que siempre.
"""
from decimal import ROUND_HALF_UP, Decimal

# Largo del renglon en la base (``ItemComprobante.descripcion``).
MAX_LARGO_CONCEPTO = 200

# Texto con el que se siembra el banco la primera vez.
CONCEPTO_INICIAL = 'Accesorios y repuestos para telefonía celular'


def agrupar_en_concepto(items, texto):
    """Devuelve UN renglon con ``texto`` por la suma de todos los ``items``.

    ``items`` son los renglones ya validados (dicts con ``descripcion``,
    ``cantidad`` y ``precio_unitario``). Si no hay texto o no hay items, la lista
    vuelve tal cual: no se toca nada.
    """
    texto = (texto or '').strip()[:MAX_LARGO_CONCEPTO]
    if not texto or not items:
        return items

    total = sum(
        (Decimal(str(i['cantidad'])) * Decimal(str(i['precio_unitario'])) for i in items),
        Decimal('0'),
    )
    return [{
        'descripcion': texto,
        'cantidad': Decimal('1'),
        # El precio se guarda con 2 decimales: se cuantiza aca para que los
        # totales se calculen sobre el MISMO numero que se persiste.
        'precio_unitario': total.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP),
    }]
