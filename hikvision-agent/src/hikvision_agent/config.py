"""Configuración del agente.

Precedencia (de menor a mayor):

1. Valores por defecto (este módulo).
2. ``config.toml`` local — el "bootstrap" que se descarga desde CelTuc:
   URL del backend, token e IP del reloj.
3. Config remota — la que administra el superadmin desde el módulo
   Asistencia de CelTuc. Llega en cada heartbeat, se cachea en SQLite y
   PISA a la local (la interfaz web es la fuente de verdad).

Los secretos nunca viajan en la config remota:

- ``HIKVISION_PASSWORD`` / ``BACKEND_AGENT_TOKEN`` como variables de entorno, o
- ``secrets.dat`` cifrado con DPAPI (``hikvision-agent secrets set``), o
- el token puede venir en ``config.toml`` (es lo que descarga la UI).

La contraseña del reloj JAMÁS se envía al backend.
"""
from __future__ import annotations

import copy
import os
import threading
import tomllib
from dataclasses import dataclass
from pathlib import Path
from typing import Any

DEFAULTS: dict[str, Any] = {
    "agent": {
        "id": "",
    },
    "hikvision": {
        "host": "",
        "port": 80,
        "use_https": False,
        "username": "admin",
        "poll_seconds": 20,
        "overlap_seconds": 180,
        "request_timeout_seconds": 10,
        "initial_backfill_days": 7,
        "timezone": "America/Argentina/Buenos_Aires",
        "verify_tls": False,
    },
    "backend": {
        "base_url": "",
        "sync_seconds": 10,
        "batch_size": 200,
        "heartbeat_seconds": 60,
        "request_timeout_seconds": 20,
    },
    "logging": {
        "level": "INFO",
    },
}

# La config remota usa las claves del backend CelTuc; acá se traducen a las
# secciones locales. Sólo se aceptan claves de esta lista (nunca secretos).
_REMOTE_MAP = {
    "device": (
        "hikvision",
        {
            "host",
            "port",
            "use_https",
            "username",
            "poll_seconds",
            "overlap_seconds",
            "request_timeout_seconds",
            "initial_backfill_days",
            "timezone",
            "verify_tls",
        },
    ),
    "backend": (
        "backend",
        {"sync_seconds", "batch_size", "heartbeat_seconds", "request_timeout_seconds"},
    ),
    "logging": ("logging", {"level"}),
}


def _deep_merge(base: dict, extra: dict) -> dict:
    resultado = copy.deepcopy(base)
    for clave, valor in (extra or {}).items():
        if isinstance(valor, dict) and isinstance(resultado.get(clave), dict):
            resultado[clave] = _deep_merge(resultado[clave], valor)
        elif valor is not None:
            resultado[clave] = valor
    return resultado


def remote_to_local(remota: dict) -> dict:
    """Convierte la config remota del backend al esquema de secciones local."""
    salida: dict[str, Any] = {}
    for clave_remota, (seccion, permitidas) in _REMOTE_MAP.items():
        bloque = remota.get(clave_remota)
        if not isinstance(bloque, dict):
            continue
        filtrado = {k: v for k, v in bloque.items() if k in permitidas and v is not None}
        if filtrado:
            salida[seccion] = filtrado
    if remota.get("agent_id"):
        salida["agent"] = {"id": remota["agent_id"]}
    return salida


def existe(path: Path) -> bool:
    """`Path.exists()` que no explota si falta permiso sobre la carpeta.

    Tras instalar, C:\ProgramData\CelTuc\HikvisionAgent queda accesible solo
    para SYSTEM y administradores. Un usuario comun consultando el estado
    recibia un PermissionError crudo desde `pathlib`.
    """
    try:
        return path.exists()
    except OSError:
        return False


def load_toml(path: Path) -> dict:
    """Config local, o vacio si no existe o no se puede leer.

    Nunca lanza: `diag` es la herramienta que alguien usa cuando algo no
    anda, y no puede morirse porque le falte elevacion para leer la config
    instalada. Quien la corra puede pasar --host/--password a mano.
    """
    try:
        if not path.exists():
            return {}
        with path.open("rb") as archivo:
            return tomllib.load(archivo)
    except OSError:
        return {}


