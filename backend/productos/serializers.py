from rest_framework import serializers

from precios_service.models import ConfiguracionService, Dispositivo

from .models import (
    CategoriaProducto,
    ConfiguracionProductos,
    Producto,
    resolver_precio_producto,
)


def _campo_precio():
    return serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=0,
        coerce_to_string=False, required=False, allow_null=True,
    )


class ConfiguracionProductosSerializer(serializers.ModelSerializer):
    """Parametros del catalogo. `dolar` es la cotizacion UNICA del negocio
    (la misma de Precios de Service): editarla aca recalcula ambas listas."""

    dolar = serializers.DecimalField(
        max_digits=10, decimal_places=2, min_value=0, coerce_to_string=False,
        required=False,
    )
    descuento_cash_pct = serializers.DecimalField(
        max_digits=5, decimal_places=2, min_value=0, max_value=100, coerce_to_string=False,
    )

    class Meta:
        model = ConfiguracionProductos
        fields = (
            'dolar', 'descuento_cash_pct', 'redondeo_lista_ars', 'redondeo_cash_ars',
            'actualizado',
        )
        read_only_fields = ('actualizado',)

    def update(self, instance, validated_data):
        dolar = validated_data.pop('dolar', None)
        if dolar is not None:
            compartida = ConfiguracionService.obtener()
            compartida.dolar = dolar
            compartida.save(update_fields=['dolar'])
        return super().update(instance, validated_data)


class CategoriaProductoSerializer(serializers.ModelSerializer):
    """Categoria (o subgrupo, si tiene `padre`)."""

    descuento_cash_pct = serializers.DecimalField(
        max_digits=5, decimal_places=2, min_value=0, max_value=100,
        coerce_to_string=False, required=False, allow_null=True,
    )
    padre = serializers.PrimaryKeyRelatedField(
        queryset=CategoriaProducto.objects.all(), required=False, allow_null=True,
    )

    class Meta:
        model = CategoriaProducto
        fields = (
            'id', 'padre', 'nombre', 'nota', 'descuento_cash_pct', 'redondeo_ars',
            'muestra_cash', 'tarifa_cuotas', 'es_equipo', 'orden', 'activo',
            'creado', 'actualizado',
        )
        read_only_fields = ('creado', 'actualizado')

    def validate_nombre(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('El nombre es obligatorio.')
        return value

    def validate_padre(self, value):
        if value is not None:
            if self.instance is not None and value.pk == self.instance.pk:
                raise serializers.ValidationError('Una categoria no puede ser su propia madre.')
            if value.padre_id:
                raise serializers.ValidationError(
                    'Maximo dos niveles: la madre no puede ser a su vez un subgrupo.'
                )
            if self.instance is not None and self.instance.hijas.exists():
                raise serializers.ValidationError(
                    'Esta categoria tiene subgrupos: no puede convertirse en subgrupo.'
                )
        return value


class ProductoSerializer(serializers.ModelSerializer):
    """Producto con sus 4 precios efectivos resueltos en `efectivo`."""

    categoria = serializers.PrimaryKeyRelatedField(queryset=CategoriaProducto.objects.all())
    dispositivos = serializers.PrimaryKeyRelatedField(
        queryset=Dispositivo.objects.all(), many=True, required=False,
    )
    precio_lista_usd = _campo_precio()
    precio_cash_usd = _campo_precio()
    precio_lista_ars = _campo_precio()
    precio_cash_ars = _campo_precio()

    class Meta:
        model = Producto
        fields = (
            'id', 'categoria', 'nombre', 'marca', 'calidad', 'nota',
            'a_pedido', 'nuevo', 'dispositivos',
            'precio_lista_usd', 'precio_cash_usd', 'precio_lista_ars', 'precio_cash_ars',
            'orden', 'activo',
        )

    def validate_nombre(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('El nombre es obligatorio.')
        return value

    def _config(self):
        return self.context.get('config') or ConfiguracionProductos.obtener()

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['efectivo'] = resolver_precio_producto(instance, self._config())
        return data

    def create(self, validated_data):
        dispositivos = validated_data.pop('dispositivos', [])
        producto = Producto.objects.create(**validated_data)
        producto.dispositivos.set(dispositivos)
        return producto

    def update(self, instance, validated_data):
        dispositivos = validated_data.pop('dispositivos', None)
        for campo, valor in validated_data.items():
            setattr(instance, campo, valor)
        instance.save()
        if dispositivos is not None:
            instance.dispositivos.set(dispositivos)
        return instance
