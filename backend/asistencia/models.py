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
- `AsignacionSucursal`: en qué local se espera a cada persona y qué día.
  `Empleado.sucursal` alcanza para quien nunca se mueve; esto es para quien
  rota, y es lo que permite avisar si alguien fichó donde no correspondía.
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
    backfill_dias = models.PositiveIntegerField('días a recuperar en la primera sync', default=90)
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
    # El DS-K1A340WX reporta los metodos HABILITADOS en el lector, no el que
    # la persona uso. Se registra como "varios" en vez de mentir "rostro".
    MULTIPLE = 'multiple', 'Varios habilitados'
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

    numero_reloj = models.CharField('identificador en el reloj', max_length=32, blank=True)
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
    numero_reloj = models.CharField('identificador en el reloj', max_length=32)
    empleado = models.ForeignKey(
        'empleados.Empleado', on_delete=models.PROTECT,
        related_name='mapeos_asistencia', verbose_name='empleado',
    )

    class Meta:
        db_table = 'asistencia_mapeos_empleado'
        verbose_name = 'asignación de identificador de reloj'
        verbose_name_plural = 'asignaciones de identificadores de reloj'
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


# =============================================================================
# HORARIOS Y LICENCIAS
# =============================================================================

class Turno(ModeloBase):
    """Un horario semanal reutilizable (ej: «Comercio 9 a 18»).

    El horario concreto de cada día vive en `TramoTurno`: un día sin tramos es
    franco. Dos tramos en el mismo día = jornada partida (mañana y tarde).
    """

    SEMANAL = 'semanal'
    ROTATIVO = 'rotativo'
    TIPOS_CICLO = (
        (SEMANAL, 'Semanal (mismo horario cada semana)'),
        (ROTATIVO, 'Rotativo (ciclo de N días)'),
    )

    nombre = models.CharField('nombre', max_length=120)
    activo = models.BooleanField('activo', default=True)

    # Semanal: el horario se repite por día de la semana (lunes, martes...).
    # Rotativo: se repite cada `dias_ciclo` días contados desde
    # `fecha_inicio_ciclo`, así el franco corre respecto del calendario
    # (2x2, 4x2, semana A / semana B...).
    tipo_ciclo = models.CharField(
        'tipo de ciclo', max_length=10, choices=TIPOS_CICLO, default=SEMANAL
    )
    dias_ciclo = models.PositiveSmallIntegerField(
        'días del ciclo', default=7,
        help_text='Solo para turnos rotativos: cada cuántos días se repite el patrón.',
    )
    fecha_inicio_ciclo = models.DateField(
        'inicio del ciclo', null=True, blank=True,
        help_text='Solo para turnos rotativos: el día 1 del patrón.',
    )

    tolerancia_entrada = models.PositiveIntegerField(
        'tolerancia de llegada (min)', default=10,
        help_text='Minutos de gracia antes de marcar la llegada como tarde.',
    )
    tolerancia_salida = models.PositiveIntegerField(
        'tolerancia de salida (min)', default=10,
        help_text='Minutos de gracia para irse antes del horario de salida.',
    )
    minutos_antirebote = models.PositiveIntegerField(
        'ignorar refichadas dentro de (min)', default=2,
        help_text='Si alguien ficha dos veces seguidas en menos de estos minutos, '
                  'se cuenta una sola vez (doble lectura del rostro).',
    )

    class Meta:
        db_table = 'asistencia_turnos'
        verbose_name = 'turno'
        verbose_name_plural = 'turnos'
        ordering = ('nombre',)
        constraints = [
            models.UniqueConstraint(
                fields=('nombre',), condition=models.Q(borrado=False), name='uq_turno_vivo'
            ),
        ]

    def __str__(self):
        return self.nombre

    @property
    def es_rotativo(self) -> bool:
        return self.tipo_ciclo == self.ROTATIVO

    @property
    def largo_patron(self) -> int:
        """Cuántos días distintos tiene el patrón: 7 si es semanal."""
        return self.dias_ciclo if self.es_rotativo else 7

    @property
    def minutos_semanales(self) -> int:
        """Minutos por vuelta completa del patrón (una semana si es semanal)."""
        return sum(t.minutos for t in self.tramos.all())

    def indice_de(self, fecha, desfase: int = 0) -> int:
        """Qué día del patrón le toca a una fecha.

        Semanal: el día de la semana (0 = lunes). Rotativo: la posición
        dentro del ciclo, corrida por el `desfase` del empleado (así dos
        personas comparten un 2x2 en fases opuestas).
        """
        if not self.es_rotativo:
            return fecha.weekday()
        ancla = self.fecha_inicio_ciclo or fecha
        largo = max(1, self.dias_ciclo)
        return ((fecha - ancla).days + desfase) % largo

    def tramos_de(self, fecha, desfase: int = 0):
        """Los bloques horarios que le corresponden a una fecha."""
        indice = self.indice_de(fecha, desfase)
        return sorted(
            (t for t in self.tramos.all() if t.indice_dia == indice),
            key=lambda t: t.hora_entrada,
        )


