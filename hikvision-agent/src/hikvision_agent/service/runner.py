"""Orquestación: tres hilos con reintento y backoff, sin morir jamás.

- Loop reloj:     Hikvision → SQLite
- Loop backend:   SQLite → Django
- Loop heartbeat: estado + config remota

Si el reloj está apagado, Internet no volvió o Django está caído, el loop
correspondiente hace backoff (5→10→20→30→60 s) y sigue intentando
(spec §25/§26/§27). Un token inválido se loguea CRÍTICO y espera 5 minutos.
"""
from __future__ import annotations

import logging
import random
import signal
import threading

from .. import AGENT_VERSION
from ..backend.client import BackendAuthError, BackendPayloadError, BackendTransientError
from ..config import ConfigHolder, Secrets
from ..hikvision.client import DeviceAuthError, DeviceUnreachable, IsapiUnsupported
from ..paths import default_db_path, ensure_dirs
from ..sync.backend_sync import BackendSync
from ..sync.device_sync import DeviceSync
from ..sync.heartbeat import Heartbeat
from ..sync.status import StatusBoard

log = logging.getLogger(__name__)

_BACKOFF_STEPS = (5, 10, 20, 30, 60)
_AUTH_BACKOFF = 300


class Loop(threading.Thread):
    """Ejecuta ``task()`` cada ``interval()`` segundos, con backoff ante fallas."""

    def __init__(self, nombre: str, interval, task, stop_event: threading.Event):
        super().__init__(name=nombre, daemon=True)
        self._interval = interval
        self._task = task
        self._stop = stop_event
        self._fallas = 0

    def run(self) -> None:
        while not self._stop.is_set():
            espera = self._interval()
            try:
                self._task()
                self._fallas = 0
            except (DeviceUnreachable, BackendTransientError) as exc:
                espera = self._backoff()
                log.warning("[%s] %s — reintento en %ss", self.name, exc, espera)
            except (DeviceAuthError, BackendAuthError) as exc:
                espera = _AUTH_BACKOFF
                log.critical("[%s] %s — reintento en %ss", self.name, exc, espera)
            except (IsapiUnsupported, BackendPayloadError) as exc:
                espera = _AUTH_BACKOFF
                log.error("[%s] %s — reintento en %ss", self.name, exc, espera)
            except Exception:
                espera = self._backoff()
                log.exception("[%s] error inesperado — reintento en %ss", self.name, espera)
            # Jitter ±10% para no sincronizar los reintentos entre hilos.
            self._stop.wait(espera * random.uniform(0.9, 1.1))

    def _backoff(self) -> int:
        paso = min(self._fallas, len(_BACKOFF_STEPS) - 1)
        self._fallas += 1
        return _BACKOFF_STEPS[paso]


def precargar_config_remota(heartbeat) -> bool:
    """Un heartbeat ANTES de arrancar los loops. Devuelve si se pudo.

    Importa en el primer arranque: sin watermark, el loop del reloj hace el
    backfill inicial con `initial_backfill_days`. Si arranca antes de que
    llegue la config remota, usa el default LOCAL (7 días) en vez del que se
    configuró en CelTuc (por ejemplo 90) — y como el watermark queda seteado,
    el histórico que se quería importar se pierde para siempre.

    Si falla (sin Internet todavía), se sigue igual: el loop de heartbeat va a
    reintentar y el agente arranca con la última config cacheada.
    """
    try:
        heartbeat.run_once()
        return True
    except Exception as exc:
        log.warning(
            "No se pudo traer la config remota al arrancar (%s); "
            "se sigue con la última conocida.", exc
        )
        return False


def run_agent(holder: ConfigHolder, secrets: Secrets) -> None:
    ensure_dirs()
    stop_event = threading.Event()

    def detener(_signum, _frame):
        log.info("Señal de apagado recibida; cerrando ordenadamente…")
        stop_event.set()

    signal.signal(signal.SIGINT, detener)
    signal.signal(signal.SIGTERM, detener)

    status = StatusBoard()
    db = default_db_path()

    # Una conexión SQLite por hilo: se les pasa la RUTA, no un Repository ya
    # abierto. Cada uno abre la suya la primera vez que la usa, que ocurre ya
    # dentro de su propio hilo (sqlite3 no deja compartirlas entre hilos).
    device_sync = DeviceSync(holder, secrets, status, db)
    backend_sync = BackendSync(holder, secrets, db)
    heartbeat = Heartbeat(holder, secrets, status, db)

    loops = [
        Loop("reloj", lambda: holder.current.device.poll_seconds, device_sync.run_once, stop_event),
        Loop("backend", lambda: holder.current.backend.sync_seconds, backend_sync.run_once, stop_event),
        Loop("heartbeat", lambda: holder.current.backend.heartbeat_seconds, heartbeat.run_once, stop_event),
    ]

    config = holder.current
    log.info(
        "Agente iniciado (v%s) — reloj %s cada %ss, backend %s cada %ss",
        AGENT_VERSION,
        config.device.host or "(sin configurar)",
        config.device.poll_seconds,
        config.backend.base_url or "(sin configurar)",
        config.backend.sync_seconds,
    )

    # Traer la config remota ANTES de que el loop del reloj decida su ventana
    # de backfill inicial (ver `precargar_config_remota`).
    precargar_config_remota(heartbeat)

    for loop in loops:
        loop.start()

    while not stop_event.is_set():
        stop_event.wait(1)
    for loop in loops:
        loop.join(timeout=5)
    log.info("Agente detenido.")
