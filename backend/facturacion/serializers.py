"""Serializers de facturacion.

- :class:`EmisorSerializer`: las credenciales (certificado/clave) son write-only,
  nunca se devuelven; en la lectura solo se informa ``tiene_credenciales``.
- :class:`CrearComprobanteSerializer`: entrada para emitir (la emision real la hace
  ``arca.servicio.emitir``, no este serializer).
- :class:`ComprobanteListSerializer` / :class:`ComprobanteDetailSerializer`: salida.
- :class:`ActualizarComprobanteSerializer`: lo unico editable de un comprobante ya
  emitido es el estado de cobro y las observaciones (es inmutable a nivel fiscal).
"""
import re
from decimal import Decimal

from django.db.models import Count, Max, Sum
from rest_framework import serializers

from inventario.models import Sucursal
from productos.models import Producto

from .arca import qr
from .models import Cliente, Comprobante, Emisor, ItemComprobante


def _solo_digitos(valor: str) -> str:
    return re.sub(r'\D', '', valor or '')


# ===== Emisores =====

class EmisorSerializer(serializers.ModelSerializer):
    """Emisor con credenciales write-only.

    Al editar, si ``certificado``/``clave_privada`` llegan vacios NO se pisan los
    guardados (asi se pueden cambiar otros datos sin reenviar el certificado).
    """

    # CUIT propio (sin el validador/max_length del modelo) para poder aceptar el
    # numero con guiones y normalizarlo nosotros en validate_cuit.
    cuit = serializers.CharField(max_length=20)
    certificado = serializers.CharField(write_only=True, required=False, allow_blank=True)
    clave_privada = serializers.CharField(write_only=True, required=False, allow_blank=True)
    tiene_credenciales = serializers.BooleanField(read_only=True)

    class Meta:
        model = Emisor
        fields = (
            'id', 'nombre', 'condicion', 'cuit', 'punto_venta', 'produccion',
            'activo', 'certificado', 'clave_privada', 'tiene_credenciales',
            'creado', 'actualizado',
        )
        read_only_fields = ('creado', 'actualizado')

    def validate_nombre(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('El nombre es obligatorio.')
        return value

    def validate_cuit(self, value):
        digitos = _solo_digitos(value)
        if len(digitos) != 11:
            raise serializers.ValidationError('El CUIT debe tener 11 digitos.')
        return digitos

    def update(self, instance, validated_data):
        # Credenciales en blanco = "no cambiar".
        if not validated_data.get('certificado'):
            validated_data.pop('certificado', None)
        if not validated_data.get('clave_privada'):
            validated_data.pop('clave_privada', None)
        return super().update(instance, validated_data)


# ===== Items y comprobantes =====

class ItemComprobanteSerializer(serializers.ModelSerializer):
    cantidad = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal('0'), coerce_to_string=False,
    )
    precio_unitario = serializers.DecimalField(
        max_digits=14, decimal_places=2, min_value=Decimal('0'), coerce_to_string=False,
    )
    subtotal = serializers.DecimalField(
        max_digits=16, decimal_places=2, read_only=True, coerce_to_string=False,
    )
    # Producto del catalogo (opcional, solo entrada): si ademas viene
    # `sucursal_stock` en el comprobante, el item descuenta stock al emitir.
    producto = serializers.PrimaryKeyRelatedField(
        queryset=Producto.objects.all(), required=False, allow_null=True, write_only=True,
    )

    class Meta:
        model = ItemComprobante
        fields = ('id', 'descripcion', 'cantidad', 'precio_unitario', 'subtotal', 'producto')
        read_only_fields = ('id', 'subtotal')

    def validate_descripcion(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('La descripcion es obligatoria.')
        return value


class CrearComprobanteSerializer(serializers.Serializer):
    """Entrada para emitir un comprobante."""

    emisor = serializers.PrimaryKeyRelatedField(queryset=Emisor.objects.all())
    concepto = serializers.ChoiceField(
        choices=Comprobante.Concepto.choices, default=Comprobante.Concepto.PRODUCTOS,
    )
    cliente_nombre = serializers.CharField(max_length=160)
    cliente_doc_tipo = serializers.ChoiceField(
        choices=Comprobante.DocTipo.choices, default=Comprobante.DocTipo.CF,
    )
    cliente_doc_numero = serializers.CharField(max_length=11, required=False, allow_blank=True)
    cliente_condicion = serializers.ChoiceField(choices=Comprobante.CondicionReceptor.choices)
    cliente_telefono = serializers.CharField(max_length=30, required=False, allow_blank=True)
    fecha = serializers.DateField(required=False)
    vencimiento = serializers.DateField(required=False, allow_null=True)
    alicuota_iva = serializers.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal('21'), coerce_to_string=False,
    )
    observaciones = serializers.CharField(required=False, allow_blank=True)
    estado_cobro = serializers.ChoiceField(
        choices=Comprobante.EstadoCobro.choices, default=Comprobante.EstadoCobro.PENDIENTE,
    )
    items = ItemComprobanteSerializer(many=True)
    # Si viene, los items que traen `producto` descuentan stock de esta sucursal
    # despues de emitir (la emision NUNCA falla por stock: se avisa aparte).
    sucursal_stock = serializers.PrimaryKeyRelatedField(
        queryset=Sucursal.objects.filter(activa=True), required=False, allow_null=True,
    )

    def validate_cliente_nombre(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('El nombre del cliente es obligatorio.')
        return value

    def validate_cliente_doc_numero(self, value):
        return _solo_digitos(value)

    def validate_cliente_telefono(self, value):
        return (value or '').strip()

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError('Agrega al menos un item.')
        return value


class ComprobanteListSerializer(serializers.ModelSerializer):
    emisor_nombre = serializers.CharField(source='emisor.nombre', read_only=True)
    numero_formateado = serializers.CharField(read_only=True)
    total = serializers.DecimalField(max_digits=14, decimal_places=2, coerce_to_string=False)

    class Meta:
        model = Comprobante
        fields = (
            'id', 'emisor', 'emisor_nombre', 'tipo', 'punto_venta', 'numero',
            'numero_formateado', 'cliente_nombre', 'cliente_condicion', 'fecha',
            'vencimiento', 'total', 'estado_cobro', 'cae',
        )


class ComprobanteDetailSerializer(serializers.ModelSerializer):
    emisor_nombre = serializers.CharField(source='emisor.nombre', read_only=True)
    emisor_cuit = serializers.CharField(source='emisor.cuit', read_only=True)
    emisor_condicion = serializers.CharField(source='emisor.condicion', read_only=True)
    numero_formateado = serializers.CharField(read_only=True)
    items = ItemComprobanteSerializer(many=True, read_only=True)
    neto = serializers.DecimalField(max_digits=14, decimal_places=2, coerce_to_string=False)
    iva = serializers.DecimalField(max_digits=14, decimal_places=2, coerce_to_string=False)
    total = serializers.DecimalField(max_digits=14, decimal_places=2, coerce_to_string=False)
    alicuota_iva = serializers.DecimalField(max_digits=5, decimal_places=2, coerce_to_string=False)
    qr = serializers.SerializerMethodField()

    class Meta:
        model = Comprobante
        fields = (
            'id', 'emisor', 'emisor_nombre', 'emisor_cuit', 'emisor_condicion',
            'tipo', 'concepto', 'punto_venta',
            'numero', 'numero_formateado', 'cliente_nombre', 'cliente_doc_tipo',
            'cliente_doc_numero', 'cliente_condicion', 'cliente_telefono', 'fecha', 'vencimiento',
            'alicuota_iva', 'neto', 'iva', 'total', 'cae', 'cae_vencimiento',
            'qr_url', 'qr', 'estado_cobro', 'observaciones', 'items', 'creado',
        )

    def get_qr(self, obj):
        """Imagen del QR como data URI (o None si falta la libreria)."""
        return qr.imagen_data_uri(obj.qr_url)


class ActualizarComprobanteSerializer(serializers.ModelSerializer):
    """Edicion permitida de un comprobante ya emitido (no toca lo fiscal)."""

    class Meta:
        model = Comprobante
        fields = ('estado_cobro', 'observaciones')


class EnviarEmailSerializer(serializers.Serializer):
    """Entrada para enviar un comprobante por email. El PDF lo genera el front y
    lo manda en base64 (asi el email adjunta el mismo PDF que se descarga)."""

    email = serializers.EmailField()
    pdf_base64 = serializers.CharField()
    mensaje = serializers.CharField(required=False, allow_blank=True)


# ===== Clientes (base alimentada por las facturas) =====

class ClienteSerializer(serializers.ModelSerializer):
    """Cliente de la base (autocompletado del formulario y lista del gestor).

    Las estadísticas (`cantidad_compras`, `total_gastado`, `ultima_compra`) solo
    se completan si la vista pasa `stats` en el contexto (la lista del gestor lo
    pide con `?stats=1`); en el autocompletado quedan en null y no cuestan nada.
    """

    cantidad_compras = serializers.SerializerMethodField()
    total_gastado = serializers.SerializerMethodField()
    ultima_compra = serializers.SerializerMethodField()

    class Meta:
        model = Cliente
        fields = (
            'id', 'nombre', 'doc_tipo', 'doc_numero', 'condicion', 'telefono',
            'creado', 'actualizado',
            'cantidad_compras', 'total_gastado', 'ultima_compra',
        )
        read_only_fields = fields

    def _stat(self, obj):
        stats = self.context.get('stats')
        if not stats:
            return None
        if obj.doc_numero:
            return stats['doc'].get(obj.doc_numero)
        if obj.telefono:
            return stats['tel'].get(obj.telefono)
        return None

    def get_cantidad_compras(self, obj):
        if 'stats' not in self.context:
            return None
        fila = self._stat(obj)
        return fila['cantidad'] if fila else 0

    def get_total_gastado(self, obj):
        if 'stats' not in self.context:
            return None
        fila = self._stat(obj)
        return float(fila['total']) if fila and fila['total'] is not None else 0

    def get_ultima_compra(self, obj):
        if 'stats' not in self.context:
            return None
        fila = self._stat(obj)
        return fila['ultima'].isoformat() if fila and fila['ultima'] else None


class CompraSerializer(serializers.ModelSerializer):
    """Un comprobante visto como una compra del cliente (con sus productos)."""

    numero_formateado = serializers.CharField(read_only=True)
    emisor_nombre = serializers.CharField(source='emisor.nombre', read_only=True)
    items = ItemComprobanteSerializer(many=True, read_only=True)
    total = serializers.DecimalField(max_digits=14, decimal_places=2, coerce_to_string=False)

    class Meta:
        model = Comprobante
        fields = (
            'id', 'tipo', 'numero_formateado', 'fecha', 'total', 'estado_cobro',
            'emisor_nombre', 'items',
        )


class ClienteDetalleSerializer(serializers.ModelSerializer):
    """Cliente con su historial de compras (comprobantes + productos + fechas)."""

    resumen = serializers.SerializerMethodField()
    compras = serializers.SerializerMethodField()

    class Meta:
        model = Cliente
        fields = (
            'id', 'nombre', 'doc_tipo', 'doc_numero', 'condicion', 'telefono',
            'creado', 'actualizado', 'resumen', 'compras',
        )

    def get_compras(self, obj):
        from .clientes import comprobantes_de_cliente
        return CompraSerializer(comprobantes_de_cliente(obj), many=True).data

    def get_resumen(self, obj):
        from .clientes import comprobantes_de_cliente
        agg = comprobantes_de_cliente(obj).aggregate(
            cantidad=Count('id'), total=Sum('total'), ultima=Max('fecha'),
        )
        return {
            'cantidad': agg['cantidad'] or 0,
            'total': float(agg['total']) if agg['total'] is not None else 0,
            'ultima': agg['ultima'].isoformat() if agg['ultima'] else None,
        }


class ClienteWriteSerializer(serializers.ModelSerializer):
    """Edición de los datos de contacto del cliente (nombre, teléfono, condición).

    No se editan el tipo/numero de documento: son la identidad con la que se
    cruzan sus compras.
    """

    class Meta:
        model = Cliente
        fields = ('nombre', 'telefono', 'condicion')

    def validate_nombre(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('El nombre es obligatorio.')
        return value