class TramoTurno(ModeloBase):
    """Un bloque horario dentro del patrón de un turno.

    `indice_dia` es la posición en el patrón: en un turno semanal es el día
    de la semana (0 = lunes … 6 = domingo); en uno rotativo es el día del
    ciclo (0 … dias_ciclo-1). Varios tramos con el mismo índice = jornada
    partida (por ejemplo mañana y tarde, cerrando al mediodía).
    """

    DIAS = (
        (0, 'Lunes'), (1, 'Martes'), (2, 'Miércoles'), (3, 'Jueves'),
        (4, 'Viernes'), (5, 'Sábado'), (6, 'Domingo'),
    )

    turno = models.ForeignKey(
        Turno, on_delete=models.CASCADE, related_name='tramos', verbose_name='turno'
    )
    indice_dia = models.PositiveSmallIntegerField(
        'día del patrón',
        help_text='Semanal: 0 = lunes … 6 = domingo. Rotativo: día del ciclo.',
    )
    hora_entrada = models.TimeField('entrada')
    hora_salida = models.TimeField('salida')

    class Meta:
        db_table = 'asistencia_tramos_turno'
        verbose_name = 'horario del turno'
        verbose_name_plural = 'horarios del turno'
        ordering = ('indice_dia', 'hora_entrada')

    def __str__(self):
        return f'Día {self.indice_dia} {self.hora_entrada:%H:%M}-{self.hora_salida:%H:%M}'

    @property
    def minutos(self) -> int:
        """Duración del tramo. Si cruza medianoche, suma el día siguiente."""
        inicio = self.hora_entrada.hour * 60 + self.hora_entrada.minute
        fin = self.hora_salida.hour * 60 + self.hora_salida.minute
        return (fin - inicio) if fin > inicio else (fin + 24 * 60 - inicio)


class AsignacionTurno(ModeloBase):
    """Qué turno le corresponde a un empleado, y desde cuándo.

    `hasta` vacío = vigente. Al cambiarle el turno a alguien se cierra la
    asignación anterior y se abre una nueva: así el histórico se sigue
    calculando con el horario que regía ese día.
    """

    empleado = models.ForeignKey(
        'empleados.Empleado', on_delete=models.PROTECT,
        related_name='turnos_asistencia', verbose_name='empleado',
    )
    turno = models.ForeignKey(
        Turno, on_delete=models.PROTECT, related_name='asignaciones', verbose_name='turno'
    )
    desde = models.DateField('desde')
    hasta = models.DateField('hasta', null=True, blank=True, help_text='Vacío: vigente.')
    desfase_ciclo = models.PositiveSmallIntegerField(
        'desfase en el ciclo', default=0,
        help_text='Solo en turnos rotativos: corre el patrón N días para esta '
                  'persona. Así dos empleados comparten un 2x2 en fases opuestas.',
    )

    class Meta:
        db_table = 'asistencia_asignaciones_turno'
        verbose_name = 'asignación de turno'
        verbose_name_plural = 'asignaciones de turno'
        ordering = ('-desde',)

    def __str__(self):
        return f'{self.empleado} · {self.turno} (desde {self.desde})'

    def cubre(self, fecha) -> bool:
        return self.desde <= fecha and (self.hasta is None or fecha <= self.hasta)


class TipoLicencia(models.TextChoices):
    VACACIONES = 'vacaciones', 'Vacaciones'
    ENFERMEDAD = 'enfermedad', 'Enfermedad'
    ESPECIAL = 'especial', 'Licencia especial'
    FRANCO = 'franco', 'Franco / día libre'
    SUSPENSION = 'suspension', 'Suspensión'
    OTRO = 'otro', 'Otro'


