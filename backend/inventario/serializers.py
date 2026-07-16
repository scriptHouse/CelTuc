from rest_framework import serializers

from productos.models import Producto

from .models import ItemVenta, MovimientoStock, StockProducto, Sucursal, Venta


class SucursalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Sucursal
        fields = ('id', 'nombre', 'orden', 'activa', 'creado', 'actualizado')
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
    nombre = serializers.CharField(source='producto.nombre', read_only=True)
    precio_unitario = serializers.DecimalField(
        max_digits=14, decimal_places=2, coerce_to_string=False,
    )
    subtotal = serializers.DecimalField(
        max_digits=16, decimal_places=2, read_only=True, coerce_to_string=False,
    )

    class Meta:
        model = ItemVenta
        fields = ('producto', 'nombre', 'cantidad', 'precio_unitario', 'subtotal')


class VentaSerializer(serializers.ModelSerializer):
    sucursal = serializers.PrimaryKeyRelatedField(read_only=True)
    sucursal_nombre = serializers.CharField(source='sucursal.nombre', read_only=True)
    total = serializers.DecimalField(max_digits=14, decimal_places=2, coerce_to_string=False)
    usuario = serializers.SerializerMethodField()
    items = ItemVentaSerializer(many=True, read_only=True)

    class Meta:
        model = Venta
        fields = (
            'id', 'sucursal', 'sucursal_nombre', 'forma_pago', 'nota', 'total',
            'usuario', 'items', 'creado',
        )

    def get_usuario(self, obj):
        return obj.creado_por.username if obj.creado_por_id else None


class ItemVentaInputSerializer(serializers.Serializer):
    producto = serializers.PrimaryKeyRelatedField(queryset=Producto.objects.all())
    cantidad = serializers.IntegerField(min_value=1)
    precio_unitario = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=0)


class CrearVentaSerializer(serializers.Serializer):
    """Entrada de POST /ventas/: la venta de mostrador que descuenta stock."""

    sucursal = _campo_sucursal()
    forma_pago = serializers.ChoiceField(
        choices=Venta.FormaPago.choices, default=Venta.FormaPago.EFECTIVO,
    )
    nota = serializers.CharField(required=False, allow_blank=True, max_length=200)
    items = ItemVentaInputSerializer(many=True)
    # Caja donde anotar la venta en el arqueo (id; opcional). Se valida en la
    # vista con import tardio para no acoplar inventario a la app caja.
    caja = serializers.IntegerField(required=False, allow_null=True)

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
