"""Sincronización B: SQLite → Django (spec §9/§39).

Un evento se marca SYNCED únicamente cuando el backend confirmó `accepted`
o `duplicate`. Los `rejected` reintentan un puñado de veces y pasan a ERROR.
"""
from __future__ import annotations

import logging
from pathlib import Path

from ..backend.client import BackendClient
from ..config import ConfigHolder, Secrets
from ..storage.repository import Repository

log = logging.getLogger(__name__)


class BackendSync:
    def __init__(self, holder: ConfigHolder, secrets: Secrets, db_path: Path):
        self._holder = holder
        self._secrets = secrets
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
        """Un ciclo de subida. Devuelve la cantidad de eventos confirmados."""
        config = self._holder.current
        lote = self._repo.pending_events(limit=config.backend.batch_size)
        if not lote:
            return 0

        cliente = BackendClient(config.backend, self._secrets.backend_token)
        resultado = cliente.send_events(lote)

        confirmados: list[str] = []
        rechazados = 0
        for item in resultado.results:
            if item.status in ("accepted", "duplicate"):
                confirmados.append(item.uid)
            elif item.status == "rejected":
                rechazados += 1
                estado = self._repo.mark_rejected(item.uid, item.error or "rechazado por el backend")
                log.warning("Evento %s rechazado (%s): %s", item.uid[:12], estado, item.error)

        self._repo.mark_synced(confirmados)
        log.info(
            "Subida al backend: %s aceptados, %s duplicados, %s rechazados",
            resultado.accepted, resultado.duplicates, rechazados,
        )
        return len(confirmados)
