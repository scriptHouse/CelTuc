from decimal import Decimal

from rest_framework import serializers

from facturacion.models import Cliente, Emisor
from precios_service.models import ItemService
from productos.models import CategoriaProducto, Producto

from .importacion import MAX_UNIDADES
from .models import ItemVenta, MovimientoStock, PagoVenta, StockProducto, Sucursal, Venta


class SucursalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Sucursal
        fields = ('id', 'nombre', 'codigo_postal', 'orden', 'activa', 'creado', 'actualizado')
        read_only_fields = ('creado', 'actualizado')

    def validate_nombre(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('El nombre es obligatorio.')
        return value


class StockProductoSerializer(serializers.ModelSerializer):
    """Fila compacta: el front la cruza con el catalogo de productos por id."""

    producto = serializers.PrimaryKeyRelatedField(read_only=True)
    sucursal = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = StockProducto
        fields = ('id', 'producto', 'sucursal', 'cantidad', 'stock_minimo', 'sin_dato', 'actualizado')


class MovimientoStockSerializer(serializers.ModelSerializer):
    producto = serializers.PrimaryKeyRelatedField(read_only=True)
    sucursal = serializers.PrimaryKeyRelatedField(read_only=True)
    usuario = serializers.SerializerMethodField()

    class Meta:
        model = MovimientoStock
        fields = (
            'id', 'producto', 'sucursal', 'tipo', 'delta', 'resultante',
            'nota', 'usuario', 'creado',
        )

    def get_usuario(self, obj):
        return obj.creado_por.username if obj.creado_por_id else None


def _campo_sucursal():
    return serializers.PrimaryKeyRelatedField(queryset=Sucursal.objects.filter(activa=True))


class AjusteStockSerializer(serializers.Serializer):
    """Entrada de POST /stock/ajustar/.

    `delta` suma/resta; `cantidad` fija el valor final (excluyentes). Ademas —
    o en su lugar — puede venir `stock_minimo` para actualizar la alerta.
    """

    producto = serializers.PrimaryKeyRelatedField(queryset=Producto.objects.all())
    sucursal = _campo_sucursal()
    delta = serializers.IntegerField(required=False)
    cantidad = serializers.IntegerField(required=False, min_value=0)
    tipo = serializers.ChoiceField(
        choices=[
            MovimientoStock.Tipo.INGRESO,
            MovimientoStock.Tipo.EGRESO,
            MovimientoStock.Tipo.AJUSTE,
        ],
        required=False,
        allow_blank=True,
    )
    stock_minimo = serializers.IntegerField(required=False, allow_null=True, min_value=0)
    nota = serializers.CharField(required=False, allow_blank=True, max_length=200)

    def validate(self, data):
        tiene_delta = 'delta' in data
        tiene_cantidad = 'cantidad' in data
        if tiene_delta and tiene_cantidad:
            raise serializers.ValidationError('Mandá `delta` o `cantidad`, no los dos.')
        if not tiene_delta and not tiene_cantidad and 'stock_minimo' not in data:
            raise serializers.ValidationError('No hay nada para cambiar.')
        return data


class ItemVentaSerializer(serializers.ModelSerializer):
    producto = serializers.PrimaryKeyRelatedField(read_only=True)
    item_service = serializers.PrimaryKeyRelatedField(read_only=True)
    # `nombre` es lo vendido en texto. Sale de la descripcion guardada y, en las
    # ventas viejas (todas de producto, sin descripcion), del catalogo.
    nombre = serializers.CharField(source='detalle', read_only=True)
    precio_unitario = serializers.DecimalField(
        max_digits=14, decimal_places=2, coerce_to_string=False,
    )
    subtotal = serializers.DecimalField(
        max_digits=16, decimal_places=2, read_only=True, coerce_to_string=False,
    )

    class Meta:
        model = ItemVenta
        fields = (
            'tipo', 'producto', 'item_service', 'nombre', 'descripcion',
            'cantidad', 'precio_unitario', 'subtotal',
        )


class PagoVentaSerializer(serializers.ModelSerializer):
    """Una parte del cobro (medio + facturacion + monto) de una venta."""

    monto = serializers.DecimalField(max_digits=14, decimal_places=2, coerce_to_string=False)

    emisor_nombre = serializers.CharField(source='emisor.nombre', read_only=True, default=None)

    class Meta:
        model = PagoVenta
        fields = ('medio', 'facturacion', 'emisor', 'emisor_nombre', 'monto')


class VentaSerializer(serializers.ModelSerializer):
    sucursal = serializers.PrimaryKeyRelatedField(read_only=True)
    sucursal_nombre = serializers.CharField(source='sucursal.nombre', read_only=True)
    total = serializers.DecimalField(max_digits=14, decimal_places=2, coerce_to_string=False)
    usuario = serializers.SerializerMethodField()
    items = ItemVentaSerializer(many=True, read_only=True)
    pagos = PagoVentaSerializer(many=True, read_only=True)
    cliente = serializers.PrimaryKeyRelatedField(read_only=True)
    cliente_nombre = serializers.CharField(source='cliente.nombre', read_only=True, default=None)
    comprobante = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = Venta
        fields = (
            'id', 'sucursal', 'sucursal_nombre', 'forma_pago', 'pagos', 'facturacion', 'nota',
            'total', 'usuario', 'items', 'cliente', 'cliente_nombre', 'comprobante', 'creado',
        )

    def get_usuario(self, obj):
        return obj.creado_por.username if obj.creado_por_id else None


class ItemVentaInputSerializer(serializers.Serializer):
    """Un renglon de la venta: mercaderia, service o item libre.

    `tipo` es opcional para no romper a quien mande solo `producto` (el formato
    de siempre): sin tipo, con producto es mercaderia.
    """

    tipo = serializers.ChoiceField(choices=ItemVenta.Tipo.choices, required=False)
    producto = serializers.PrimaryKeyRelatedField(
        queryset=Producto.objects.all(), required=False, allow_null=True,
    )
    item_service = serializers.PrimaryKeyRelatedField(
        queryset=ItemService.objects.all(), required=False, allow_null=True,
    )
    descripcion = serializers.CharField(max_length=200, required=False, allow_blank=True)
    cantidad = serializers.IntegerField(min_value=1)
    precio_unitario = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=0)

    def validate(self, data):
        tipo = data.get('tipo') or (
            ItemVenta.Tipo.PRODUCTO if data.get('producto') else ItemVenta.Tipo.OTRO
        )
        if tipo == ItemVenta.Tipo.PRODUCTO and not data.get('producto'):
            raise serializers.ValidationError('Elegí el producto del catálogo.')
        if tipo != ItemVenta.Tipo.PRODUCTO and not (data.get('descripcion') or '').strip():
            raise serializers.ValidationError('Escribí qué se cobra en este renglón.')
        data['tipo'] = tipo
        return data


