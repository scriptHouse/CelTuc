"""Heartbeat hacia CelTuc (spec §30) + recarga de config remota.

La respuesta del heartbeat trae la configuración administrada desde la
interfaz de Asistencia; si cambió, se aplica en caliente y se cachea en
SQLite para el próximo arranque sin Internet.
"""
from __future__ import annotations

import logging
import socket
import threading
from pathlib import Path
from datetime import datetime, timezone

from .. import AGENT_VERSION
from ..backend.client import BackendClient
from ..config import ConfigHolder, Secrets
from ..logging_config import set_level
from ..storage.repository import Repository
from .status import StatusBoard

log = logging.getLogger(__name__)

_MAX_SKEW_SECONDS = 120


class Heartbeat:
    def __init__(
        self,
        holder: ConfigHolder,
        secrets: Secrets,
        status: StatusBoard,
        db_path: Path,
        despertar_reloj: threading.Event | None = None,
    ):
        self._holder = holder
        self._secrets = secrets
        self._status = status
        self._db_path = db_path
        self._repositorio: Repository | None = None
        # Con qué avisarle al loop del reloj que lo pidieron desde CelTuc.
        self._despertar_reloj = despertar_reloj
        # None = todavía no se miró ninguna config. La primera vez solo se
        # anota el valor: si no, cada arranque del agente dispararía un
        # reintento por un pedido viejo que ya se cumplió hace rato.
        self._ultimo_reintento: int | None = None

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

    def run_once(self) -> None:
        config = self._holder.current
        cliente = BackendClient(config.backend, self._secrets.backend_token)

        conteo = self._repo.counts()
        estado = self._status.snapshot()
        payload = {
            "agent_version": AGENT_VERSION,
            "hostname": socket.gethostname(),
            "started_at": estado["started_at"],
            "device_reachable": estado["device_reachable"],
            "device_error": estado["device_error"],
            "device_info": estado["device_info"],
            "pending_events": conteo["PENDING"],
            "error_events": conteo["ERROR"],
            "last_device_sync_at": estado["last_device_sync_at"],
            "config_version": config.remote_version,
        }
        respuesta = cliente.heartbeat(payload)

        self._chequear_reloj_servidor(respuesta.get("server_time"))
        self._aplicar_config(respuesta.get("config"))
        self._mirar_pedido_de_reintento()

    def _mirar_pedido_de_reintento(self) -> None:
        """Si desde CelTuc apretaron «reintentar», despierta al loop del reloj.

        El servidor no puede probar el reloj —está en la LAN de la sucursal—,
        así que deja la marca en la config y esto es lo que la convierte en
        acción: el loop descarta su espera y vuelve a intentar enseguida, en vez
        de aguantar los cinco minutos del reintento automático.
        """
        pedido = self._holder.reintento_pedido
        anterior, self._ultimo_reintento = self._ultimo_reintento, pedido

        if anterior is None or pedido <= anterior:
            return
        if self._despertar_reloj is not None:
            self._despertar_reloj.set()
            log.info("Reintento pedido desde CelTuc: despertando el loop del reloj")

    def _aplicar_config(self, remota) -> None:
        if not isinstance(remota, dict) or not remota:
            return
        if self._holder.apply_remote(remota):
            self._repo.set_cached_remote_config(remota)
            nueva = self._holder.current
            set_level(nueva.log_level)
            log.info(
                "Config remota v%s aplicada (reloj cada %ss, subida cada %ss, heartbeat cada %ss)",
                nueva.remote_version,
                nueva.device.poll_seconds,
                nueva.backend.sync_seconds,
                nueva.backend.heartbeat_seconds,
            )

    @staticmethod
    def _chequear_reloj_servidor(server_time) -> None:
        if not server_time:
            return
        try:
            momento = datetime.fromisoformat(str(server_time).replace("Z", "+00:00"))
        except ValueError:
            return
        desfase = abs((datetime.now(timezone.utc) - momento).total_seconds())
        if desfase > _MAX_SKEW_SECONDS:
            log.warning(
                "La hora de la notebook difiere %d s del servidor: revisar fecha/hora/zona de Windows",
                int(desfase),
            )
