"""Repositorio del buffer local.

Estados de un evento: PENDING → SYNCED (confirmado por el backend) o
ERROR (rechazado repetidas veces). Nunca se marca SYNCED sin confirmación
del servidor y nunca se borra un evento local (spec §27/§49).
"""
from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from pathlib import Path

from ..hikvision.models import ClockEvent
from . import database

PENDING = "PENDING"
SYNCED = "SYNCED"
ERROR = "ERROR"

_KEY_WATERMARK = "last_successful_device_poll"
_KEY_REMOTE_CONFIG = "remote_config"
_KEY_DEVICE_SERIAL = "device_serial"

# Un rechazo puntual (400) se reintenta un par de veces por si fue transitorio,
# pero jamás en loop infinito (spec §40).
MAX_REJECT_RETRIES = 3


def _ahora() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Repository:
    """Buffer local. Seguro de usar desde varios hilos.

    sqlite3 prohíbe usar una conexión desde un hilo distinto al que la creó, y
    este repositorio viaja entre el hilo principal (arranque) y los tres loops
    del agente. Por eso la conexión vive en un `threading.local`: cada hilo
    abre la suya la primera vez que la usa y deja de importar dónde se
    construyó el Repository.
    """

    def __init__(self, db_path: Path):
        self._db_path = Path(db_path)
        self._local = threading.local()

    @property
    def _conn(self):
        """La conexión de ESTE hilo (se abre en el primer uso)."""
        conexion = getattr(self._local, "conexion", None)
        if conexion is None:
            conexion = database.connect(self._db_path)
            self._local.conexion = conexion
        return conexion

    def close(self) -> None:
        """Cierra la conexión de este hilo (las de otros hilos siguen vivas)."""
        conexion = getattr(self._local, "conexion", None)
        if conexion is not None:
            conexion.close()
            self._local.conexion = None

    # ----------------------------------------------------------------- eventos
    def insert_event_if_new(self, evento: ClockEvent) -> bool:
        """Inserta un evento si no existía. Devuelve True si era nuevo."""
        with self._conn:
            cursor = self._conn.execute(
                """
                INSERT OR IGNORE INTO local_events
                    (uid, source_event_id, employee_number, employee_name,
                     occurred_at, event_type, verification_method, raw_payload, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    evento.uid,
                    evento.source_event_id,
                    evento.employee_number,
                    evento.employee_name,
                    evento.occurred_at.isoformat(timespec="seconds"),
                    evento.event_type,
                    evento.verification_method,
                    json.dumps(evento.raw, ensure_ascii=False, default=str),
                    _ahora(),
                ),
            )
        return cursor.rowcount > 0

    def pending_events(self, limit: int) -> list[dict]:
        filas = self._conn.execute(
            """
            SELECT uid, source_event_id, employee_number, employee_name,
                   occurred_at, event_type, verification_method, raw_payload
            FROM local_events
            WHERE sync_status = ?
            ORDER BY occurred_at
            LIMIT ?
            """,
            (PENDING, limit),
        ).fetchall()
        eventos = []
        for fila in filas:
            try:
                raw = json.loads(fila["raw_payload"])
            except ValueError:
                raw = {}
            eventos.append(
                {
                    "uid": fila["uid"],
                    "source_event_id": fila["source_event_id"],
                    "employee_number": fila["employee_number"],
                    "employee_name": fila["employee_name"],
                    "occurred_at": fila["occurred_at"],
                    "event_type": fila["event_type"],
                    "verification_method": fila["verification_method"],
                    "raw": raw,
                }
            )
        return eventos

    def mark_synced(self, uids: list[str]) -> None:
        if not uids:
            return
        ahora = _ahora()
        with self._conn:
            self._conn.executemany(
                "UPDATE local_events SET sync_status = ?, synced_at = ?, last_error = NULL WHERE uid = ?",
                [(SYNCED, ahora, uid) for uid in uids],
            )

    def mark_rejected(self, uid: str, error: str) -> str:
        """Registra un rechazo del backend; tras varios intentos pasa a ERROR."""
        with self._conn:
            fila = self._conn.execute(
                "SELECT retry_count FROM local_events WHERE uid = ?", (uid,)
            ).fetchone()
            if fila is None:
                return ERROR
            reintentos = int(fila["retry_count"]) + 1
            estado = ERROR if reintentos >= MAX_REJECT_RETRIES else PENDING
            self._conn.execute(
                "UPDATE local_events SET retry_count = ?, last_error = ?, sync_status = ? WHERE uid = ?",
                (reintentos, error[:500], estado, uid),
            )
        return estado

    def counts(self) -> dict[str, int]:
        filas = self._conn.execute(
            "SELECT sync_status, COUNT(*) AS cantidad FROM local_events GROUP BY sync_status"
        ).fetchall()
        conteo = {PENDING: 0, SYNCED: 0, ERROR: 0}
        for fila in filas:
            conteo[fila["sync_status"]] = int(fila["cantidad"])
        return conteo

    # ------------------------------------------------------------------ estado
    def get_state(self, clave: str) -> str | None:
        fila = self._conn.execute("SELECT value FROM kv_state WHERE key = ?", (clave,)).fetchone()
        return fila["value"] if fila else None

    def set_state(self, clave: str, valor: str) -> None:
        with self._conn:
            self._conn.execute(
                """
                INSERT INTO kv_state (key, value, updated_at) VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
                """,
                (clave, valor, _ahora()),
            )

    def get_watermark(self) -> datetime | None:
        crudo = self.get_state(_KEY_WATERMARK)
        if not crudo:
            return None
        try:
            return datetime.fromisoformat(crudo)
        except ValueError:
            return None

    def set_watermark(self, momento: datetime) -> None:
        self.set_state(_KEY_WATERMARK, momento.isoformat(timespec="seconds"))

    def get_cached_remote_config(self) -> dict:
        crudo = self.get_state(_KEY_REMOTE_CONFIG)
        if not crudo:
            return {}
        try:
            datos = json.loads(crudo)
        except ValueError:
            return {}
        return datos if isinstance(datos, dict) else {}

    def set_cached_remote_config(self, config: dict) -> None:
        self.set_state(_KEY_REMOTE_CONFIG, json.dumps(config, ensure_ascii=False))

    def get_device_serial(self) -> str:
        return self.get_state(_KEY_DEVICE_SERIAL) or ""

    def set_device_serial(self, serial: str) -> None:
        if serial:
            self.set_state(_KEY_DEVICE_SERIAL, serial)