@dataclass(frozen=True)
class DeviceConfig:
    host: str
    port: int
    use_https: bool
    username: str
    poll_seconds: int
    overlap_seconds: int
    request_timeout_seconds: int
    initial_backfill_days: int
    timezone: str
    verify_tls: bool

    @property
    def base_url(self) -> str:
        esquema = "https" if self.use_https else "http"
        puerto_defecto = 443 if self.use_https else 80
        puerto = "" if self.port == puerto_defecto else f":{self.port}"
        return f"{esquema}://{self.host}{puerto}"


@dataclass(frozen=True)
class BackendConfig:
    base_url: str
    sync_seconds: int
    batch_size: int
    heartbeat_seconds: int
    request_timeout_seconds: int


@dataclass(frozen=True)
class AgentConfig:
    agent_id: str
    device: DeviceConfig
    backend: BackendConfig
    log_level: str
    remote_version: int


def _build(merged: dict, remote_version: int) -> AgentConfig:
    hik = merged["hikvision"]
    back = merged["backend"]
    return AgentConfig(
        agent_id=str(merged["agent"].get("id") or ""),
        device=DeviceConfig(
            host=str(hik.get("host") or ""),
            port=int(hik.get("port") or 80),
            use_https=bool(hik.get("use_https")),
            username=str(hik.get("username") or "admin"),
            poll_seconds=max(5, int(hik.get("poll_seconds") or 20)),
            overlap_seconds=max(0, int(hik.get("overlap_seconds") or 180)),
            request_timeout_seconds=max(3, int(hik.get("request_timeout_seconds") or 10)),
            initial_backfill_days=max(0, int(hik.get("initial_backfill_days") or 7)),
            timezone=str(hik.get("timezone") or "America/Argentina/Buenos_Aires"),
            verify_tls=bool(hik.get("verify_tls")),
        ),
        backend=BackendConfig(
            base_url=str(back.get("base_url") or "").rstrip("/"),
            sync_seconds=max(5, int(back.get("sync_seconds") or 10)),
            batch_size=min(500, max(1, int(back.get("batch_size") or 200))),
            heartbeat_seconds=max(15, int(back.get("heartbeat_seconds") or 60)),
            request_timeout_seconds=max(5, int(back.get("request_timeout_seconds") or 20)),
        ),
        log_level=str(merged["logging"].get("level") or "INFO").upper(),
        remote_version=remote_version,
    )


class ConfigHolder:
    """Config efectiva compartida entre los hilos, con recarga en caliente.

    Los loops leen ``current`` en cada vuelta, así los cambios hechos desde
    la interfaz de CelTuc se aplican solos sin reiniciar el servicio.
    """

    def __init__(self, local: dict, remote: dict | None = None):
        self._lock = threading.Lock()
        self._local = local or {}
        self._remote = remote or {}
        self._rebuild()

    def _rebuild(self) -> None:
        merged = _deep_merge(DEFAULTS, self._local)
        merged = _deep_merge(merged, remote_to_local(self._remote))
        self._current = _build(merged, int(self._remote.get("version") or 0))

    @property
    def current(self) -> AgentConfig:
        with self._lock:
            return self._current

    @property
    def reintento_pedido(self) -> int:
        """Marca de tiempo del ultimo «reintentar ahora» pedido desde CelTuc.

        Viaja suelta en la config remota (no dentro de `device`, que se filtra
        por claves conocidas). Cero significa que nunca se pidio ninguno.
        """
        with self._lock:
            try:
                return int(self._remote.get("reintento_pedido") or 0)
            except (TypeError, ValueError):
                return 0

    def apply_remote(self, remota: dict) -> bool:
        """Aplica una config remota nueva. Devuelve True si cambió algo."""
        if not isinstance(remota, dict) or not remota:
            return False
        with self._lock:
            if remota == self._remote:
                return False
            self._remote = remota
            self._rebuild()
            return True


class Secrets:
    """Secretos locales: password del reloj y token del backend."""

    def __init__(self, hikvision_password: str = "", backend_token: str = ""):
        self.hikvision_password = hikvision_password
        self.backend_token = backend_token

    @classmethod
    def load(cls, secrets_path: Path, local_config: dict) -> "Secrets":
        from . import dpapi

        guardados = dpapi.load_secrets(secrets_path)
        token_toml = str((local_config.get("backend") or {}).get("token") or "")
        return cls(
            hikvision_password=os.environ.get("HIKVISION_PASSWORD")
            or guardados.get("hikvision_password", ""),
            backend_token=os.environ.get("BACKEND_AGENT_TOKEN")
            or guardados.get("backend_token", "")
            or token_toml,
        )
