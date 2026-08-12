"""Serializers de Asistencia.

Dos mundos: la API de gestión (superadmin, JWT) y la API de agentes
(token de máquina). Los serializers de agentes son tolerantes: un valor de
tipo/método desconocido degrada a "unknown" en vez de rechazar la fichada.
"""
from rest_framework import serializers

from .models import (
    Agente,
    Dispositivo,
    MapeoEmpleado,
    MetodoVerificacion,
    TipoFichada,
)


# --- Gestión (superadmin) ----------------------------------------------------

class DispositivoSerializer(serializers.ModelSerializer):
    sucursal_nombre = serializers.CharField(source='sucursal.nombre', read_only=True)
    agentes_activos = serializers.SerializerMethodField()

    class Meta:
        model = Dispositivo
        fields = (
            'id', 'sucursal', 'sucursal_nombre', 'nombre', 'activo',
            'host', 'puerto', 'usar_https', 'usuario_isapi',
            'poll_seconds', 'overlap_seconds', 'timeout_seconds',
            'backfill_dias', 'zona_horaria',
            'modelo', 'numero_serie', 'firmware',
            'agentes_activos', 'creado',
        )
        read_only_fields = ('numero_serie', 'firmware', 'creado')

    def get_agentes_activos(self, obj):
        return obj.agentes.filter(activo=True).count()

    def validate_poll_seconds(self, valor):
        if valor < 5:
            raise serializers.ValidationError('Mínimo 5 segundos.')
        return valor

    def validate_backfill_dias(self, valor):
        if valor > 365:
            raise serializers.ValidationError('Máximo 365 días.')
        return valor


class AgenteSerializer(serializers.ModelSerializer):
    dispositivo_nombre = serializers.CharField(source='dispositivo.nombre', read_only=True)
    sucursal_nombre = serializers.CharField(source='dispositivo.sucursal.nombre', read_only=True)
    en_linea = serializers.BooleanField(read_only=True)

    class Meta:
        model = Agente
        fields = (
            'id', 'dispositivo', 'dispositivo_nombre', 'sucursal_nombre',
            'nombre', 'activo', 'token_prefijo',
            'sync_seconds', 'batch_size', 'heartbeat_seconds', 'nivel_log',
            'version', 'hostname', 'ultimo_heartbeat', 'iniciado_en',
            'reloj_alcanzable', 'reloj_error',
            'eventos_pendientes', 'eventos_error', 'ultima_sync_reloj',
            'en_linea', 'creado',
        )
        read_only_fields = (
            'token_prefijo', 'version', 'hostname', 'ultimo_heartbeat',
            'iniciado_en', 'reloj_alcanzable', 'reloj_error',
            'eventos_pendientes', 'eventos_error', 'ultima_sync_reloj', 'creado',
        )

    def validate_batch_size(self, valor):
        if not 1 <= valor <= 500:
            raise serializers.ValidationError('Entre 1 y 500 fichadas por envío.')
        return valor

    def validate_sync_seconds(self, valor):
        if valor < 5:
            raise serializers.ValidationError('Mínimo 5 segundos.')
        return valor

    def validate_heartbeat_seconds(self, valor):
        if valor < 15:
            raise serializers.ValidationError('Mínimo 15 segundos.')
        return valor


class MapeoEmpleadoSerializer(serializers.ModelSerializer):
    dispositivo_nombre = serializers.CharField(source='dispositivo.nombre', read_only=True)
    empleado_nombre = serializers.SerializerMethodField()

    class Meta:
        model = MapeoEmpleado
        fields = (
            'id', 'dispositivo', 'dispositivo_nombre',
            'numero_reloj', 'empleado', 'empleado_nombre', 'creado',
        )

    def get_empleado_nombre(self, obj):
        return obj.empleado.nombre_completo

    def validate(self, datos):
        numero = (datos.get('numero_reloj') or getattr(self.instance, 'numero_reloj', '')).strip()
        if not numero:
            raise serializers.ValidationError({'numero_reloj': 'Indicá el número usado en el reloj.'})
        if 'dispositivo' in datos:
            dispositivo = datos['dispositivo']
        else:
            dispositivo = getattr(self.instance, 'dispositivo', None)
        repetido = MapeoEmpleado.objects.filter(numero_reloj=numero, dispositivo=dispositivo)
        if self.instance is not None:
            repetido = repetido.exclude(pk=self.instance.pk)
        if repetido.exists():
            alcance = dispositivo.nombre if dispositivo else 'todos los relojes'
            raise serializers.ValidationError(
                {'numero_reloj': f'El número {numero} ya está asignado en «{alcance}».'}
            )
        datos['numero_reloj'] = numero
        return datos


# --- API de agentes ----------------------------------------------------------

class EventoAgenteSerializer(serializers.Serializer):
    """Una fichada tal como la manda el agente. `uid` correlaciona la respuesta."""

    uid = serializers.CharField(max_length=64)
    source_event_id = serializers.CharField(
        max_length=64, required=False, allow_blank=True, default=''
    )
    employee_number = serializers.CharField(
        max_length=32, required=False, allow_blank=True, default=''
    )
    employee_name = serializers.CharField(
        max_length=120, required=False, allow_blank=True, default=''
    )
    occurred_at = serializers.DateTimeField()
    event_type = serializers.CharField(required=False, allow_blank=True, default='')
    verification_method = serializers.CharField(required=False, allow_blank=True, default='')
    raw = serializers.JSONField(required=False, default=dict)

    def validate_event_type(self, valor):
        return valor if valor in TipoFichada.values else TipoFichada.DESCONOCIDO

    def validate_verification_method(self, valor):
        return valor if valor in MetodoVerificacion.values else MetodoVerificacion.DESCONOCIDO


class DeviceInfoSerializer(serializers.Serializer):
    model = serializers.CharField(max_length=60, required=False, allow_blank=True, default='')
    serial_number = serializers.CharField(max_length=60, required=False, allow_blank=True, default='')
    firmware = serializers.CharField(max_length=120, required=False, allow_blank=True, default='')


class HeartbeatSerializer(serializers.Serializer):
    agent_version = serializers.CharField(max_length=20, required=False, allow_blank=True, default='')
    hostname = serializers.CharField(max_length=120, required=False, allow_blank=True, default='')
    started_at = serializers.DateTimeField(required=False, allow_null=True, default=None)
    device_reachable = serializers.BooleanField(required=False, allow_null=True, default=None)
    device_error = serializers.CharField(
        max_length=300, required=False, allow_blank=True, allow_null=True, default=''
    )
    device_info = DeviceInfoSerializer(required=False, allow_null=True, default=None)
    pending_events = serializers.IntegerField(required=False, min_value=0, default=0)
    error_events = serializers.IntegerField(required=False, min_value=0, default=0)
    last_device_sync_at = serializers.DateTimeField(required=False, allow_null=True, default=None)
    config_version = serializers.IntegerField(required=False, default=0)
