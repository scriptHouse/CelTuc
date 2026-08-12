"""Asistencia: relojes Hikvision, agentes de sucursal y fichadas.

Arquitectura (ver `docs/asistencia-hikvision-spec.md`):

    Reloj Hikvision ──ISAPI/LAN──> notebook con agente ──HTTPS──> esta API

- `Dispositivo`: un reloj físico en una sucursal. Su configuración (IP,
  intervalos, backfill) se administra acá y viaja al agente en cada
  heartbeat: la interfaz web es la fuente de verdad.
- `Agente`: el servicio que corre en la notebook. Se autentica con un token
  propio (solo se guarda el hash) y reporta su estado por heartbeat.
- `Fichada`: evento de asistencia, append-only e idempotente: un mismo
  evento puede llegar mil veces y queda UNA sola fila.
- `MapeoEmpleado`: traduce el número de empleado cargado en el reloj al
  `empleados.Empleado` del sistema. Las fichadas sin mapeo NO se descartan:
  quedan `sin_mapear` para asociarlas después.
"""
from __future__ import annotations

import hashlib
import secrets
from datetime import timedelta, timezone as dt_timezone

from django.db import models
from django.utils import timezone

from comun.models import ModeloBase

TOKEN_PREFIJO = 'asist_'


def generar_token() -> str:
    """Token en claro para un agente (se muestra UNA sola vez)."""
    return TOKEN_PREFIJO + secrets.token_hex(20)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


class Dispositivo(ModeloBase):
    """Un reloj de asistencia (Hikvision DS-K1A340WX) en una sucursal."""

    sucursal = models.ForeignKey(
        'inventario.Sucursal',
        on_delete=models.PROTECT,
        related_name='relojes',
        verbose_name='sucursal',
    )
    nombre = models.CharField('nombre', max_length=120)
    activo = models.BooleanField('activo', default=True)

    # Conexión en la LAN de la sucursal (la usa el agente, no este servidor).
    host = models.CharField('IP o host en la sucursal', max_length=120)
    puerto = models.PositiveIntegerField('puerto', default=80)
    usar_https = models.BooleanField('usar HTTPS hacia el reloj', default=False)
    usuario_isapi = models.CharField('usuario ISAPI', max_length=60, default='admin')

    # Parámetros de sincronización que se bajan al agente.
    poll_seconds = models.PositiveIntegerField('consultar el reloj cada (seg)', default=20)
    overlap_seconds = models.PositiveIntegerField('ventana de solapamiento (seg)', default=180)
    timeout_seconds = models.PositiveIntegerField('timeout de red (seg)', default=10)
    backfill_dias = models.PositiveIntegerField('días a recuperar en la primera sync', default=7)
    zona_horaria = models.CharField('zona horaria', max_length=60, default='America/Argentina/Buenos_Aires')

    # Identidad reportada por el propio reloj (la completa el agente).
    modelo = models.CharField('modelo', max_length=60, blank=True, default='DS-K1A340WX')
    numero_serie = models.CharField('número de serie', max_length=60, blank=True)
    firmware = models.CharField('firmware', max_length=120, blank=True)

    class Meta:
        db_table = 'asistencia_dispositivos'
        verbose_name = 'reloj de asistencia'
        verbose_name_plural = 'relojes de asistencia'
        ordering = ('sucursal__orden', 'nombre')

    def __str__(self):
        return f'{self.nombre} ({self.sucursal})'