class PagoVentaInputSerializer(serializers.Serializer):
    """Una parte del cobro al registrar la venta: medio + facturacion + monto.

    Sin `facturacion` la parte hereda la de la venta (el caso comun: todo se
    factura igual y solo se divide el medio de pago).
    """

    medio = serializers.ChoiceField(choices=Venta.FormaPago.choices)
    facturacion = serializers.ChoiceField(choices=Venta.Facturacion.choices, required=False)
    # Cuenta que emite ESTA parte (solo si se factura).
    emisor = serializers.PrimaryKeyRelatedField(
        queryset=Emisor.objects.all(), required=False, allow_null=True,
    )
    monto = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal('0'))


class ClienteVentaSerializer(serializers.Serializer):
    """Datos del cliente cargados a mano en la venta (cliente nuevo o sin elegir).

    Se dan de alta con la MISMA lógica que los de una factura (`facturacion.
    clientes.registrar_cliente`): se reconoce por documento, teléfono o email, y
    sin ninguno de los tres no se registra nada — la venta se guarda igual.
    """

    nombre = serializers.CharField(max_length=160, required=False, allow_blank=True)
    telefono = serializers.CharField(max_length=30, required=False, allow_blank=True)
    email = serializers.EmailField(max_length=254, required=False, allow_blank=True)
    doc_tipo = serializers.CharField(max_length=4, required=False, allow_blank=True)
    doc_numero = serializers.CharField(max_length=11, required=False, allow_blank=True)
    condicion = serializers.CharField(max_length=30, required=False, allow_blank=True)


class CrearVentaSerializer(serializers.Serializer):
    """Entrada de POST /ventas/: la venta de mostrador que descuenta stock."""

    sucursal = _campo_sucursal()
    # A quien se le vende (opcional). `cliente` es uno ya guardado; si no, se
    # pueden mandar los datos en `cliente_datos` y se crea/actualiza solo.
    cliente = serializers.PrimaryKeyRelatedField(
        queryset=Cliente.objects.all(), required=False, allow_null=True,
    )
    cliente_datos = ClienteVentaSerializer(required=False, allow_null=True)
    forma_pago = serializers.ChoiceField(
        choices=Venta.FormaPago.choices, default=Venta.FormaPago.EFECTIVO,
    )
    # Cobro con varios medios a la vez (opcional). Si viene, tiene que sumar el
    # total exacto de la venta; si no viene, la venta entera va en `forma_pago`.
    pagos = PagoVentaInputSerializer(many=True, required=False)
    facturacion = serializers.ChoiceField(
        choices=Venta.Facturacion.choices, default=Venta.Facturacion.SIN_FACTURA,
    )
    nota = serializers.CharField(required=False, allow_blank=True, max_length=200)
    items = ItemVentaInputSerializer(many=True)
    # Caja donde anotar la venta en el arqueo (id; opcional). Se valida en la
    # vista con import tardio para no acoplar inventario a la app caja.
    caja = serializers.IntegerField(required=False, allow_null=True)
    # True = el vendedor ya confirmo la advertencia de stock insuficiente: la
    # venta se registra igual y el stock queda en negativo.
    permitir_faltante = serializers.BooleanField(required=False, default=False)

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError('Agregá al menos un producto.')
        return value


