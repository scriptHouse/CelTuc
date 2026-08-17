"""Serializers de Asistencia.

Dos mundos: la API de gestión (superadmin, JWT) y la API de agentes
(token de máquina). Los serializers de agentes son tolerantes: un valor de
tipo/método desconocido degrada a "unknown" en vez de rechazar la fichada.
"""
from rest_framework import serializers

from .models import (
    Agente,
    AsignacionTurno,
    Dispositivo,
    Feriado,
    Licencia,
    MapeoEmpleado,
    MetodoVerificacion,
    TipoFichada,
    TramoTurno,
    Turno,
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


# --- Horarios y licencias ----------------------------------------------------

class TramoTurnoSerializer(serializers.ModelSerializer):
    """Un bloque horario del patrón. Varios con el mismo índice = jornada partida."""

    class Meta:
        model = TramoTurno
        fields = ('id', 'indice_dia', 'hora_entrada', 'hora_salida')

    def validate(self, datos):
        if datos['hora_entrada'] == datos['hora_salida']:
            raise serializers.ValidationError('La entrada y la salida no pueden ser iguales.')
        return datos


class TurnoSerializer(serializers.ModelSerializer):
    """El turno viaja con su semana completa: se crea y edita de una sola vez."""

    tramos = TramoTurnoSerializer(many=True)
    minutos_semanales = serializers.IntegerField(read_only=True)
    empleados_asignados = serializers.SerializerMethodField()

    class Meta:
        model = Turno
        fields = (
            'id', 'nombre', 'activo',
            'tipo_ciclo', 'dias_ciclo', 'fecha_inicio_ciclo',
            'tolerancia_entrada', 'tolerancia_salida', 'minutos_antirebote',
            'tramos', 'minutos_semanales', 'empleados_asignados', 'creado',
        )
        read_only_fields = ('creado',)

    def get_empleados_asignados(self, obj):
        return obj.asignaciones.filter(hasta__isnull=True).count()

    def validate_nombre(self, valor):
        nombre = valor.strip()
        repetido = Turno.objects.filter(nombre__iexact=nombre)
        if self.instance is not None:
            repetido = repetido.exclude(pk=self.instance.pk)
        if repetido.exists():
            raise serializers.ValidationError(f'Ya existe un turno llamado «{nombre}».')
        return nombre

    def validate(self, datos):
        tipo = datos.get('tipo_ciclo') or getattr(self.instance, 'tipo_ciclo', Turno.SEMANAL)
        if tipo == Turno.ROTATIVO:
            dias = datos.get('dias_ciclo') or getattr(self.instance, 'dias_ciclo', 0)
            if not dias or dias < 2:
                raise serializers.ValidationError(
                    {'dias_ciclo': 'Un ciclo rotativo necesita al menos 2 días.'}
                )
            if dias > 60:
                raise serializers.ValidationError({'dias_ciclo': 'Máximo 60 días de ciclo.'})
            inicio = datos.get('fecha_inicio_ciclo') or getattr(
                self.instance, 'fecha_inicio_ciclo', None
            )
            if inicio is None:
                raise serializers.ValidationError(
                    {'fecha_inicio_ciclo': 'Indicá desde qué día arranca el ciclo.'}
                )
            limite = dias
        else:
            limite = 7

        for tramo in datos.get('tramos', []) or []:
            if tramo['indice_dia'] >= limite:
                raise serializers.ValidationError(
                    {'tramos': 'Hay un horario fuera del patrón (día %s de %s).'
                               % (tramo['indice_dia'] + 1, limite)}
                )
        return datos

    def _reemplazar_tramos(self, turno, tramos):
        # Los tramos son configuración del turno: se reemplazan físicamente,
        # sin dejar borrados lógicos que ensucien el horario.
        turno.tramos.all().delete()
        TramoTurno.objects.bulk_create(
            [TramoTurno(turno=turno, **tramo) for tramo in tramos]
        )

    def create(self, validated_data):
        tramos = validated_data.pop('tramos', [])
        turno = super().create(validated_data)
        self._reemplazar_tramos(turno, tramos)
        return turno

    def update(self, instance, validated_data):
        tramos = validated_data.pop('tramos', None)
        turno = super().update(instance, validated_data)
        if tramos is not None:
            self._reemplazar_tramos(turno, tramos)
        return turno


class AsignacionTurnoSerializer(serializers.ModelSerializer):
    empleado_nombre = serializers.SerializerMethodField()
    turno_nombre = serializers.CharField(source='turno.nombre', read_only=True)
    vigente = serializers.SerializerMethodField()

    class Meta:
        model = AsignacionTurno
        fields = (
            'id', 'empleado', 'empleado_nombre', 'turno', 'turno_nombre',
            'desde', 'hasta', 'desfase_ciclo', 'vigente', 'creado',
        )
        read_only_fields = ('creado',)

    def get_empleado_nombre(self, obj):
        return obj.empleado.nombre_completo

    def get_vigente(self, obj):
        return obj.hasta is None

    def validate(self, datos):
        empleado = datos.get('empleado') or getattr(self.instance, 'empleado', None)
        desde = datos.get('desde') or getattr(self.instance, 'desde', None)
        hasta = datos.get('hasta', getattr(self.instance, 'hasta', None))
        if hasta and desde and hasta < desde:
            raise serializers.ValidationError({'hasta': 'No puede ser anterior a «desde».'})

        # Una persona no puede tener dos turnos al mismo tiempo.
        choques = AsignacionTurno.objects.filter(empleado=empleado)
        if self.instance is not None:
            choques = choques.exclude(pk=self.instance.pk)
        if hasta:
            choques = choques.filter(desde__lte=hasta)
        for otra in choques:
            if otra.hasta is None or otra.hasta >= desde:
                raise serializers.ValidationError(
                    'Ese empleado ya tiene el turno «%s» asignado en ese período. '
                    'Cerrá la asignación anterior poniéndole fecha «hasta».' % otra.turno.nombre
                )
        return datos


class LicenciaSerializer(serializers.ModelSerializer):
    empleado_nombre = serializers.SerializerMethodField()
    tipo_display = serializers.CharField(source='get_tipo_display', read_only=True)
    dias = serializers.IntegerField(read_only=True)

    class Meta:
        model = Licencia
        fields = (
            'id', 'empleado', 'empleado_nombre', 'tipo', 'tipo_display',
            'desde', 'hasta', 'dias',
            'jornada_completa', 'hora_desde', 'hora_hasta',
            'observacion', 'creado',
        )
        read_only_fields = ('creado',)

    def get_empleado_nombre(self, obj):
        return obj.empleado.nombre_completo

    def validate(self, datos):
        empleado = datos.get('empleado') or getattr(self.instance, 'empleado', None)
        desde = datos.get('desde') or getattr(self.instance, 'desde', None)
        hasta = datos.get('hasta') or getattr(self.instance, 'hasta', None)
        if desde and hasta and hasta < desde:
            raise serializers.ValidationError({'hasta': 'No puede ser anterior a «desde».'})

        completa = datos.get('jornada_completa')
        if completa is None:
            completa = getattr(self.instance, 'jornada_completa', True)
        if not completa:
            h_desde = datos.get('hora_desde') or getattr(self.instance, 'hora_desde', None)
            h_hasta = datos.get('hora_hasta') or getattr(self.instance, 'hora_hasta', None)
            if not h_desde or not h_hasta:
                raise serializers.ValidationError(
                    {'hora_desde': 'Una licencia por horas necesita hora de inicio y de fin.'}
                )
            if h_hasta <= h_desde:
                raise serializers.ValidationError(
                    {'hora_hasta': 'Tiene que ser posterior a la hora de inicio.'}
                )

        superpuesta = Licencia.objects.filter(
            empleado=empleado, desde__lte=hasta, hasta__gte=desde
        )
        if self.instance is not None:
            superpuesta = superpuesta.exclude(pk=self.instance.pk)
        otra = superpuesta.first()
        if otra is not None:
            raise serializers.ValidationError(
                'Ese empleado ya tiene cargada «%s» del %s al %s.'
                % (otra.get_tipo_display(), otra.desde, otra.hasta)
            )
        return datos


class FeriadoSerializer(serializers.ModelSerializer):
    tipo_display = serializers.CharField(source='get_tipo_display', read_only=True)
    sucursal_nombre = serializers.CharField(source='sucursal.nombre', read_only=True)

    class Meta:
        model = Feriado
        fields = (
            'id', 'fecha', 'nombre', 'tipo', 'tipo_display',
            'sucursal', 'sucursal_nombre', 'creado',
        )
        read_only_fields = ('creado',)

    def validate(self, datos):
        fecha = datos.get('fecha') or getattr(self.instance, 'fecha', None)
        sucursal = datos.get('sucursal', getattr(self.instance, 'sucursal', None))
        repetido = Feriado.objects.filter(fecha=fecha, sucursal=sucursal)
        if self.instance is not None:
            repetido = repetido.exclude(pk=self.instance.pk)
        if repetido.exists():
            alcance = sucursal.nombre if sucursal else 'todas las sucursales'
            raise serializers.ValidationError(
                {'fecha': f'Ya hay un feriado ese día para {alcance}.'}
            )
        return datos