class Agente(ModeloBase):
    """El servicio que corre en la notebook de la sucursal."""

    NIVELES_LOG = (('INFO', 'INFO'), ('DEBUG', 'DEBUG'), ('WARNING', 'WARNING'))

    dispositivo = models.ForeignKey(
        Dispositivo,
        on_delete=models.PROTECT,
        related_name='agentes',
        verbose_name='reloj',
    )
    nombre = models.CharField('nombre', max_length=120, help_text='Ej: salta-notebook-01')
    activo = models.BooleanField('activo', default=True)

    # Solo se guarda el hash; el token en claro se muestra una única vez.
    token_hash = models.CharField('hash del token', max_length=64, unique=True, editable=False)
    token_prefijo = models.CharField('prefijo del token', max_length=12, editable=False, blank=True)

    # Configuración remota del agente (editable desde la interfaz).
    sync_seconds = models.PositiveIntegerField('subir fichadas cada (seg)', default=10)
    batch_size = models.PositiveIntegerField('fichadas por envío', default=200)
    heartbeat_seconds = models.PositiveIntegerField('heartbeat cada (seg)', default=60)
    nivel_log = models.CharField('nivel de log', max_length=10, choices=NIVELES_LOG, default='INFO')

    # Estado reportado por el agente (se actualiza sin pasar por save()).
    version = models.CharField('versión del agente', max_length=20, blank=True)
    hostname = models.CharField('nombre de la notebook', max_length=120, blank=True)
    ultimo_heartbeat = models.DateTimeField('último heartbeat', null=True, blank=True)
    iniciado_en = models.DateTimeField('agente iniciado', null=True, blank=True)
    reloj_alcanzable = models.BooleanField('reloj alcanzable', null=True, blank=True)
    reloj_error = models.CharField('último error con el reloj', max_length=300, blank=True)
    eventos_pendientes = models.PositiveIntegerField('fichadas pendientes de subir', default=0)
    eventos_error = models.PositiveIntegerField('fichadas con error local', default=0)
    ultima_sync_reloj = models.DateTimeField('última lectura del reloj', null=True, blank=True)

    class Meta:
        db_table = 'asistencia_agentes'
        verbose_name = 'agente de sincronización'
        verbose_name_plural = 'agentes de sincronización'
        ordering = ('dispositivo', 'nombre')

    def __str__(self):
        return self.nombre

    @property
    def en_linea(self) -> bool:
        """Con heartbeat reciente (3 intervalos, mínimo 3 minutos de gracia)."""
        if not self.ultimo_heartbeat:
            return False
        ventana = max(self.heartbeat_seconds * 3, 180)
        return timezone.now() - self.ultimo_heartbeat <= timedelta(seconds=ventana)

    def asignar_token(self) -> str:
        """Genera y asigna un token nuevo; devuelve el valor en claro."""
        token = generar_token()
        self.token_hash = hash_token(token)
        self.token_prefijo = token[:12]
        return token

    def config_remota(self) -> dict:
        """Config que administra la interfaz y se baja al agente en cada heartbeat."""
        d = self.dispositivo
        version = int(max(d.actualizado, self.actualizado).timestamp())
        return {
            'version': version,
            'agent_id': self.nombre,
            'device': {
                'host': d.host,
                'port': d.puerto,
                'use_https': d.usar_https,
                'username': d.usuario_isapi,
                'poll_seconds': d.poll_seconds,
                'overlap_seconds': d.overlap_seconds,
                'request_timeout_seconds': d.timeout_seconds,
                'initial_backfill_days': d.backfill_dias,
                'timezone': d.zona_horaria,
            },
            'backend': {
                'sync_seconds': self.sync_seconds,
                'batch_size': self.batch_size,
                'heartbeat_seconds': self.heartbeat_seconds,
            },
            'logging': {'level': self.nivel_log},
        }


class TipoFichada(models.TextChoices):
    # Estados de asistencia que documenta Hikvision para la serie MinMoe.
    ENTRADA = 'check_in', 'Entrada'
    SALIDA = 'check_out', 'Salida'
    DESCANSO_INICIO = 'break_out', 'Salida a descanso'
    DESCANSO_FIN = 'break_in', 'Vuelta de descanso'
    EXTRA_INICIO = 'overtime_in', 'Entrada (horas extra)'
    EXTRA_FIN = 'overtime_out', 'Salida (horas extra)'
    DESCONOCIDO = 'unknown', 'Sin clasificar'


class MetodoVerificacion(models.TextChoices):
    ROSTRO = 'face', 'Rostro'
    TARJETA = 'card', 'Tarjeta'
    HUELLA = 'fingerprint', 'Huella'
    CLAVE = 'password', 'Clave'
    REMOTO = 'remote', 'Remoto'
    DESCONOCIDO = 'unknown', 'Otro'


class EstadoMapeo(models.TextChoices):
    MAPEADA = 'mapeada', 'Asignada a un empleado'
    SIN_MAPEAR = 'sin_mapear', 'Sin asignar'


def hash_evento(dispositivo_id, origen_id, numero, ocurrida_en, tipo, metodo) -> str:
    """Hash canónico del evento, calculado por el SERVIDOR (no se confía en el
    agente). Reenviar el mismo evento produce siempre el mismo hash → una fila.
    """
    iso = ocurrida_en.astimezone(dt_timezone.utc).isoformat(timespec='seconds')
    base = f'{dispositivo_id}|{origen_id}|{numero}|{iso}|{tipo}|{metodo}'
    return hashlib.sha256(base.encode('utf-8')).hexdigest()


