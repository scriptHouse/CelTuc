"""Inventario: stock por sucursal sobre el catalogo central de productos.

No hay un catalogo propio: el stock es `Producto x Sucursal` (una cantidad y un
minimo opcional por combinacion). Cada cambio de cantidad queda registrado en
`MovimientoStock` (quien, cuando, cuanto y por que) — es la base para el kardex
y para que, mas adelante, una venta descuente stock sola.

Los precios NO viven aca: se leen del catalogo (`productos`), derivados del
dolar del negocio como siempre.
"""
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import models, transaction

from comun.models import ModeloBase


class Sucursal(ModeloBase):
    """Un local del negocio (Solar YB, Central YB, Salta).

    Es LA tabla de sucursales de todo el sistema: el stock cuelga de aca
    (`StockProducto`), los empleados pertenecen a una (`empleados.Empleado`)
    y el codigo postal alimenta la direccion de los documentos segun quien
    esta logueado.
    """

    nombre = models.CharField('nombre', max_length=120)
    codigo_postal = models.CharField('codigo postal', max_length=10, blank=True)
    orden = models.PositiveSmallIntegerField('orden', default=0)
    activa = models.BooleanField('activa', default=True)

    class Meta:
        db_table = 'inventario_sucursales'
        verbose_name = 'sucursal'
        verbose_name_plural = 'sucursales'
        ordering = ('orden', 'nombre')
        constraints = [
            models.UniqueConstraint(
                fields=('nombre',),
                condition=models.Q(borrado=False),
                name='uq_sucursal_viva',
            ),
        ]

    def __str__(self):
        return self.nombre


class StockProducto(ModeloBase):
    """La cantidad de un producto en una sucursal (fila unica por combinacion)."""

    producto = models.ForeignKey(
        'productos.Producto',
        on_delete=models.CASCADE,
        related_name='stocks',
        verbose_name='producto',
    )
    sucursal = models.ForeignKey(
        Sucursal,
        on_delete=models.CASCADE,
        related_name='stocks',
        verbose_name='sucursal',
    )
    # Puede quedar NEGATIVA: una venta confirmada con faltante no se pierde;
    # el rojo es la senial de que el conteo esta atrasado y hay que corregirlo.
    cantidad = models.IntegerField('cantidad', default=0)
    stock_minimo = models.PositiveIntegerField(
        'stock minimo',
        null=True,
        blank=True,
        help_text='Vacio = sin alerta. Con valor, la fila avisa cuando cantidad <= minimo.',
    )
    sin_dato = models.BooleanField(
        'sin dato (no informado)',
        default=False,
        help_text='La planilla de origen no informaba cantidad: el 0 no es un conteo. '
                  'Se limpia solo al cargar una cantidad real.',
    )

    class Meta:
        db_table = 'inventario_stock'
        verbose_name = 'stock de producto'
        verbose_name_plural = 'stock de productos'
        ordering = ('sucursal__orden', 'producto__orden', 'id')
        constraints = [
            models.UniqueConstraint(
                fields=('producto', 'sucursal'),
                condition=models.Q(borrado=False),
                name='uq_stock_producto_sucursal_vivo',
            ),
        ]

    def __str__(self):
        return f'{self.producto} en {self.sucursal}: {self.cantidad}'


class MovimientoStock(ModeloBase):
    """Un cambio de stock: el renglon del kardex.

    `delta` es firmado (+entra / -sale) y `resultante` es la cantidad que quedo
    despues de aplicarlo. Una transferencia entre sucursales genera DOS
    movimientos (el egreso en origen y el ingreso en destino).
    """

    class Tipo(models.TextChoices):
        INGRESO = 'ingreso', 'Ingreso'
        EGRESO = 'egreso', 'Egreso'
        AJUSTE = 'ajuste', 'Ajuste'
        TRANSFERENCIA = 'transferencia', 'Transferencia'
        VENTA = 'venta', 'Venta'

    producto = models.ForeignKey(
        'productos.Producto',
        on_delete=models.CASCADE,
        related_name='movimientos_stock',
        verbose_name='producto',
    )
    sucursal = models.ForeignKey(
        Sucursal,
        on_delete=models.CASCADE,
        related_name='movimientos',
        verbose_name='sucursal',
    )
    tipo = models.CharField('tipo', max_length=20, choices=Tipo.choices)
    delta = models.IntegerField('delta', help_text='Firmado: positivo entra, negativo sale.')
    # Puede ser negativa (venta confirmada con faltante): el kardex refleja
    # el resultado real, aunque este en rojo.
    resultante = models.IntegerField('cantidad resultante')
    nota = models.CharField('nota', max_length=200, blank=True)

    class Meta:
        db_table = 'inventario_movimientos'
        verbose_name = 'movimiento de stock'
        verbose_name_plural = 'movimientos de stock'
        ordering = ('-creado', '-id')

    def __str__(self):
        return f'{self.get_tipo_display()} {self.delta:+d} · {self.producto} en {self.sucursal}'


