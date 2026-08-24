"""Concepto de factura: emitir sin detallar lo que se vendio.

Una factura se puede emitir "con concepto": en vez de decir que producto se
vendio, los renglones dicen un texto del banco de conceptos
(:class:`ConceptoFactura`).

Quien decide es quien factura, en el modal de emision, y son DOS decisiones:

1. **Si usa concepto.** Emisor Monotributista: el check arranca TILDADO (es lo
   habitual). Emisor Responsable Inscripto: arranca DESTILDADO (detalle real).
   Siempre se puede cambiar, con cualquier concepto activo del banco.

2. **Como sale.** Dos formas, y las dos suman exactamente lo mismo:

   - **Agrupado** (lo de siempre): UN renglon con el texto por el total. Dos
     items de $700.000 salen como un renglon de $1.400.000.
   - **Un renglon por item**: se mantiene la cantidad de renglones, con su
     cantidad y su precio; lo unico que cambia es lo que DICE cada uno. Los
     mismos dos items salen como dos renglones de $700.000.

   Sirve cuando el cliente necesita ver los renglones separados (dos equipos,
   dos servicios) pero sin que la factura diga que era cada cosa.

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


def aplicar_concepto(items, texto, *, agrupar=True):
    """Escribe el texto del concepto en los renglones de la factura.

    Con ``agrupar=True`` (lo de siempre) devuelve UN renglon por el total; con
    ``agrupar=False`` devuelve los MISMOS renglones, cada uno con su cantidad y
    su precio, y solo les cambia la descripcion. El total es identico en los dos
    casos: no se toca ni una cantidad ni un precio.
    """
    texto = (texto or '').strip()[:MAX_LARGO_CONCEPTO]
    if not texto or not items:
        return items
    if agrupar:
        return agrupar_en_concepto(items, texto)
    return [{**item, 'descripcion': texto} for item in items]


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
