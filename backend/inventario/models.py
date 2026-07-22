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
    """Un local del negocio (Solar, Centro, ...)."""

    nombre = models.CharField('nombre', max_length=120)
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
    """Un renglon de la venta, con el precio al momento de vender."""

    venta = models.ForeignKey(
        Venta,
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name='venta',
    )
    producto = models.ForeignKey(
        'productos.Producto',
        on_delete=models.PROTECT,
        related_name='items_venta',
        verbose_name='producto',
    )
    cantidad = models.PositiveIntegerField('cantidad', default=1)
    precio_unitario = models.DecimalField('precio unitario ($)', max_digits=14, decimal_places=2)

    class Meta:
        db_table = 'inventario_ventas_items'
        verbose_name = 'item de venta'
        verbose_name_plural = 'items de venta'
        ordering = ('id',)

    def __str__(self):
        return f'{self.producto} x{self.cantidad}'

    @property
    def subtotal(self):
        return self.cantidad * self.precio_unitario


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


def registrar_venta(sucursal, items, *, forma_pago='', facturacion='', nota='',
                    usuario=None, permitir_faltante=False):
    """Crea la venta y descuenta el stock, todo o nada.

    `items` es una lista de (producto, cantidad, precio_unitario). Si algun
    producto no tiene stock suficiente en la sucursal, NO se registra nada
    (ValidationError legible con el nombre del producto) — salvo que venga
    `permitir_faltante` (el vendedor ya confirmo la advertencia): la venta
    NUNCA se pierde por un conteo atrasado y el stock queda en negativo para
    corregirlo despues en Inventario.
    """
    if not items:
        raise ValidationError('La venta no tiene items.')
    with transaction.atomic():
        venta = Venta.objects.create(
            sucursal=sucursal,
            forma_pago=forma_pago or Venta.FormaPago.EFECTIVO,
            facturacion=facturacion or Venta.Facturacion.SIN_FACTURA,
            nota=nota,
            creado_por=usuario,
            actualizado_por=usuario,
        )
        total = Decimal('0')
        for producto, cantidad, precio_unitario in items:
            cantidad = int(cantidad)
            if cantidad <= 0:
                raise ValidationError(f'Cantidad invalida para "{producto.nombre}".')
            precio = Decimal(str(precio_unitario))
            ItemVenta.objects.create(
                venta=venta, producto=producto, cantidad=cantidad, precio_unitario=precio,
            )
            total += cantidad * precio
            aplicar_ajuste(
                producto, sucursal,
                delta=-cantidad,
                tipo=MovimientoStock.Tipo.VENTA,
                nota=f'Venta #{venta.pk}',
                usuario=usuario,
                permitir_negativo=permitir_faltante,
            )
        venta.total = total
        venta.save(update_fields=['total'])
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