class Venta(ModeloBase):
    """Una venta de mostrador: productos del catalogo que salen de una sucursal.

    Registrarla descuenta el stock (un `MovimientoStock` tipo VENTA por item,
    con nota "Venta #N"). Es la version minima que hace mover el stock solo;
    la caja diaria (arqueo) sigue siendo el modulo Caja, y la factura fiscal
    sigue siendo Facturacion (que tambien puede descontar stock por su lado).

    Puede anotar a QUIEN se le vendio (`cliente`, opcional): asi la venta entra
    al historial de compras del cliente junto con sus facturas. Si despues esa
    misma venta se factura, queda apuntada en `comprobante` para no contarla
    dos veces (la factura la representa).
    """

    class FormaPago(models.TextChoices):
        EFECTIVO = 'efectivo', 'Efectivo'
        TRANSFERENCIA = 'transferencia', 'Transferencia'
        TARJETA = 'tarjeta', 'Tarjeta'
        OTRO = 'otro', 'Otro'

    class Facturacion(models.TextChoices):
        """Como se factura la venta. Es una ETIQUETA para separar la plata por
        caja (RI vs monotributo/sin factura); la factura fiscal en si se emite
        desde el modulo Facturacion, igual que siempre."""

        FACTURA_RI = 'factura_ri', 'Factura A/B (Responsable Inscripto)'
        FACTURA_C = 'factura_c', 'Factura C (Monotributo)'
        SIN_FACTURA = 'sin_factura', 'Sin factura'

    sucursal = models.ForeignKey(
        Sucursal,
        on_delete=models.PROTECT,
        related_name='ventas',
        verbose_name='sucursal',
    )
    forma_pago = models.CharField(
        'forma de pago', max_length=20, choices=FormaPago.choices, default=FormaPago.EFECTIVO,
    )
    facturacion = models.CharField(
        'facturacion', max_length=20, choices=Facturacion.choices,
        default=Facturacion.SIN_FACTURA,
    )
    # A quien se le vendio. Opcional (la venta de mostrador nunca se frena por
    # no saber quien es): si esta, la venta aparece en el historial del cliente.
    # SET_NULL para que borrar un cliente jamas toque una venta ya registrada.
    cliente = models.ForeignKey(
        'facturacion.Cliente',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='ventas',
        verbose_name='cliente',
    )
    # Si la venta se termino facturando, la factura que la representa. Evita
    # contar dos veces la misma plata en el historial del cliente.
    comprobante = models.ForeignKey(
        'facturacion.Comprobante',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='ventas',
        verbose_name='factura de esta venta',
    )
    nota = models.CharField('nota', max_length=200, blank=True)
    total = models.DecimalField('total ($)', max_digits=14, decimal_places=2, default=0)

    class Meta:
        db_table = 'inventario_ventas'
        verbose_name = 'venta'
        verbose_name_plural = 'ventas'
        ordering = ('-creado', '-id')

    def __str__(self):
        return f'Venta #{self.pk} · {self.sucursal} · ${self.total}'