class Fichada(models.Model):
    """Un evento de asistencia. Append-only: no hereda ModeloBase a propósito
    (sin borrado lógico ni ediciones; el histórico no se toca)."""

    dispositivo = models.ForeignKey(
        Dispositivo, on_delete=models.PROTECT, related_name='fichadas', verbose_name='reloj'
    )
    agente = models.ForeignKey(
        Agente, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='fichadas', verbose_name='agente que la subió',
    )
    empleado = models.ForeignKey(
        'empleados.Empleado', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='fichadas', verbose_name='empleado',
    )

    numero_reloj = models.CharField('número en el reloj', max_length=32, blank=True)
    nombre_reloj = models.CharField('nombre en el reloj', max_length=120, blank=True)
    estado_mapeo = models.CharField(
        'estado de asignación', max_length=12, choices=EstadoMapeo.choices,
        default=EstadoMapeo.SIN_MAPEAR,
    )

    ocurrida_en = models.DateTimeField('fecha y hora de la fichada')
    recibida_en = models.DateTimeField('recibida por el servidor', default=timezone.now, editable=False)
    tipo = models.CharField('tipo', max_length=16, choices=TipoFichada.choices, default=TipoFichada.DESCONOCIDO)
    metodo = models.CharField(
        'método de verificación', max_length=16, choices=MetodoVerificacion.choices,
        default=MetodoVerificacion.DESCONOCIDO,
    )

    # Idempotencia (spec §7): id del evento en el reloj si existe + hash canónico.
    origen_id = models.CharField('id del evento en el reloj', max_length=64, blank=True, default='')
    hash_evento = models.CharField('hash del evento', max_length=64, editable=False)

    # Payload ISAPI original para diagnóstico y reprocesos (spec §16).
    raw_payload = models.JSONField('payload original', default=dict, blank=True)

    class Meta:
        db_table = 'asistencia_fichadas'
        verbose_name = 'fichada'
        verbose_name_plural = 'fichadas'
        ordering = ('-ocurrida_en', '-id')
        constraints = [
            models.UniqueConstraint(
                fields=('dispositivo', 'hash_evento'), name='uq_fichada_hash'
            ),
            models.UniqueConstraint(
                fields=('dispositivo', 'origen_id'),
                condition=~models.Q(origen_id=''),
                name='uq_fichada_origen',
            ),
        ]
        indexes = [
            models.Index(fields=('dispositivo', '-ocurrida_en'), name='idx_fichada_reloj_fecha'),
            models.Index(fields=('estado_mapeo', 'numero_reloj'), name='idx_fichada_mapeo'),
            models.Index(fields=('empleado', '-ocurrida_en'), name='idx_fichada_empleado'),
        ]

    def __str__(self):
        quien = self.empleado or self.numero_reloj or 's/n'
        return f'{quien} · {self.get_tipo_display()} · {self.ocurrida_en:%d/%m %H:%M}'


class MapeoEmpleado(ModeloBase):
    """Traducción número-en-el-reloj → empleado del sistema.

    Con `dispositivo` vacío el mapeo vale para todos los relojes (útil si los
    números de empleado son únicos en toda la empresa); un mapeo específico de
    un reloj le gana al global.
    """

    dispositivo = models.ForeignKey(
        Dispositivo, on_delete=models.PROTECT, null=True, blank=True,
        related_name='mapeos', verbose_name='reloj',
        help_text='Vacío: vale para todos los relojes.',
    )
    numero_reloj = models.CharField('número en el reloj', max_length=32)
    empleado = models.ForeignKey(
        'empleados.Empleado', on_delete=models.PROTECT,
        related_name='mapeos_asistencia', verbose_name='empleado',
    )

    class Meta:
        db_table = 'asistencia_mapeos_empleado'
        verbose_name = 'asignación de número de reloj'
        verbose_name_plural = 'asignaciones de números de reloj'
        ordering = ('numero_reloj',)
        constraints = [
            models.UniqueConstraint(
                fields=('dispositivo', 'numero_reloj'),
                condition=models.Q(borrado=False),
                name='uq_mapeo_por_reloj',
            ),
            models.UniqueConstraint(
                fields=('numero_reloj',),
                condition=models.Q(borrado=False, dispositivo__isnull=True),
                name='uq_mapeo_global',
            ),
        ]

    def __str__(self):
        alcance = self.dispositivo or 'todos los relojes'
        return f'{self.numero_reloj} → {self.empleado} ({alcance})'


def resolver_mapeos(dispositivo_id, numeros) -> dict[str, int]:
    """{numero_reloj: empleado_id} para un reloj: lo específico pisa lo global."""
    numeros = {n for n in numeros if n}
    if not numeros:
        return {}
    mapa: dict[str, int] = {}
    filas = (
        MapeoEmpleado.objects
        .filter(numero_reloj__in=numeros)
        .filter(models.Q(dispositivo_id=dispositivo_id) | models.Q(dispositivo__isnull=True))
        .values_list('numero_reloj', 'empleado_id', 'dispositivo_id')
    )
    for numero, empleado_id, disp_id in filas:
        if disp_id is not None or numero not in mapa:
            mapa[numero] = empleado_id
    return mapa


def aplicar_mapeo(mapeo: MapeoEmpleado) -> int:
    """Reasigna retroactivamente las fichadas que matchean este número.

    Se recalcula el mapeo efectivo por reloj (por si hay un específico que le
    gana al global). Devuelve cuántas fichadas se actualizaron.
    """
    fichadas = Fichada.objects.filter(numero_reloj=mapeo.numero_reloj)
    if mapeo.dispositivo_id is not None:
        fichadas = fichadas.filter(dispositivo_id=mapeo.dispositivo_id)
    actualizadas = 0
    for dispositivo_id in fichadas.values_list('dispositivo_id', flat=True).distinct():
        mapa = resolver_mapeos(dispositivo_id, {mapeo.numero_reloj})
        empleado_id = mapa.get(mapeo.numero_reloj)
        if empleado_id is None:
            continue
        actualizadas += Fichada.objects.filter(
            dispositivo_id=dispositivo_id, numero_reloj=mapeo.numero_reloj
        ).exclude(empleado_id=empleado_id, estado_mapeo=EstadoMapeo.MAPEADA).update(
            empleado_id=empleado_id, estado_mapeo=EstadoMapeo.MAPEADA
        )
    return actualizadas