class Licencia(ModeloBase):
    """Período en el que la ausencia del empleado está justificada."""

    empleado = models.ForeignKey(
        'empleados.Empleado', on_delete=models.PROTECT,
        related_name='licencias', verbose_name='empleado',
    )
    tipo = models.CharField('tipo', max_length=16, choices=TipoLicencia.choices)
    desde = models.DateField('desde')
    hasta = models.DateField('hasta')

    # Licencia parcial: cubre solo una franja del día (media jornada, turno
    # médico...). El resto del horario se sigue esperando, así que la persona
    # no figura ausente por la franja licenciada pero sí por lo demás.
    jornada_completa = models.BooleanField('día completo', default=True)
    hora_desde = models.TimeField('desde (hora)', null=True, blank=True)
    hora_hasta = models.TimeField('hasta (hora)', null=True, blank=True)

    observacion = models.TextField('observación', blank=True)

    class Meta:
        db_table = 'asistencia_licencias'
        verbose_name = 'licencia'
        verbose_name_plural = 'licencias'
        ordering = ('-desde',)
        indexes = [
            models.Index(fields=('empleado', 'desde', 'hasta'), name='idx_licencia_empleado'),
        ]

    def __str__(self):
        return f'{self.empleado} · {self.get_tipo_display()} ({self.desde} a {self.hasta})'

    @property
    def dias(self) -> int:
        return (self.hasta - self.desde).days + 1

    @property
    def es_parcial(self) -> bool:
        return not self.jornada_completa and bool(self.hora_desde and self.hora_hasta)

    def cubre(self, fecha) -> bool:
        return self.desde <= fecha <= self.hasta


def turno_de(empleado_id: int, fecha):
    """Turno vigente de un empleado en una fecha (o None)."""
    if not empleado_id:
        return None
    asignacion = (
        AsignacionTurno.objects
        .filter(empleado_id=empleado_id, desde__lte=fecha)
        .filter(models.Q(hasta__isnull=True) | models.Q(hasta__gte=fecha))
        .select_related('turno')
        .order_by('-desde')
        .first()
    )
    return asignacion.turno if asignacion else None


def licencia_de(empleado_id: int, fecha):
    """Licencia que cubre a un empleado en una fecha (o None)."""
    if not empleado_id:
        return None
    return (
        Licencia.objects
        .filter(empleado_id=empleado_id, desde__lte=fecha, hasta__gte=fecha)
        .order_by('desde')
        .first()
    )


class TipoFeriado(models.TextChoices):
    NACIONAL = 'nacional', 'Nacional'
    PROVINCIAL = 'provincial', 'Provincial'
    PUENTE = 'puente', 'Puente turístico'
    PROPIO = 'propio', 'Cierre propio'


class Feriado(ModeloBase):
    """Un día en el que no se espera que nadie trabaje.

    Sin esto, cada feriado aparece como una ausencia para todo el equipo.
    `sucursal` vacía = vale para todas; cargarla permite feriados
    provinciales distintos (Salta y Tucumán no coinciden).

    Si igual se trabaja ese día, las fichadas se registran normalmente y la
    jornada queda marcada como trabajada en feriado (dato útil para liquidar).
    """

    fecha = models.DateField('fecha')
    nombre = models.CharField('nombre', max_length=120)
    tipo = models.CharField(
        'tipo', max_length=12, choices=TipoFeriado.choices, default=TipoFeriado.NACIONAL
    )
    sucursal = models.ForeignKey(
        'inventario.Sucursal', on_delete=models.PROTECT, null=True, blank=True,
        related_name='feriados', verbose_name='sucursal',
        help_text='Vacío: aplica a todas las sucursales.',
    )

    class Meta:
        db_table = 'asistencia_feriados'
        verbose_name = 'feriado'
        verbose_name_plural = 'feriados'
        ordering = ('-fecha',)
        constraints = [
            models.UniqueConstraint(
                fields=('fecha', 'sucursal'),
                condition=models.Q(borrado=False),
                name='uq_feriado_fecha_sucursal',
            ),
        ]
        indexes = [models.Index(fields=('fecha',), name='idx_feriado_fecha')]

    def __str__(self):
        return f'{self.fecha:%d/%m/%Y} · {self.nombre}'


