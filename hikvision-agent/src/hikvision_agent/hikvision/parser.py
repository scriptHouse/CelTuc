"""Parser de eventos ISAPI (AcsEvent) → ClockEvent.

IMPORTANTE: el formato exacto depende del firmware. Este parser es defensivo:
usa los campos documentados por Hikvision cuando existen, nunca descarta el
payload original (viaja en ``raw``) y ante un valor desconocido degrada a
"unknown" en vez de romper. Validar SIEMPRE contra un payload real capturado
con ``hikvision-agent diag --save-fixture`` antes de dar por cerrado un cambio.
"""
from __future__ import annotations

import hashlib
import logging
from datetime import datetime
from zoneinfo import ZoneInfo

from .models import ClockEvent

log = logging.getLogger(__name__)

# Estados de asistencia documentados por Hikvision para la serie MinMoe.
#
# OJO (validado 2026-08-17 contra un DS-K1A340WX real, firmware V1.2.7 build
# 240228): si el modulo de Hora y Asistencia del reloj no esta configurado, el
# equipo manda SIEMPRE "undefined" y nunca entrada/salida. Por eso el backend
# deriva entrada/salida alternando las fichadas del dia (ver
# `asistencia.jornada`): este mapa solo aporta el dato cuando el reloj lo sabe.
ATTENDANCE_STATUS_MAP = {
    "checkin": "check_in",
    "checkout": "check_out",
    "breakout": "break_out",
    "breakin": "break_in",
    "overtimein": "overtime_in",
    "overtimeout": "overtime_out",
    "undefined": "unknown",   # el reloj no clasifica: lo resuelve el backend
}

# currentVerifyMode / attendanceStatus llegan en camelCase variable según firmware.
VERIFY_MODE_MAP = {
    "face": "face",
    "facerecognition": "face",
    "card": "card",
    "cardorface": "face",
    "cardandface": "face",
    "fingerprint": "fingerprint",
    "fp": "fingerprint",
    "password": "password",
    "pw": "password",
    "remote": "remote",
    # El reloj real reporta los metodos HABILITADOS en el lector, no el que la
    # persona uso. No es un dato util, pero se registra tal cual en vez de
    # ensuciar el listado con "Otro".
    "faceorfporcardorpw": "multiple",
    "faceorfporcard": "multiple",
    "faceorcardorpw": "multiple",
    "faceorfp": "multiple",
}


def _normalizar(valor: str | None) -> str:
    return (valor or "").replace("_", "").replace("-", "").strip().lower()


def parse_time(texto: str | None, default_tz: str) -> datetime | None:
    """Parsea el timestamp del reloj; si viene sin zona, asume la configurada."""
    if not texto:
        return None
    try:
        momento = datetime.fromisoformat(str(texto))
    except ValueError:
        return None
    if momento.tzinfo is None:
        momento = momento.replace(tzinfo=ZoneInfo(default_tz))
    return momento


def build_event_uid(
    device_serial: str,
    source_event_id: str,
    employee_number: str,
    occurred_at: datetime,
    event_type: str,
    method: str,
) -> str:
    """Identificador estable del evento para deduplicar en el buffer local.

    Prioridad (ver spec §7): si el reloj entrega un id propio (serialNo) se usa
    ese; si no, un hash de los campos estables.
    """
    if source_event_id:
        base = f"{device_serial}|sn:{source_event_id}"
    else:
        base = "|".join(
            [
                device_serial,
                employee_number,
                occurred_at.astimezone(ZoneInfo("UTC")).isoformat(timespec="seconds"),
                event_type,
                method,
            ]
        )
    return hashlib.sha256(base.encode("utf-8")).hexdigest()


def parse_event_item(item: dict, device_serial: str, default_tz: str) -> ClockEvent | None:
    """Convierte un elemento de InfoList en ClockEvent.

    Devuelve None para registros que no son fichadas de personas (eventos de
    puerta, tamper, etc.: sin número de empleado).
    """
    if not isinstance(item, dict):
        return None

    numero = str(item.get("employeeNoString") or item.get("employeeNo") or "").strip()
    if not numero:
        log.debug("Evento sin numero de empleado ignorado: %s", {k: item.get(k) for k in ("major", "minor", "time")})
        return None

    momento = parse_time(item.get("time"), default_tz)
    if momento is None:
        log.warning("Evento con fecha invalida ignorado: %r", item.get("time"))
        return None

    tipo = ATTENDANCE_STATUS_MAP.get(_normalizar(item.get("attendanceStatus")), "unknown")
    metodo = VERIFY_MODE_MAP.get(_normalizar(item.get("currentVerifyMode")), "unknown")
    source_id = str(item.get("serialNo") or "").strip()

    return ClockEvent(
        uid=build_event_uid(device_serial, source_id, numero, momento, tipo, metodo),
        source_event_id=source_id,
        employee_number=numero,
        employee_name=str(item.get("name") or "").strip(),
        occurred_at=momento,
        event_type=tipo,
        verification_method=metodo,
        raw=item,
    )
