"""Concepto generico: renglones que NO dicen el producto que se vendio.

Algunos articulos no se detallan por su nombre en la factura (parlantes,
consolas, equipos Xiaomi/Samsung/Apple y los repuestos del taller: baterias,
modulos, camaras, flex, placas, tapas). Se marcan con el flag
``concepto_generico_factura`` de ``productos.Producto`` y de
``precios_service.ItemService``, y al emitir se FUSIONAN en un unico renglon
que dice el texto configurado en la preferencia ``facturacion.concepto_generico``.

Que NO cambia (importante, esto se toca todos los dias):

- **ARCA no se entera.** El WSFEv1 solo recibe importes (``ImpTotal``,
  ``ImpNeto``, ``ImpIVA``, ``DocTipo``, ...); el detalle de los renglones nunca
  viaja. Cambiar descripciones no puede alterar un CAE.
- **El total no se mueve.** El renglon fusionado lleva ``cantidad = 1`` y como
  precio la SUMA de los subtotales fusionados, y los totales se calculan
  DESPUES de fusionar, sobre la lista final. La factura siempre cierra consigo
  misma (que es lo que ARCA valida).
- **El stock se descuenta aparte**, con la lista de items ORIGINAL (ver
  ``views._descontar_stock``): fusionar no le saca el descuento a nadie.
- Una factura sin productos marcados sale byte por byte igual que antes.
"""
from decimal import ROUND_HALF_UP, Decimal

from comun.models import Preferencia

# Clave de la preferencia global y texto por defecto (el que se usa mientras
# nadie lo personalice). Se declara tambien en ``comun.views.CLAVES_PREFERENCIAS``.
CLAVE_PREFERENCIA = 'facturacion.concepto_generico'
MENSAJE_POR_DEFECTO = 'Accesorios y repuestos para telefonía celular'

# Largo del renglon en la base (``ItemComprobante.descripcion``).
MAX_LARGO_MENSAJE = 200


def mensaje_concepto_generico() -> str:
    """Texto configurado, o el de fabrica si nadie lo personalizo."""
    pref = Preferencia.objects.filter(clave=CLAVE_PREFERENCIA).first()
    valor = (pref.valor if pref else '').strip()
    return (valor or MENSAJE_POR_DEFECTO)[:MAX_LARGO_MENSAJE]


def _es_generico(producto, item_service) -> bool:
    if producto is not None and producto.concepto_generico_factura:
        return True
    return item_service is not None and item_service.concepto_generico_factura


def hay_concepto_generico(productos, items_service) -> bool:
    """¿Alguno de los renglones se va a reemplazar por el mensaje?"""
    return any(
        _es_generico(p, s)
        for p, s in zip(productos, items_service)
    )


def aplicar_concepto_generico(items, productos, items_service, mensaje=None):
    """Devuelve la lista de renglones a facturar, con los marcados fusionados.

    ``items`` son los renglones ya validados (dicts con ``descripcion``,
    ``cantidad`` y ``precio_unitario``); ``productos`` e ``items_service`` van
    en paralelo, con ``None`` donde el renglon no salio de un catalogo.

    Si no hay ninguno marcado devuelve ``items`` tal cual. Si hay, los fusiona
    en UN renglon con el mensaje, ubicado donde estaba el primero de ellos, con
    ``cantidad = 1`` y precio igual a la suma de los subtotales fusionados.
    """
    if not hay_concepto_generico(productos, items_service):
        return items

    mensaje = (mensaje or mensaje_concepto_generico())[:MAX_LARGO_MENSAJE]
    salida, suma, posicion = [], Decimal('0'), None
    for indice, item in enumerate(items):
        if not _es_generico(productos[indice], items_service[indice]):
            salida.append(item)
            continue
        suma += Decimal(str(item['cantidad'])) * Decimal(str(item['precio_unitario']))
        if posicion is None:
            # El renglon fusionado ocupa el lugar del primer marcado.
            posicion = len(salida)
            salida.append(None)

    salida[posicion] = {
        'descripcion': mensaje,
        'cantidad': Decimal('1'),
        # El precio unitario se guarda con 2 decimales: se cuantiza aca para que
        # los totales se calculen sobre el MISMO numero que se persiste.
        'precio_unitario': suma.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP),
    }
    return salida