def feriado_de(fecha, sucursal_id=None):
    """El feriado que aplica a una fecha y sucursal (lo específico gana)."""
    feriados = Feriado.objects.filter(fecha=fecha).filter(
        models.Q(sucursal_id=sucursal_id) | models.Q(sucursal__isnull=True)
    )
    especifico = None
    general = None
    for f in feriados:
        if f.sucursal_id is not None:
            especifico = f
        else:
            general = general or f
    return especifico or general


# =============================================================================
# DÓNDE TRABAJA CADA UNO
# =============================================================================

class AsignacionSucursal(ModeloBase):
    """En qué sucursal se espera a un empleado, y desde cuándo.

    `Empleado.sucursal` dice a qué local pertenece alguien, pero es un dato
    fijo: no sirve para quien rota. Acá el destino tiene fechas y, si hace
    falta, días de la semana, así se puede modelar:

    - **Fijo**: desde el 01/03, sin «hasta», todos los días → Salta.
    - **Semana partida**: dos filas abiertas, una lunes y martes → Salta,
      otra el resto → Yerba Buena.
    - **Reemplazo puntual**: del 20/08 al 22/08 → Salta (cubre a alguien).

    Las filas se pueden superponer a propósito: **gana la más específica**,
    entendiendo por específica la de período más corto (una excepción de un
    día le gana a la regla permanente); a igual período gana la que limita
    días de la semana; y si todavía empatan, la que empezó después.

    Si un empleado no tiene ninguna fila, se usa su `Empleado.sucursal`.
    """

    empleado = models.ForeignKey(
        'empleados.Empleado', on_delete=models.PROTECT,
        related_name='sucursales_asistencia', verbose_name='empleado',
    )
    sucursal = models.ForeignKey(
        'inventario.Sucursal', on_delete=models.PROTECT,
        related_name='asignaciones_asistencia', verbose_name='sucursal',
    )
    desde = models.DateField('desde')
    hasta = models.DateField('hasta', null=True, blank=True, help_text='Vacío: sin fecha de fin.')

    # Guardado como '0,2,4' (0 = lunes). Vacío = todos los días del período.
    dias_semana = models.CharField(
        'días de la semana', max_length=13, blank=True, default='',
        help_text='Vacío: todos los días. Si no, solo esos días va a esa sucursal.',
    )
    motivo = models.CharField('motivo', max_length=200, blank=True)

    class Meta:
        db_table = 'asistencia_asignaciones_sucursal'
        verbose_name = 'asignación de sucursal'
        verbose_name_plural = 'asignaciones de sucursal'
        ordering = ('-desde', 'id')
        indexes = [
            models.Index(fields=('empleado', 'desde'), name='idx_asig_suc_empleado'),
        ]

    def __str__(self):
        return f'{self.empleado} → {self.sucursal} (desde {self.desde})'

    @property
    def dias(self) -> set[int]:
        """Días de la semana que cubre. Vacío en la base = los siete."""
        crudos = {int(p) for p in self.dias_semana.split(',') if p.strip().isdigit()}
        return crudos or {0, 1, 2, 3, 4, 5, 6}

    @property
    def todos_los_dias(self) -> bool:
        return len(self.dias) == 7

    @property
    def vigente(self) -> bool:
        return self.hasta is None

    @property
    def duracion_dias(self) -> int | None:
        """Cuántos días abarca el período, o None si no tiene fin."""
        if self.hasta is None:
            return None
        return (self.hasta - self.desde).days + 1

    @property
    def especificidad(self) -> tuple:
        """Clave de desempate: **menor es más específica** (ver la clase)."""
        largo = self.duracion_dias if self.hasta is not None else 10 ** 6
        return (largo, 0 if not self.todos_los_dias else 1, -self.desde.toordinal())

    def cubre(self, fecha) -> bool:
        if fecha < self.desde or (self.hasta is not None and fecha > self.hasta):
            return False
        return fecha.weekday() in self.dias


def elegir_asignacion_sucursal(asignaciones, fecha):
    """De varias asignaciones, la que manda ese día (la más específica)."""
    candidatas = [a for a in asignaciones if a.cubre(fecha)]
    if not candidatas:
        return None
    return min(candidatas, key=lambda a: a.especificidad)


