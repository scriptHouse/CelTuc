"""Cálculo de la jornada diaria de un empleado.

Este módulo es puro: recibe fichadas ya cargadas y devuelve el análisis del
día. No toca la base de datos, así que es fácil de testear y de reprocesar.

## Por qué hay que derivar entrada/salida

El DS-K1A340WX real (firmware V1.2.7) manda SIEMPRE ``attendanceStatus:
"undefined"``: no clasifica entrada ni salida, solo registra "esta persona
pasó por acá a esta hora". Validado contra el equipo el 2026-08-17.

Entonces las fichadas del día se **alternan**: la 1ª es entrada, la 2ª salida,
la 3ª entrada otra vez, y así. Eso resuelve solo las salidas parciales:

    09:00 entrada → 13:00 salida → 14:30 entrada → 18:00 salida
      └── tramo 1 (4 h) ──┘  └ausente 1 h 30┘  └── tramo 2 (3 h 30) ──┘

Si algún día se configura el módulo de Hora y Asistencia del reloj, los
eventos van a traer el tipo real y este módulo lo prefiere automáticamente.

## Anti-rebote

Un rostro se puede leer dos veces en segundos. Sin protección, esa doble
lectura invertiría la paridad y arruinaría el día entero (una entrada
pasaría a leerse como salida). Por eso las fichadas consecutivas dentro de
la ventana anti-rebote del turno se cuentan una sola vez.

## Qué se espera de cada día

El horario esperado sale del turno, que puede ser **semanal** (por día de la
semana) o **rotativo** (ciclo de N días, con desfase por empleado). Sobre ese
horario se aplican, en orden:

1. **Feriado**: no se espera a nadie. Si igual trabajaron, se registra como
   trabajo en feriado (dato útil para liquidar).
2. **Licencia de día completo**: tampoco se espera a nadie.
3. **Licencia por horas**: se descuenta solo esa franja del horario
   esperado; el resto del día se sigue esperando.

## Dónde se lo esperaba

Aparte del horario, cada jornada lleva la sucursal que le tocaba ese día y
las que informan los relojes donde fichó. Cuando no coinciden, la jornada
queda marcada: con gente que rota entre locales, "vino a trabajar" y "vino
al local que le tocaba" dejan de ser la misma pregunta.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta

from django.db import models
from django.utils import timezone

from .models import Severidad, TipoInconsistencia

MINUTOS_ANTIREBOTE_DEFECTO = 2

# Tipos que el reloj usa cuando SÍ tiene configurada la asistencia.
TIPOS_ENTRADA = {'check_in', 'overtime_in', 'break_in'}
TIPOS_SALIDA = {'check_out', 'overtime_out', 'break_out'}


class EstadoJornada(models.TextChoices):
    OK = 'ok', 'Presente'
    TARDE = 'tarde', 'Llegó tarde'
    SALIDA_TEMPRANA = 'salida_temprana', 'Se retiró antes'
    INCOMPLETA = 'incompleta', 'Falta fichar la salida'
    AUSENTE = 'ausente', 'Ausente'
    LICENCIA = 'licencia', 'Licencia'
    FERIADO = 'feriado', 'Feriado'
    NO_LABORABLE = 'no_laborable', 'No laborable'
    SIN_TURNO = 'sin_turno', 'Sin turno asignado'
    SIN_RELOJ = 'sin_reloj', 'Sucursal sin reloj'


@dataclass
class Tramo:
    """Un bloque continuo de presencia: entró y salió."""

    entrada: datetime
    salida: datetime | None = None

    @property
    def abierto(self) -> bool:
        return self.salida is None

    @property
    def minutos(self) -> int:
        if self.salida is None:
            return 0
        return max(0, int((self.salida - self.entrada).total_seconds() // 60))

    def to_dict(self) -> dict:
        return {
            'entrada': self.entrada.isoformat(),
            'salida': self.salida.isoformat() if self.salida else None,
            'minutos': self.minutos,
            'abierto': self.abierto,
        }


@dataclass
class SalidaParcial:
    """El hueco entre dos tramos: se fue y volvió dentro del mismo día."""

    desde: datetime
    hasta: datetime

    @property
    def minutos(self) -> int:
        return max(0, int((self.hasta - self.desde).total_seconds() // 60))

    def to_dict(self) -> dict:
        return {
            'desde': self.desde.isoformat(),
            'hasta': self.hasta.isoformat(),
            'minutos': self.minutos,
        }


@dataclass
class Inconsistencia:
    """Algo del día que amerita una mirada.

    No se guarda: se recalcula siempre desde las fichadas y las reglas
    vigentes. Lo único persistente es la justificación, que se le pega
    después buscando por `clave`.
    """

    tipo: str
    severidad: str = Severidad.MODERADA
    minutos: int = 0
    detalle: str = ''
    requiere_justificacion: bool = True
    # Los completa quien tenga la base a mano (ver `views.ResumenAsistenciaView`).
    estado: str = 'pendiente'
    motivo: str = ''
    resuelta_por: str = ''

    def to_dict(self, clave: str = '') -> dict:
        return {
            'tipo': self.tipo,
            'tipo_display': TipoInconsistencia(self.tipo).label,
            'severidad': self.severidad,
            'severidad_display': Severidad(self.severidad).label,
            'minutos': self.minutos,
            'detalle': self.detalle,
            'requiere_justificacion': self.requiere_justificacion,
            'estado': self.estado,
            'motivo': self.motivo,
            'resuelta_por': self.resuelta_por,
            'clave': clave,
        }


@dataclass
class Jornada:
    fecha: date
    empleado_id: int | None = None
    nombre: str = ''
    numero_reloj: str = ''
    sin_mapear: bool = False
    turno_nombre: str = ''
    estado: str = EstadoJornada.SIN_TURNO
    tramos: list[Tramo] = field(default_factory=list)
    salidas_parciales: list[SalidaParcial] = field(default_factory=list)
    minutos_trabajados: int = 0
    minutos_esperados: int = 0
    llegada_tarde_minutos: int = 0
    salida_temprana_minutos: int = 0
    fichadas: int = 0
    licencia: dict | None = None
    feriado: dict | None = None
    horario_esperado: str = ''
    # Dónde se lo esperaba ese día y dónde fichó realmente. Con gente que rota
    # entre locales, "vino a trabajar" y "vino al local que le tocaba" dejan
    # de ser la misma pregunta.
    sucursal_esperada: dict | None = None
    sucursales_fichadas: list[dict] = field(default_factory=list)
    inconsistencias: list[Inconsistencia] = field(default_factory=list)
    # Horario del día ya resuelto (lo usa la detección; no se serializa).
    entrada_esperada: datetime | None = None
    salida_esperada: datetime | None = None

    @property
    def primera(self) -> datetime | None:
        return self.tramos[0].entrada if self.tramos else None

    @property
    def ultima(self) -> datetime | None:
        if not self.tramos:
            return None
        return self.tramos[-1].salida or self.tramos[-1].entrada

    @property
    def minutos_fuera(self) -> int:
        return sum(s.minutos for s in self.salidas_parciales)

    @property
    def trabajo_en_feriado(self) -> bool:
        return self.feriado is not None and self.minutos_trabajados > 0

    @property
    def fichada_en_otra_sucursal(self) -> bool:
        """Fichó, pero en ningún reloj de la sucursal donde se lo esperaba."""
        if not self.sucursal_esperada or not self.sucursales_fichadas:
            return False
        return self.sucursal_esperada['id'] not in {
            s['id'] for s in self.sucursales_fichadas if s.get('id')
        }

    def to_dict(self) -> dict:
        return {
            'fecha': self.fecha.isoformat(),
            'empleado': (
                {'id': self.empleado_id, 'nombre': self.nombre} if self.empleado_id else None
            ),
            'nombre': self.nombre,
            'numero_reloj': self.numero_reloj,
            'sin_mapear': self.sin_mapear,
            'turno': self.turno_nombre,
            'horario_esperado': self.horario_esperado,
            'estado': self.estado,
            'estado_display': EstadoJornada(self.estado).label,
            'tramos': [t.to_dict() for t in self.tramos],
            'salidas_parciales': [s.to_dict() for s in self.salidas_parciales],
            'primera': self.primera.isoformat() if self.primera else None,
            'ultima': self.ultima.isoformat() if self.ultima else None,
            'minutos_trabajados': self.minutos_trabajados,
            'minutos_esperados': self.minutos_esperados,
            'minutos_fuera': self.minutos_fuera,
            'llegada_tarde_minutos': self.llegada_tarde_minutos,
            'salida_temprana_minutos': self.salida_temprana_minutos,
            'fichadas': self.fichadas,
            'licencia': self.licencia,
            'feriado': self.feriado,
            'trabajo_en_feriado': self.trabajo_en_feriado,
            'sucursal_esperada': self.sucursal_esperada,
            'sucursales_fichadas': self.sucursales_fichadas,
            'fichada_en_otra_sucursal': self.fichada_en_otra_sucursal,
            'inconsistencias': [
                i.to_dict(self.clave_de(i.tipo)) for i in self.inconsistencias
            ],
            'pendientes': self.pendientes,
        }

    def clave_de(self, tipo: str) -> str:
        """Identifica una inconsistencia entre recálculos: quién, cuándo, qué."""
        return f'{self.empleado_id or 0}|{self.fecha.isoformat()}|{tipo}'

    @property
    def pendientes(self) -> int:
        return sum(
            1 for i in self.inconsistencias
            if i.requiere_justificacion and i.estado == 'pendiente'
        )


# --- Derivación de presencia -------------------------------------------------

def colapsar_rebotes(fichadas, minutos_antirebote: int) -> list:
    """Descarta relecturas: dos fichadas seguidas muy juntas son una sola."""
    if minutos_antirebote <= 0:
        return list(fichadas)
    ventana = timedelta(minutes=minutos_antirebote)
    limpias = []
    for f in fichadas:
        if limpias and (f.ocurrida_en - limpias[-1].ocurrida_en) < ventana:
            continue
        limpias.append(f)
    return limpias


def armar_tramos(fichadas) -> list[Tramo]:
    """Empareja las fichadas del día en tramos de presencia.

    Usa el tipo que informa el reloj si al menos una fichada lo trae; si no
    (el caso real del DS-K1A340WX), alterna entrada/salida por posición.
    """
    usar_tipos = any(f.tipo in TIPOS_ENTRADA or f.tipo in TIPOS_SALIDA for f in fichadas)

    tramos: list[Tramo] = []
    abierto: datetime | None = None
    for indice, f in enumerate(fichadas):
        if usar_tipos and f.tipo in TIPOS_ENTRADA:
            es_entrada = True
        elif usar_tipos and f.tipo in TIPOS_SALIDA:
            es_entrada = False
        else:
            es_entrada = (indice % 2 == 0) if not usar_tipos else abierto is None

        if es_entrada:
            if abierto is None:
                abierto = f.ocurrida_en
        else:
            if abierto is not None:
                tramos.append(Tramo(entrada=abierto, salida=f.ocurrida_en))
                abierto = None

    if abierto is not None:
        tramos.append(Tramo(entrada=abierto, salida=None))
    return tramos


def salidas_parciales_de(tramos: list[Tramo]) -> list[SalidaParcial]:
    """Los huecos entre tramos cerrados: se fue y volvió el mismo día."""
    huecos = []
    for anterior, siguiente in zip(tramos, tramos[1:]):
        if anterior.salida is not None:
            huecos.append(SalidaParcial(desde=anterior.salida, hasta=siguiente.entrada))
    return huecos


# --- Horario esperado --------------------------------------------------------

def _combinar(fecha: date, hora: time) -> datetime:
    return timezone.make_aware(datetime.combine(fecha, hora))


def restar_franja(intervalos, quitar_desde, quitar_hasta):
    """Saca una franja horaria de una lista de intervalos.

    Es lo que convierte una licencia por horas en "el resto del día se sigue
    esperando": si el turno es 09:00-18:00 y hay licencia 09:00-13:00, queda
    esperado 13:00-18:00.
    """
    resultado = []
    for inicio, fin in intervalos:
        if quitar_hasta <= inicio or quitar_desde >= fin:
            resultado.append((inicio, fin))
            continue
        if quitar_desde > inicio:
            resultado.append((inicio, quitar_desde))
        if quitar_hasta < fin:
            resultado.append((quitar_hasta, fin))
    return resultado


def _minutos(intervalos) -> int:
    return sum(int((fin - inicio).total_seconds() // 60) for inicio, fin in intervalos)


# --- Cálculo principal -------------------------------------------------------

def calcular(
    fecha: date,
    fichadas: list,
    *,
    empleado_id: int | None = None,
    nombre: str = '',
    numero_reloj: str = '',
    sin_mapear: bool = False,
    turno=None,
    licencia=None,
    feriado=None,
    desfase: int = 0,
    sucursal_esperada: dict | None = None,
    sucursales_fichadas: list[dict] | None = None,
    reglas: dict | None = None,
    evaluar: bool = True,
) -> Jornada:
    """Analiza el día de una persona. `fichadas` debe venir ordenada por hora.

    `reglas` es el catálogo ya resuelto para el turno de esa persona (ver
    `models.resolver_reglas`). Sin él, el día se analiza igual pero no se
    generan inconsistencias y la puntualidad se juzga con la tolerancia del
    turno.

    `evaluar=False` es el caso de la sucursal sin reloj: se muestra lo que
    haya, pero no se juzga nada — no se puede exigir una marca donde no hay
    dónde marcar.
    """
    jornada = Jornada(
        fecha=fecha,
        empleado_id=empleado_id,
        nombre=nombre,
        numero_reloj=numero_reloj,
        sin_mapear=sin_mapear,
        turno_nombre=turno.nombre if turno else '',
        sucursal_esperada=sucursal_esperada,
        sucursales_fichadas=list(sucursales_fichadas or []),
    )

    antirebote = turno.minutos_antirebote if turno else MINUTOS_ANTIREBOTE_DEFECTO
    limpias = colapsar_rebotes(fichadas, antirebote)
    jornada.fichadas = len(limpias)

    jornada.tramos = armar_tramos(limpias)
    jornada.salidas_parciales = salidas_parciales_de(jornada.tramos)
    jornada.minutos_trabajados = sum(t.minutos for t in jornada.tramos)

    # Horario esperado del día, según el patrón del turno.
    esperados: list[tuple[datetime, datetime]] = []
    if turno is not None:
        tramos_turno = turno.tramos_de(fecha, desfase)
        esperados = [
            (_combinar(fecha, t.hora_entrada), _combinar(fecha, t.hora_salida))
            for t in tramos_turno
        ]
        jornada.horario_esperado = ' / '.join(
            f'{t.hora_entrada:%H:%M}-{t.hora_salida:%H:%M}' for t in tramos_turno
        )

    if feriado is not None:
        jornada.feriado = {
            'nombre': feriado.nombre,
            'tipo': feriado.tipo,
            'tipo_display': feriado.get_tipo_display(),
        }

    if licencia is not None:
        jornada.licencia = {
            'tipo': licencia.tipo,
            'tipo_display': licencia.get_tipo_display(),
            'desde': licencia.desde.isoformat(),
            'hasta': licencia.hasta.isoformat(),
            'jornada_completa': licencia.jornada_completa,
            'hora_desde': licencia.hora_desde.strftime('%H:%M') if licencia.hora_desde else None,
            'hora_hasta': licencia.hora_hasta.strftime('%H:%M') if licencia.hora_hasta else None,
            'observacion': licencia.observacion,
        }

    # 1) Feriado: no se espera a nadie. Si trabajaron, queda registrado.
    if feriado is not None:
        jornada.minutos_esperados = 0
        jornada.estado = EstadoJornada.FERIADO
        return _cerrar(jornada, reglas)

    # 2) Licencia de día completo.
    if licencia is not None and not licencia.es_parcial:
        jornada.minutos_esperados = 0
        jornada.estado = EstadoJornada.LICENCIA
        return _cerrar(jornada, reglas)

    # 3) Licencia por horas: se descuenta esa franja del horario esperado.
    if licencia is not None and licencia.es_parcial and esperados:
        esperados = restar_franja(
            esperados,
            _combinar(fecha, licencia.hora_desde),
            _combinar(fecha, licencia.hora_hasta),
        )
        if not esperados:
            # La franja se comió todo el horario del día.
            jornada.minutos_esperados = 0
            jornada.estado = EstadoJornada.LICENCIA
            return _cerrar(jornada, reglas)

    jornada.minutos_esperados = _minutos(esperados)
    if esperados:
        jornada.entrada_esperada = esperados[0][0]
        jornada.salida_esperada = esperados[-1][1]

    # 4) Sucursal sin reloj: se muestra el día, no se juzga.
    if not evaluar:
        jornada.estado = EstadoJornada.SIN_RELOJ
        return _cerrar(jornada, reglas)

    if turno is None:
        # Sin turno asignado no hay contra qué comparar: mostramos los tramos
        # y las horas, pero no juzgamos puntualidad ni ausencia.
        jornada.estado = EstadoJornada.SIN_TURNO
        return _cerrar(jornada, reglas)

    if not esperados:
        jornada.estado = EstadoJornada.NO_LABORABLE
        return _cerrar(jornada, reglas)

    if not limpias:
        jornada.estado = EstadoJornada.AUSENTE
        return _cerrar(jornada, reglas)

    tolerancia_entrada = umbral_de(
        reglas, TipoInconsistencia.LLEGADA_TARDE, turno.tolerancia_entrada
    )
    tolerancia_salida = umbral_de(
        reglas, TipoInconsistencia.SALIDA_TEMPRANA, turno.tolerancia_salida
    )

    if tolerancia_entrada is not None and jornada.primera and jornada.entrada_esperada:
        atraso = int((jornada.primera - jornada.entrada_esperada).total_seconds() // 60)
        if atraso > tolerancia_entrada:
            jornada.llegada_tarde_minutos = atraso

    ultima = jornada.ultima
    abierta = any(t.abierto for t in jornada.tramos)
    if (
        tolerancia_salida is not None
        and ultima and not abierta and jornada.salida_esperada
        and ultima < jornada.salida_esperada
    ):
        adelanto = int((jornada.salida_esperada - ultima).total_seconds() // 60)
        if adelanto > tolerancia_salida:
            jornada.salida_temprana_minutos = adelanto

    if abierta:
        jornada.estado = EstadoJornada.INCOMPLETA
    elif jornada.llegada_tarde_minutos:
        jornada.estado = EstadoJornada.TARDE
    elif jornada.salida_temprana_minutos:
        jornada.estado = EstadoJornada.SALIDA_TEMPRANA
    else:
        jornada.estado = EstadoJornada.OK
    return _cerrar(jornada, reglas)


def _cerrar(jornada: Jornada, reglas: dict | None) -> Jornada:
    """Ultimo paso comun: buscarle al dia lo que haya para revisar."""
    jornada.inconsistencias = detectar(jornada, reglas)
    return jornada


# --- Deteccion de inconsistencias --------------------------------------------

def umbral_de(reglas, tipo, defecto=None):
    """Minutos de tolerancia de un tipo, o None si no hay que juzgarlo.

    Tres casos, en este orden:

    - Sin catalogo de reglas (`reglas` vacio): vale `defecto`, que es la
      tolerancia del turno. Es como venia funcionando antes de que existieran
      las reglas, y lo que mantiene util al motor fuera de la base.
    - Regla apagada: devuelve None. Apagar "llego tarde" no solo deja de
      generar la inconsistencia: tambien deja de teñir el estado del dia.
    - Regla prendida: su umbral, y si lo dejaron vacio, el del turno.
    """
    cfg = (reglas or {}).get(tipo)
    if cfg is None:
        return defecto
    if not cfg.get('activa'):
        return None
    umbral = cfg.get('umbral')
    return defecto if umbral is None else umbral


def detectar(jornada, reglas) -> list[Inconsistencia]:
    """Que hay para revisar en este dia, segun las reglas vigentes."""
    if not reglas:
        return []

    # Sin reloj en su sucursal no hay nada que reprochar, ni siquiera haber
    # fichado en otro local: es lo unico que podia hacer.
    if jornada.estado == EstadoJornada.SIN_RELOJ:
        return []

    detectadas: list[Inconsistencia] = []

    def activa(tipo):
        cfg = reglas.get(tipo)
        return cfg if cfg and cfg.get('activa') else None

    def agregar(tipo, minutos=0, detalle=''):
        cfg = activa(tipo)
        if cfg is None:
            return
        detectadas.append(Inconsistencia(
            tipo=tipo,
            severidad=cfg.get('severidad') or Severidad.MODERADA,
            minutos=minutos,
            detalle=detalle,
            requiere_justificacion=bool(cfg.get('requiere_justificacion', True)),
        ))

    # Fichar en el local equivocado no depende del horario: se mira siempre.
    if jornada.fichada_en_otra_sucursal:
        donde = ' y '.join(s['nombre'] for s in jornada.sucursales_fichadas)
        esperada = (jornada.sucursal_esperada or {}).get('nombre', '')
        agregar(
            TipoInconsistencia.SUCURSAL_INCORRECTA,
            detalle=f'Se lo esperaba en {esperada} y ficho en {donde}.' if esperada else '',
        )

    if jornada.feriado is not None:
        if jornada.minutos_trabajados > 0:
            agregar(
                TipoInconsistencia.TRABAJO_EN_FERIADO,
                jornada.minutos_trabajados,
                detalle=jornada.feriado.get('nombre', ''),
            )
        return detectadas

    # Con licencia o sin turno asignado no hay contra que comparar.
    if jornada.estado in (EstadoJornada.LICENCIA, EstadoJornada.SIN_TURNO):
        return detectadas

    if jornada.estado == EstadoJornada.NO_LABORABLE:
        if jornada.fichadas > 0:
            agregar(
                TipoInconsistencia.DIA_NO_LABORABLE,
                jornada.minutos_trabajados,
                detalle='Su turno tenia este dia como franco.',
            )
        return detectadas

    if jornada.estado == EstadoJornada.AUSENTE:
        agregar(TipoInconsistencia.AUSENCIA, jornada.minutos_esperados)
        return detectadas

    # De aca en adelante: hubo marcas y habia horario que cumplir.
    impares = jornada.fichadas % 2 == 1
    falto_entrada = False

    # Un numero impar de marcas significa que falto una punta. Cual, lo dice
    # la distancia: si la primera marca es mucho mas tarde que la entrada
    # prevista, lo que falta es la entrada; si no, la salida.
    cfg_entrada = activa(TipoInconsistencia.FALTA_ENTRADA)
    if impares and cfg_entrada and jornada.entrada_esperada and jornada.primera:
        atraso = int((jornada.primera - jornada.entrada_esperada).total_seconds() // 60)
        if atraso > (cfg_entrada.get('umbral') or 0):
            falto_entrada = True
            agregar(
                TipoInconsistencia.FALTA_ENTRADA, atraso,
                detalle='La primera marca del dia llega demasiado tarde para ser la entrada.',
            )

    if impares and not falto_entrada:
        agregar(
            TipoInconsistencia.FALTA_SALIDA,
            detalle='La jornada quedo abierta: entro y no marco la salida.',
        )

    # Si falto la entrada, el atraso mide una marca que no es la de llegada:
    # reportarlo ademas como tardanza seria acusar por un dato inventado.
    if jornada.llegada_tarde_minutos and not falto_entrada:
        agregar(TipoInconsistencia.LLEGADA_TARDE, jornada.llegada_tarde_minutos)

    if jornada.salida_temprana_minutos:
        agregar(TipoInconsistencia.SALIDA_TEMPRANA, jornada.salida_temprana_minutos)

    cfg_pausa = activa(TipoInconsistencia.PAUSA_EXCESIVA)
    if cfg_pausa and jornada.salidas_parciales:
        peor = max(jornada.salidas_parciales, key=lambda h: h.minutos)
        if peor.minutos > (cfg_pausa.get('umbral') or 0):
            agregar(
                TipoInconsistencia.PAUSA_EXCESIVA, peor.minutos,
                detalle=f'Se fue {formatear_minutos(peor.minutos)} en el medio de la jornada.',
            )

    if jornada.minutos_esperados > 0:
        diferencia = jornada.minutos_trabajados - jornada.minutos_esperados
        cfg_falta = activa(TipoInconsistencia.JORNADA_INCOMPLETA)
        if cfg_falta and -diferencia > (cfg_falta.get('umbral') or 0):
            agregar(TipoInconsistencia.JORNADA_INCOMPLETA, -diferencia)
        cfg_exceso = activa(TipoInconsistencia.EXCESO_JORNADA)
        if cfg_exceso and diferencia > (cfg_exceso.get('umbral') or 0):
            agregar(TipoInconsistencia.EXCESO_JORNADA, diferencia)

    return detectadas


def formatear_minutos(minutos: int) -> str:
    """`465` → `7 h 45 m` (para reportes de texto)."""
    if minutos <= 0:
        return '—'
    horas, resto = divmod(minutos, 60)
    return f'{horas} h {resto:02d} m' if horas else f'{resto} m'