class TransferenciaStockSerializer(serializers.Serializer):
    """Entrada de POST /stock/transferir/."""

    producto = serializers.PrimaryKeyRelatedField(queryset=Producto.objects.all())
    origen = _campo_sucursal()
    destino = _campo_sucursal()
    cantidad = serializers.IntegerField(min_value=1)
    nota = serializers.CharField(required=False, allow_blank=True, max_length=200)

    def validate(self, data):
        if data['origen'].pk == data['destino'].pk:
            raise serializers.ValidationError('La sucursal de origen y la de destino son la misma.')
        return data


# ===== Importacion de stock por sucursal =====

# La planilla del negocio ronda 1 MB; el techo deja margen de sobra sin dejar
# que una subida enorme ocupe memoria del servidor.
MAX_MB_PLANILLA = 10


class AnalizarImportacionSerializer(serializers.Serializer):
    """Entrada de POST /stock/importar/analizar/: la planilla de una sucursal."""

    sucursal = _campo_sucursal()
    archivo = serializers.FileField()

    def validate_archivo(self, value):
        if not value.name.lower().endswith('.xlsx'):
            raise serializers.ValidationError(
                'El archivo tiene que ser un Excel .xlsx. Si es un .xls o un Google '
                'Sheets, guardalo como .xlsx y volvé a subirlo.'
            )
        if value.size > MAX_MB_PLANILLA * 1024 * 1024:
            raise serializers.ValidationError(
                f'El archivo pesa demasiado (máximo {MAX_MB_PLANILLA} MB).'
            )
        return value


class ProductoNuevoImportacionSerializer(serializers.Serializer):
    """El alta de catalogo de una fila que la planilla trae y no existe todavia."""

    nombre = serializers.CharField(max_length=200)
    categoria = serializers.PrimaryKeyRelatedField(
        queryset=CategoriaProducto.objects.filter(activo=True),
    )
    lista_usd = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal('0'),
        required=False, allow_null=True,
    )

    def validate_nombre(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('El producto necesita un nombre.')
        return value


class ItemImportacionSerializer(serializers.Serializer):
    """Una fila elegida para aplicar: producto existente o alta + cantidad."""

    # Numero de fila en el Excel: solo informativo, para poder rastrear.
    fila = serializers.IntegerField(required=False)
    producto = serializers.PrimaryKeyRelatedField(
        queryset=Producto.objects.all(), required=False, allow_null=True,
    )
    crear = ProductoNuevoImportacionSerializer(required=False, allow_null=True)
    cantidad = serializers.IntegerField(min_value=0, max_value=MAX_UNIDADES)
    stock_minimo = serializers.IntegerField(required=False, allow_null=True, min_value=0)

    def validate(self, data):
        if not data.get('producto') and not data.get('crear'):
            raise serializers.ValidationError(
                'Cada fila tiene que apuntar a un producto del catálogo o traer el alta.'
            )
        if data.get('producto') and data.get('crear'):
            raise serializers.ValidationError(
                'Una fila no puede ser a la vez un producto existente y uno nuevo.'
            )
        return data


class AplicarImportacionSerializer(serializers.Serializer):
    """Entrada de POST /stock/importar/aplicar/: las filas que se confirmaron."""

    sucursal = _campo_sucursal()
    # Queda en la nota del kardex: de que planilla salio cada movimiento.
    archivo = serializers.CharField(required=False, allow_blank=True, max_length=120)
    items = ItemImportacionSerializer(many=True)

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError('No hay ninguna fila marcada para aplicar.')
        vistos = set()
        for item in value:
            producto = item.get('producto')
            if producto is None:
                continue
            if producto.pk in vistos:
                raise serializers.ValidationError(
                    f'El producto "{producto.nombre}" viene repetido: dejá una sola fila.'
                )
            vistos.add(producto.pk)
        return value


class IngresoCompraventaSerializer(serializers.Serializer):
    """Entrada de POST /compraventa/ingresar/: el equipo usado de un contrato.

    Los textos vienen tal cual se cargaron en el documento; aca solo se
    recortan espacios y se exige poder identificar el equipo (marca o modelo).
    """

    marca = serializers.CharField(required=False, allow_blank=True, max_length=60)
    modelo = serializers.CharField(required=False, allow_blank=True, max_length=120)
    color = serializers.CharField(required=False, allow_blank=True, max_length=60)
    imei1 = serializers.CharField(required=False, allow_blank=True, max_length=40)
    imei2 = serializers.CharField(required=False, allow_blank=True, max_length=40)
    cupon = serializers.CharField(required=False, allow_blank=True, max_length=40)
    bateria = serializers.IntegerField(required=False, allow_null=True, min_value=0, max_value=100)
    sucursal = _campo_sucursal()

    def validate(self, data):
        for campo in ('marca', 'modelo', 'color', 'imei1', 'imei2', 'cupon'):
            data[campo] = (data.get(campo) or '').strip()
        if not data['marca'] and not data['modelo']:
            raise serializers.ValidationError('Cargá al menos la marca o el modelo del equipo.')
        return data
