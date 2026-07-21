"""Serializers de la cartelera de comunicados."""
from rest_framework import serializers

from .models import ArchivoComunicado, Comunicado


class ArchivoComunicadoSerializer(serializers.ModelSerializer):
    class Meta:
        model = ArchivoComunicado
        fields = ('id', 'nombre', 'tipo', 'content_type', 'tamanio')


class ComunicadoSerializer(serializers.ModelSerializer):
    """Salida de un comunicado con sus adjuntos y sus constancias de lectura."""

    publicado_por = serializers.SerializerMethodField()
    archivos = ArchivoComunicadoSerializer(many=True, read_only=True)
    lecturas = serializers.SerializerMethodField()
    leido_por_mi = serializers.SerializerMethodField()
    total_lecturas = serializers.SerializerMethodField()

    class Meta:
        model = Comunicado
        fields = (
            'id', 'titulo', 'cuerpo', 'fijado', 'creado', 'publicado_por',
            'archivos', 'lecturas', 'leido_por_mi', 'total_lecturas',
        )

    def get_publicado_por(self, obj):
        return obj.creado_por.username if obj.creado_por else '—'

    def get_lecturas(self, obj):
        """Quien lo vio y cuando (fecha y hora exactas de cada lectura)."""
        return [
            {
                'usuario': lectura.usuario.username if lectura.usuario else '—',
                'fecha': lectura.creado.isoformat(),
            }
            for lectura in obj.lecturas.all()
        ]

    def get_leido_por_mi(self, obj):
        usuario = self.context.get('usuario')
        if usuario is None:
            return False
        return any(lectura.usuario_id == usuario.id for lectura in obj.lecturas.all())

    def get_total_lecturas(self, obj):
        return len(obj.lecturas.all())


class ActualizarComunicadoSerializer(serializers.ModelSerializer):
    """Lo editable de un comunicado ya publicado (los adjuntos son inmutables)."""

    class Meta:
        model = Comunicado
        fields = ('titulo', 'cuerpo', 'fijado')

    def validate_titulo(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('El titulo es obligatorio.')
        return value