def sucursal_de(empleado_id: int, fecha):
    """Sucursal donde se espera a un empleado esa fecha (o None).

    Primero las asignaciones con fecha; si no hay ninguna, la sucursal fija
    del empleado.
    """
    if not empleado_id:
        return None
    asignaciones = (
        AsignacionSucursal.objects
        .filter(empleado_id=empleado_id, desde__lte=fecha)
        .filter(models.Q(hasta__isnull=True) | models.Q(hasta__gte=fecha))
        .select_related('sucursal')
    )
    elegida = elegir_asignacion_sucursal(asignaciones, fecha)
    if elegida is not None:
        return elegida.sucursal

    from empleados.models import Empleado

    return (
        Empleado.objects.filter(pk=empleado_id).select_related('sucursal').first()
        or Empleado()
    ).sucursal


# =============================================================================
# INCONSISTENCIAS
# =============================================================================

class TipoInconsistencia(models.TextChoices):
    LLEGADA_TARDE = 'llegada_tarde', 'Llegó tarde'
    SALIDA_TEMPRANA = 'salida_temprana', 'Se retiró antes'
    FALTA_ENTRADA = 'falta_entrada', 'Falta la marca de entrada'
    FALTA_SALIDA = 'falta_salida', 'Falta la marca de salida'
    AUSENCIA = 'ausencia', 'Ausente sin aviso'
    PAUSA_EXCESIVA = 'pausa_excesiva', 'Salida parcial demasiado larga'
    JORNADA_INCOMPLETA = 'jornada_incompleta', 'Trabajó menos de lo previsto'
    EXCESO_JORNADA = 'exceso_jornada', 'Trabajó de más'
    SUCURSAL_INCORRECTA = 'sucursal_incorrecta', 'Fichó en otra sucursal'
    TRABAJO_EN_FERIADO = 'trabajo_en_feriado', 'Trabajó en un feriado'
    DIA_NO_LABORABLE = 'dia_no_laborable', 'Trabajó en su día franco'


class Severidad(models.TextChoices):
    LEVE = 'leve', 'Leve'
    MODERADA = 'moderada', 'Moderada'
    GRAVE = 'grave', 'Grave'


class EstadoInconsistencia(models.TextChoices):
    PENDIENTE = 'pendiente', 'Pendiente de revisión'
    JUSTIFICADA = 'justificada', 'Justificada'
    RECHAZADA = 'rechazada', 'Sin justificación válida'