class ItemVenta(models.Model):
    """Un renglon de la venta, con el precio al momento de vender.

    En el mostrador no se vende solo mercaderia: tambien services del taller y
    cosas sueltas que no estan en ningun catalogo. Por eso el renglon tiene
    `tipo`:

    - ``producto``: una fila del catalogo (`productos.Producto`). Es la unica
      que mueve stock.
    - ``service``: un trabajo del taller. Puede apuntar a la fila de la lista de
      precios (`item_service`) para poder reportarlo despues; el stock no se
      toca (el repuesto se descuenta aparte, si corresponde).
    - ``otro``: texto libre (mano de obra, un accesorio suelto, un ajuste).

    `descripcion` es una FOTO de lo vendido: sobrevive a que despues renombren
    el producto o cambien la lista de precios.
    """

    class Tipo(models.TextChoices):
        PRODUCTO = 'producto', 'Producto del catalogo'
        SERVICE = 'service', 'Service / reparacion'
        OTRO = 'otro', 'Otro'

    venta = models.ForeignKey(
        Venta,
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name='venta',
    )
    tipo = models.CharField('tipo', max_length=12, choices=Tipo.choices, default=Tipo.PRODUCTO)
    # Solo para `tipo=producto`. Nulo en services y en items libres.
    producto = models.ForeignKey(
        'productos.Producto',
        on_delete=models.PROTECT,
        related_name='items_venta',
        verbose_name='producto',
        null=True,
        blank=True,
    )
    # Fila de la lista de precios del taller (opcional, para trazabilidad).
    # SET_NULL: reordenar la lista de precios jamas toca una venta ya hecha.
    item_service = models.ForeignKey(
        'precios_service.ItemService',
        on_delete=models.SET_NULL,
        related_name='items_venta',
        verbose_name='item de la lista de service',
        null=True,
        blank=True,
    )
    descripcion = models.CharField('descripcion', max_length=200, blank=True)
    cantidad = models.PositiveIntegerField('cantidad', default=1)
    precio_unitario = models.DecimalField('precio unitario ($)', max_digits=14, decimal_places=2)

    class Meta:
        db_table = 'inventario_ventas_items'
        verbose_name = 'item de venta'
        verbose_name_plural = 'items de venta'
        ordering = ('id',)

    def __str__(self):
        return f'{self.detalle} x{self.cantidad}'

    @property
    def detalle(self) -> str:
        """Lo vendido, en texto: la foto guardada o el nombre del producto.

        Las ventas viejas no tienen `descripcion` (son todas de producto): para
        esas sigue valiendo el nombre del catalogo, como siempre.
        """
        if self.descripcion:
            return self.descripcion
        if self.producto_id:
            return self.producto.nombre
        return 'Item'

    @property
    def subtotal(self):
        return self.cantidad * self.precio_unitario


class PagoVenta(models.Model):
    """Una parte del cobro de la venta: un medio de pago y su monto.

    En el mostrador es normal cobrar una venta con VARIOS medios a la vez (una
    parte en efectivo, el resto por transferencia). Cada parte es una fila y la
    suma de las partes es exactamente el total de la venta; cuando se cobra con
    un solo medio hay una sola fila, asi el dato es siempre uniforme.

    En el arqueo, CADA parte entra como su propio movimiento de caja con su
    medio (todos apuntando a la misma venta): es lo que hace que el conteo por
    medio de pago siga cerrando. `Venta.forma_pago` queda como el medio
    PRINCIPAL (el de mayor monto), para los reportes y filtros de siempre.
    """

    venta = models.ForeignKey(
        Venta,
        on_delete=models.CASCADE,
        related_name='pagos',
        verbose_name='venta',
    )
    medio = models.CharField('medio de pago', max_length=20, choices=Venta.FormaPago.choices)
    monto = models.DecimalField('monto ($)', max_digits=14, decimal_places=2)

    class Meta:
        db_table = 'inventario_ventas_pagos'
        verbose_name = 'pago de la venta'
        verbose_name_plural = 'pagos de la venta'
        ordering = ('id',)

    def __str__(self):
        return f'{self.get_medio_display()} ${self.monto}'


# ===== Operaciones =====

