"""Serializers del historial de documentos generados."""
import json

from django.core.exceptions import ObjectDoesNotExist
from rest_framework import serializers

from .models import TIPOS, DocumentoGenerado

# Tope del formulario guardado en `datos` (llega como texto JSON en el
# multipart). Un documento real ronda el kB; esto solo frena un envio absurdo.
MAX_DATOS = 200_000


class DocumentoGeneradoSerializer(serializers.ModelSerializer):
    """Un renglon del historial, listo para pintar sin consultas extra."""

    tipo_nombre = serializers.SerializerMethodField()
    formato_display = serializers.CharField(source='get_formato_display', read_only=True)
    generado_por = serializers.SerializerMethodField()

    class Meta:
        model = DocumentoGenerado
        fields = (
            'id', 'creado', 'tipo', 'tipo_nombre', 'formato', 'formato_display',
            'nombre_archivo', 'tamanio', 'sucursal', 'referencia', 'cliente',
            'cliente_documento', 'detalle', 'total', 'datos', 'generado_por',
        )

    def get_tipo_nombre(self, obj):
        return obj.tipo_nombre or TIPOS.get(obj.tipo, obj.tipo.replace('-', ' ').capitalize())

    def get_generado_por(self, obj):
        if obj.creado_por is None:
            return None
        try:
            nombre = obj.creado_por.empleado.nombre_completo
        except ObjectDoesNotExist:
            nombre = ''
        return {'id': obj.creado_por_id, 'username': obj.creado_por.username, 'nombre': nombre}


class NuevoDocumentoSerializer(serializers.ModelSerializer):
    """Metadatos de una exportacion (el archivo va aparte, en request.FILES).

    Llega como multipart, asi que TODO viene en texto: los campos vacios se
    descartan antes de validar y `datos` se parsea a mano desde su JSON.
    """

    # No son campos del modelo (el documento no archiva contactos): los manda el
    # front cuando la plantilla los tiene —la seña pide telefono, la reparacion
    # tambien mail— y sirven solo para reconocer al cliente en la base
    # compartida. La vista los saca antes de crear la fila.
    cliente_telefono = serializers.CharField(
        max_length=30, required=False, allow_blank=True, write_only=True,
    )
    cliente_email = serializers.CharField(
        max_length=254, required=False, allow_blank=True, write_only=True,
    )

    class Meta:
        model = DocumentoGenerado
        fields = (
            'tipo', 'tipo_nombre', 'formato', 'nombre_archivo', 'sucursal',
            'referencia', 'cliente', 'cliente_documento', 'cliente_telefono',
            'cliente_email', 'detalle', 'total', 'datos',
        )
        extra_kwargs = {
            'tipo': {'required': True, 'allow_blank': False},
            'total': {'required': False, 'allow_null': True},
            'datos': {'required': False},
        }

    def to_internal_value(self, data):
        # En multipart un campo sin valor llega como '' y romperia a los campos
        # numericos/JSON: se tratan como "no enviado".
        limpio = {k: v for k, v in data.items() if v not in ('', None)}
        datos = limpio.pop('datos', None)
        validado = super().to_internal_value(limpio)
        if datos is not None:
            validado['datos'] = self._parsear_datos(datos)
        return validado

    @staticmethod
    def _parsear_datos(bruto):
        if isinstance(bruto, dict):
            return bruto
        texto = str(bruto)
        if len(texto) > MAX_DATOS:
            raise serializers.ValidationError({'datos': 'Los datos del formulario son demasiado grandes.'})
        try:
            valor = json.loads(texto)
        except (TypeError, ValueError):
            raise serializers.ValidationError({'datos': 'Los datos del formulario no son un JSON valido.'})
        if not isinstance(valor, dict):
            raise serializers.ValidationError({'datos': 'Los datos del formulario deben ser un objeto.'})
        return valor