# Qué significa el umbral de cada tipo y con qué valor conviene arrancar. Es la
# misma tabla que usa la interfaz para explicarse sola, así agregar un tipo
# nuevo no obliga a tocar el frontend.
CATALOGO_INCONSISTENCIAS = {
    TipoInconsistencia.LLEGADA_TARDE: {
        'umbral': 'Minutos de atraso a partir de los cuales se reporta.',
        'defecto': None,
        'severidad': Severidad.MODERADA,
        'activa': True,
        'justificar': True,
        'ayuda': 'Vacío: usa la tolerancia de llegada configurada en cada turno.',
    },
    TipoInconsistencia.SALIDA_TEMPRANA: {
        'umbral': 'Minutos antes del horario de salida a partir de los cuales se reporta.',
        'defecto': None,
        'severidad': Severidad.MODERADA,
        'activa': True,
        'justificar': True,
        'ayuda': 'Vacío: usa la tolerancia de salida configurada en cada turno.',
    },
    TipoInconsistencia.FALTA_ENTRADA: {
        'umbral': 'Minutos después de la entrada tras los cuales se asume que faltó marcar.',
        'defecto': 180,
        'severidad': Severidad.GRAVE,
        'activa': True,
        'justificar': True,
        'ayuda': 'Quedó un número impar de marcas y la primera es muy posterior a la '
                 'entrada: lo más probable es que se haya olvidado de fichar al llegar.',
    },
    TipoInconsistencia.FALTA_SALIDA: {
        'umbral': '',
        'defecto': None,
        'severidad': Severidad.GRAVE,
        'activa': True,
        'justificar': True,
        'ayuda': 'La jornada quedó abierta: entró y nunca marcó la salida.',
    },
    TipoInconsistencia.AUSENCIA: {
        'umbral': '',
        'defecto': None,
        'severidad': Severidad.GRAVE,
        'activa': True,
        'justificar': True,
        'ayuda': 'Tenía turno ese día y no marcó nunca, sin licencia ni feriado.',
    },
    TipoInconsistencia.PAUSA_EXCESIVA: {
        'umbral': 'Minutos de ausencia dentro de la jornada a partir de los cuales se reporta.',
        'defecto': 90,
        'severidad': Severidad.MODERADA,
        'activa': True,
        'justificar': True,
        'ayuda': 'Se fue y volvió el mismo día, pero estuvo afuera más de la cuenta.',
    },
    TipoInconsistencia.JORNADA_INCOMPLETA: {
        'umbral': 'Minutos de déficit sobre el horario esperado a partir de los cuales se reporta.',
        'defecto': 30,
        'severidad': Severidad.LEVE,
        'activa': False,
        'justificar': False,
        'ayuda': 'Se superpone con «llegó tarde» y «se retiró antes»: viene apagada '
                 'para no reportar dos veces lo mismo. Sirve si preferís mirar el '
                 'total del día en vez de las puntas.',
    },
    TipoInconsistencia.EXCESO_JORNADA: {
        'umbral': 'Minutos por encima del horario esperado a partir de los cuales se reporta.',
        'defecto': 60,
        'severidad': Severidad.LEVE,
        'activa': True,
        'justificar': False,
        'ayuda': 'Horas de más: sirve para detectar horas extra no acordadas.',
    },
    TipoInconsistencia.SUCURSAL_INCORRECTA: {
        'umbral': '',
        'defecto': None,
        'severidad': Severidad.MODERADA,
        'activa': True,
        'justificar': True,
        'ayuda': 'Fichó en un local distinto al que le tocaba ese día.',
    },
    TipoInconsistencia.TRABAJO_EN_FERIADO: {
        'umbral': '',
        'defecto': None,
        'severidad': Severidad.LEVE,
        'activa': True,
        'justificar': False,
        'ayuda': 'Informativo: es el dato que hace falta para liquidar el feriado.',
    },
    TipoInconsistencia.DIA_NO_LABORABLE: {
        'umbral': '',
        'defecto': None,
        'severidad': Severidad.LEVE,
        'activa': True,
        'justificar': False,
        'ayuda': 'Trabajó un día que su turno tenía como franco.',
    },
}


class ReglaInconsistencia(ModeloBase):
    """Cuándo un día de trabajo pasa a ser algo para revisar.

    Cada tipo tiene una regla global; opcionalmente se le puede poner una
    propia a un turno (por ejemplo, más tolerancia en el turno noche). Ante
    un día concreto, la regla del turno le gana a la global.

    Apagar una regla no la borra: deja de generar inconsistencias de ese tipo
    y deja de teñir el estado del día. Es la forma de decir «esto no me
    interesa mirar» sin perder lo ya justificado.
    """

    tipo = models.CharField('tipo', max_length=24, choices=TipoInconsistencia.choices)
    turno = models.ForeignKey(
        Turno, on_delete=models.CASCADE, null=True, blank=True,
        related_name='reglas', verbose_name='turno',
        help_text='Vacío: vale para todos los turnos.',
    )
    activa = models.BooleanField('activa', default=True)
    umbral_minutos = models.PositiveIntegerField(
        'umbral (min)', null=True, blank=True,
        help_text='Qué significa depende del tipo. Vacío en llegada tarde y salida '
                  'temprana: usa la tolerancia del turno.',
    )
    severidad = models.CharField(
        'severidad', max_length=10, choices=Severidad.choices, default=Severidad.MODERADA
    )
    requiere_justificacion = models.BooleanField(
        'pedir justificación', default=True,
        help_text='Si no, se reporta como dato informativo y no queda pendiente.',
    )

    class Meta:
        db_table = 'asistencia_reglas_inconsistencia'
        verbose_name = 'regla de inconsistencia'
        verbose_name_plural = 'reglas de inconsistencia'
        ordering = ('tipo', 'turno__nombre')
        constraints = [
            models.UniqueConstraint(
                fields=('tipo', 'turno'), condition=models.Q(borrado=False),
                name='uq_regla_tipo_turno',
            ),
            models.UniqueConstraint(
                fields=('tipo',),
                condition=models.Q(borrado=False, turno__isnull=True),
                name='uq_regla_global',
            ),
        ]

    def __str__(self):
        alcance = self.turno.nombre if self.turno_id else 'todos los turnos'
        return f'{self.get_tipo_display()} ({alcance})'

    @property
    def usa_umbral(self) -> bool:
        return bool(CATALOGO_INCONSISTENCIAS.get(self.tipo, {}).get('umbral'))

    def a_dict(self) -> dict:
        """Lo que necesita el motor de jornada, sin acceso a la base."""
        return {
            'tipo': self.tipo,
            'activa': self.activa,
            'umbral': self.umbral_minutos,
            'severidad': self.severidad,
            'requiere_justificacion': self.requiere_justificacion,
        }


