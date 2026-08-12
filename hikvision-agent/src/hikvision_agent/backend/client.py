"""Cliente HTTPS hacia la API de agentes del backend CelTuc.

Autenticación: ``Authorization: Bearer asist_...`` (token propio por agente,
generado desde el módulo Asistencia). Nunca se manda la contraseña del reloj.
"""
from __future__ import annotations

import logging

import requests

from .. import AGENT_VERSION
from ..config import BackendConfig
from .models import BulkResult

log = logging.getLogger(__name__)

EVENTS_PATH = "/api/asistencia/agente/eventos/bulk/"
HEARTBEAT_PATH = "/api/asistencia/agente/heartbeat/"
CONFIG_PATH = "/api/asistencia/agente/config/"


class BackendError(Exception):
    """Error genérico del backend."""


class BackendAuthError(BackendError):
    """Token inválido o agente desactivado (401/403): alerta crítica."""


class BackendTransientError(BackendError):
    """Caída temporal (timeout, DNS, 429, 5xx): reintentar con backoff."""


class BackendPayloadError(BackendError):
    """El backend rechazó el payload completo (400)."""


class BackendClient:
    def __init__(self, config: BackendConfig, token: str):
        if not config.base_url:
            raise BackendError("Falta configurar backend.base_url en config.toml")
        if not token:
            raise BackendAuthError("Falta el token del agente (BACKEND_AGENT_TOKEN / secrets set)")
        self._config = config
        self._session = requests.Session()
        self._session.headers.update(
            {
                "Authorization": f"Bearer {token}",
                "User-Agent": f"hikvision-agent/{AGENT_VERSION}",
            }
        )

    def _post(self, path: str, cuerpo: dict) -> dict:
        url = f"{self._config.base_url}{path}"
        try:
            respuesta = self._session.post(
                url, json=cuerpo, timeout=self._config.request_timeout_seconds
            )
        except (requests.ConnectionError, requests.Timeout) as exc:
            raise BackendTransientError(f"Backend inaccesible: {exc.__class__.__name__}") from exc
        except requests.RequestException as exc:
            raise BackendError(f"Error HTTP contra el backend: {exc}") from exc
        return self._interpretar(respuesta)

    def _get(self, path: str) -> dict:
        url = f"{self._config.base_url}{path}"
        try:
            respuesta = self._session.get(url, timeout=self._config.request_timeout_seconds)
        except (requests.ConnectionError, requests.Timeout) as exc:
            raise BackendTransientError(f"Backend inaccesible: {exc.__class__.__name__}") from exc
        except requests.RequestException as exc:
            raise BackendError(f"Error HTTP contra el backend: {exc}") from exc
        return self._interpretar(respuesta)

    @staticmethod
    def _interpretar(respuesta: requests.Response) -> dict:
        if respuesta.status_code in (401, 403):
            raise BackendAuthError(
                f"El backend rechazó el token del agente (HTTP {respuesta.status_code}). "
                "Verificar el token en CelTuc → Asistencia → Agentes."
            )
        if respuesta.status_code == 429 or respuesta.status_code >= 500:
            raise BackendTransientError(f"Backend devolvió HTTP {respuesta.status_code}")
        if respuesta.status_code == 400:
            raise BackendPayloadError(f"Payload rechazado (400): {respuesta.text[:300]}")
        if respuesta.status_code not in (200, 201):
            raise BackendError(f"HTTP inesperado {respuesta.status_code}: {respuesta.text[:200]}")
        try:
            return respuesta.json()
        except ValueError as exc:
            raise BackendError("El backend no devolvió JSON") from exc

    # ------------------------------------------------------------- operaciones
    def send_events(self, eventos: list[dict]) -> BulkResult:
        datos = self._post(EVENTS_PATH, {"agent_version": AGENT_VERSION, "events": eventos})
        return BulkResult.from_json(datos)

    def heartbeat(self, payload: dict) -> dict:
        return self._post(HEARTBEAT_PATH, payload)

    def get_config(self) -> dict:
        return self._get(CONFIG_PATH)