def aplicar_ajuste(producto, sucursal, *, delta=None, cantidad=None, tipo='',
                   nota='', usuario=None, permitir_negativo=False):
    """Cambia el stock de un producto en una sucursal y registra el movimiento.

    Se pasa `delta` (suma/resta) O `cantidad` (fija el valor final). Por defecto
    nunca deja la cantidad por debajo de 0 (ValidationError legible); con
    `permitir_negativo` (venta confirmada con faltante) el stock puede quedar
    negativo — la senial de que el conteo del sistema esta atrasado y hay que
    corregirlo. Si el cambio neto es 0 no se registra movimiento. Devuelve
    (fila_stock, movimiento | None).
    """
    with transaction.atomic():
        fila, _ = StockProducto.objects.select_for_update().get_or_create(
            producto=producto, sucursal=sucursal,
        )
        informa_cantidad = cantidad is not None
        if informa_cantidad:
            delta = int(cantidad) - fila.cantidad
        delta = int(delta or 0)
        nueva = fila.cantidad + delta
        if nueva < 0 and not permitir_negativo:
            raise ValidationError(
                f'No hay stock suficiente de "{producto.nombre}" en {sucursal.nombre}: '
                f'hay {fila.cantidad} y el ajuste resta {-delta}.'
            )
        if not tipo:
            if delta > 0:
                tipo = MovimientoStock.Tipo.INGRESO
            elif delta < 0:
                tipo = MovimientoStock.Tipo.EGRESO
            else:
                tipo = MovimientoStock.Tipo.AJUSTE
        fila.cantidad = nueva
        if fila.sin_dato and (delta != 0 or informa_cantidad):
            # Alguien conto de verdad (aunque haya contado 0): ya esta informado.
            fila.sin_dato = False
        if usuario is not None:
            fila.actualizado_por = usuario
        fila.save(update_fields=['cantidad', 'sin_dato', 'actualizado_por'])
        movimiento = None
        if delta != 0:
            movimiento = MovimientoStock.objects.create(
                producto=producto,
                sucursal=sucursal,
                tipo=tipo,
                delta=delta,
                resultante=nueva,
                nota=nota,
                creado_por=usuario,
                actualizado_por=usuario,
            )
        return fila, movimiento


def _normalizar_item_venta(item):
    """Deja cualquier renglon de venta con la misma forma de diccionario.

    Acepta el formato historico ``(producto, cantidad, precio_unitario)`` —una
    venta de mercaderia— y el completo, que ademas puede traer `tipo`,
    `descripcion` e `item_service` (services y items libres).
    """
    if not isinstance(item, dict):
        producto, cantidad, precio_unitario = item
        item = {'producto': producto, 'cantidad': cantidad, 'precio_unitario': precio_unitario}

    producto = item.get('producto')
    # Sin `tipo` explicito, manda lo que vino: con producto es mercaderia.
    tipo = item.get('tipo') or (ItemVenta.Tipo.PRODUCTO if producto else ItemVenta.Tipo.OTRO)
    descripcion = (item.get('descripcion') or '').strip()
    if tipo != ItemVenta.Tipo.PRODUCTO:
        producto = None  # solo la mercaderia del catalogo mueve stock
    elif producto is None:
        raise ValidationError('Un renglon de producto necesita el producto del catalogo.')
    if not descripcion:
        if producto is not None:
            descripcion = producto.nombre
        else:
            raise ValidationError('Un renglon de service u otro necesita una descripcion.')

    cantidad = int(item.get('cantidad') or 0)
    if cantidad <= 0:
        raise ValidationError(f'Cantidad invalida para "{descripcion}".')
    return {
        'tipo': tipo,
        'producto': producto,
        'item_service': item.get('item_service') if tipo == ItemVenta.Tipo.SERVICE else None,
        'descripcion': descripcion[:200],
        'cantidad': cantidad,
        'precio_unitario': Decimal(str(item.get('precio_unitario') or 0)),
    }


def _normalizar_pagos(pagos, *, forma_pago, total):
    """Valida el cobro y lo devuelve como [(medio, monto)] que suma `total`.

    Sin `pagos` (el caso comun: un solo medio) devuelve la venta entera en
    `forma_pago`. Con varios, las partes en cero se descartan, las repetidas se
    suman en una sola (un medio = un movimiento de caja) y el total tiene que
    coincidir con el de la venta: si no, no se registra nada, porque una venta
    cuyos pagos no cierran romperia el arqueo.
    """
    medios_validos = set(Venta.FormaPago.values)
    partes = {}
    for pago in pagos or []:
        medio = (pago.get('medio') or '').strip()
        if medio not in medios_validos:
            raise ValidationError(f'Medio de pago desconocido: "{medio}".')
        monto = Decimal(str(pago.get('monto') or 0))
        if monto < 0:
            raise ValidationError('Los montos de los pagos no pueden ser negativos.')
        if monto == 0:
            continue
        partes[medio] = partes.get(medio, Decimal('0')) + monto

    if not partes:
        return [(forma_pago or Venta.FormaPago.EFECTIVO, total)]

    suma = sum(partes.values(), Decimal('0'))
    if suma != total:
        raise ValidationError(
            f'Los pagos suman ${suma} y la venta es de ${total}: tienen que coincidir.'
        )
    return list(partes.items())


