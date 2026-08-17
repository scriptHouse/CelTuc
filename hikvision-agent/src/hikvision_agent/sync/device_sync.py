"""Sincronización A: Hikvision → SQLite (spec §9/§37).

Watermark temporal + ventana de solapamiento: nunca se confía en "la última
fecha" a secas. Los duplicados que genera el solapamiento los absorbe el
buffer (uid único) y, de última, la idempotencia del backend.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from ..config import ConfigHolder, Secrets
from ..hikvision import parser
from ..hikvision.client import HikvisionClient
from ..storage.repository import Repository
from .status import StatusBoard

log = logging.getLogger(__name__)

_CHUNK_DAYS = 7  # las recuperaciones largas se piden en tramos chicos


class DeviceSync:
    def __init__(
        self,
        holder: ConfigHolder,
        secrets: Secrets,
        status: StatusBoard,
        db_path: Path,
    ):
        self._holder = holder
        self._secrets = secrets
        self._status = status
        self._db_path = db_path
        self._repositorio: Repository | None = None

    @property
    def _repo(self) -> Repository:
        """La conexión SQLite se abre PEREZOSAMENTE, ya dentro del hilo que la usa.

        sqlite3 prohíbe usar una conexión desde un hilo distinto al que la
        creó, y cada loop del agente corre en su propio hilo. Si el repo se
        construyera en `__init__` (que corre en el hilo principal), el primer
        acceso desde el loop reventaría con `ProgrammingError`.
        """
        if self._repositorio is None:
            self._repositorio = Repository(self._db_path)
        return self._repositorio

    def run_once(self) -> int:
        """Un ciclo de polling. Devuelve la cantidad de eventos nuevos."""
        config = self._holder.current
        cliente = HikvisionClient(config.device, self._secrets.hikvision_password)

        try:
            return self._sincronizar(cliente, config)
        except Exception as exc:
            self._status.device_fail(str(exc))
            raise

    def _sincronizar(self, cliente: HikvisionClient, config) -> int:
        # Identidad del dispositivo: necesaria para construir uids estables.
        info = self._status.device_info
        if info is None or not info.serial:
            info = cliente.get_device_info()
            self._status.set_device_info(info)
            self._repo.set_device_serial(info.serial)
            log.info(
                "Reloj conectado: modelo=%s serial=%s firmware=%s",
                info.model, info.serial, info.firmware,
            )
        serial = info.serial or self._repo.get_device_serial() or config.device.host

        tz = ZoneInfo(config.device.timezone)
        ahora = datetime.now(tz)
        marca = self._repo.get_watermark()
        if marca is not None:
            inicio = marca.astimezone(tz) - timedelta(seconds=config.device.overlap_seconds)
        else:
            inicio = ahora - timedelta(days=config.device.initial_backfill_days)
            log.info("Primera sincronización: recuperando desde %s", inicio.isoformat(timespec="seconds"))

        nuevos = 0
        duplicados = 0
        ignorados = 0
        cursor = inicio
        while cursor < ahora:
            fin_tramo = min(cursor + timedelta(days=_CHUNK_DAYS), ahora)
            for item in cliente.search_events(cursor, fin_tramo):
                evento = parser.parse_event_item(item, serial, config.device.timezone)
                if evento is None:
                    ignorados += 1
                    continue
                if self._repo.insert_event_if_new(evento):
                    nuevos += 1
                else:
                    duplicados += 1

            # La marca de agua avanza tramo a tramo, no al final del todo.
            #
            # Una recuperación histórica larga son cientos de consultas ISAPI
            # seguidas, y el reloj llega a cortarlas (401). Si el progreso solo
            # se guardara al terminar el rango completo, cada reintento
            # empezaría de cero, volvería a martillar al equipo y nunca
            # terminaría. Guardando por tramo, el reintento RETOMA donde quedó.
            cursor = fin_tramo
            self._repo.set_watermark(fin_tramo)
        self._status.device_ok(info, datetime.now(tz))

        if nuevos or duplicados or ignorados:
            log.info(
                "Reloj consultado: %s nuevos, %s ya conocidos, %s no-fichada",
                nuevos, duplicados, ignorados,
            )
        return nuevos