def resolver_reglas(reglas, turno_id=None) -> dict:
    """`{tipo: dict}` para un turno: la regla del turno pisa a la global.

    Recibe las reglas ya cargadas para poder resolver muchos días sin volver
    a la base una vez por jornada.
    """
    resueltas: dict[str, dict] = {}
    for regla in reglas:
        if regla.turno_id is not None and regla.turno_id != turno_id:
            continue
        previa = resueltas.get(regla.tipo)
        if previa is None or regla.turno_id is not None:
            resueltas[regla.tipo] = regla.a_dict()
    return resueltas


def reglas_de(turno_id=None) -> dict:
    """Las reglas vigentes para un turno (consulta directa, para un solo día)."""
    reglas = ReglaInconsistencia.objects.filter(
        models.Q(turno_id=turno_id) | models.Q(turno__isnull=True)
    )
    return resolver_reglas(reglas, turno_id)


def sembrar_reglas(usuario=None) -> list:
    """Crea las reglas globales que falten, con los valores recomendados."""
    creadas = []
    existentes = set(
        ReglaInconsistencia.objects.filter(turno__isnull=True).values_list('tipo', flat=True)
    )
    for tipo, cfg in CATALOGO_INCONSISTENCIAS.items():
        if tipo in existentes:
            continue
        creadas.append(ReglaInconsistencia.objects.create(
            tipo=tipo,
            activa=cfg['activa'],
            umbral_minutos=cfg['defecto'],
            severidad=cfg['severidad'],
            requiere_justificacion=cfg['justificar'],
            creado_por=usuario,
            actualizado_por=usuario,
        ))
    return creadas


class JustificacionInconsistencia(ModeloBase):
    """La resolución de una inconsistencia puntual.

    Las inconsistencias no se guardan: se recalculan siempre desde las
    fichadas, los turnos y las reglas vigentes. Lo único que se guarda es lo
    que una persona decidió sobre una de ellas, identificada por
    (empleado, fecha, tipo). Así, cambiar un umbral recalcula todo al
    instante sin dejar filas viejas contradiciendo la configuración nueva.
    """

    empleado = models.ForeignKey(
        'empleados.Empleado', on_delete=models.PROTECT,
        related_name='inconsistencias', verbose_name='empleado',
    )
    fecha = models.DateField('fecha')
    tipo = models.CharField('tipo', max_length=24, choices=TipoInconsistencia.choices)
    estado = models.CharField(
        'estado', max_length=12, choices=EstadoInconsistencia.choices,
        default=EstadoInconsistencia.JUSTIFICADA,
    )
    motivo = models.TextField('motivo', blank=True)

    class Meta:
        db_table = 'asistencia_justificaciones'
        verbose_name = 'justificación de inconsistencia'
        verbose_name_plural = 'justificaciones de inconsistencias'
        ordering = ('-fecha', 'empleado__apellido')
        constraints = [
            models.UniqueConstraint(
                fields=('empleado', 'fecha', 'tipo'), condition=models.Q(borrado=False),
                name='uq_justificacion_viva',
            ),
        ]
        indexes = [
            models.Index(fields=('fecha', 'tipo'), name='idx_justificacion_fecha'),
        ]

    def __str__(self):
        return f'{self.empleado} · {self.get_tipo_display()} {self.fecha:%d/%m} ({self.estado})'


def sucursales_con_reloj() -> set:
    """Ids de sucursales con al menos un reloj activo.

    A una sucursal sin reloj no se le puede pedir que fiche: sus jornadas no
    se evalúan (ni ausencias, ni tarde, ni inconsistencias). Se deriva del
    equipamiento en vez de pedir otra configuración: en cuanto se da de alta
    el reloj, esa sucursal empieza a controlarse sola.
    """
    return set(
        Dispositivo.objects.filter(activo=True)
        .values_list('sucursal_id', flat=True)
        .distinct()
    )