def registrar_venta(sucursal, items, *, forma_pago='', facturacion='', nota='',
                    cliente=None, usuario=None, permitir_faltante=False, pagos=None):
    """Crea la venta y descuenta el stock, todo o nada.

    `items` es una lista de renglones: ``(producto, cantidad, precio_unitario)``
    o un diccionario con `tipo` (producto / service / otro), `descripcion` y,
    para los services, `item_service`. SOLO los renglones de producto mueven
    stock: un service o un item libre se cobran igual sin tocar el inventario.

    Si algun producto no tiene stock suficiente en la sucursal, NO se registra
    nada (ValidationError legible con el nombre del producto) — salvo que venga
    `permitir_faltante` (el vendedor ya confirmo la advertencia): la venta
    NUNCA se pierde por un conteo atrasado y el stock queda en negativo para
    corregirlo despues en Inventario.

    `cliente` es opcional: si viene, la venta queda en su historial de compras.

    `pagos` permite cobrar con VARIOS medios a la vez (``[{'medio', 'monto'}]``):
    tiene que sumar el total exacto. Sin `pagos`, la venta entera va en
    `forma_pago`, como siempre. En los dos casos queda al menos una fila en
    `PagoVenta` y `forma_pago` termina siendo el medio de mayor monto.
    """
    if not items:
        raise ValidationError('La venta no tiene items.')
    renglones = [_normalizar_item_venta(item) for item in items]
    with transaction.atomic():
        venta = Venta.objects.create(
            sucursal=sucursal,
            forma_pago=forma_pago or Venta.FormaPago.EFECTIVO,
            facturacion=facturacion or Venta.Facturacion.SIN_FACTURA,
            nota=nota,
            cliente=cliente,
            creado_por=usuario,
            actualizado_por=usuario,
        )
        total = Decimal('0')
        for renglon in renglones:
            ItemVenta.objects.create(venta=venta, **renglon)
            total += renglon['cantidad'] * renglon['precio_unitario']
            if renglon['producto'] is None:
                continue  # service o item libre: no hay stock que mover
            aplicar_ajuste(
                renglon['producto'], sucursal,
                delta=-renglon['cantidad'],
                tipo=MovimientoStock.Tipo.VENTA,
                nota=f'Venta #{venta.pk}',
                usuario=usuario,
                permitir_negativo=permitir_faltante,
            )
        venta.total = total
        # El cobro se resuelve al final, cuando ya se sabe el total de la venta.
        partes = _normalizar_pagos(pagos, forma_pago=venta.forma_pago, total=total)
        PagoVenta.objects.bulk_create(
            [PagoVenta(venta=venta, medio=medio, monto=monto) for medio, monto in partes],
        )
        # El medio principal (el de mayor monto) es el que sigue viendo todo lo
        # que ya leia `forma_pago`: reportes, filtros del admin e historiales.
        venta.forma_pago = max(partes, key=lambda parte: parte[1])[0]
        venta.save(update_fields=['total', 'forma_pago'])
    return venta


def aplicar_transferencia(producto, origen, destino, cantidad, *, nota='', usuario=None):
    """Mueve unidades entre sucursales (dos movimientos atomicos)."""
    cantidad = int(cantidad)
    if cantidad <= 0:
        raise ValidationError('La cantidad a transferir tiene que ser mayor a 0.')
    if origen.pk == destino.pk:
        raise ValidationError('La sucursal de origen y la de destino son la misma.')
    tipo = MovimientoStock.Tipo.TRANSFERENCIA
    with transaction.atomic():
        salida, _ = aplicar_ajuste(
            producto, origen, delta=-cantidad, tipo=tipo,
            nota=nota or f'→ {destino.nombre}', usuario=usuario,
        )
        entrada, _ = aplicar_ajuste(
            producto, destino, delta=cantidad, tipo=tipo,
            nota=nota or f'← {origen.nombre}', usuario=usuario,
        )
    return salida, entrada
