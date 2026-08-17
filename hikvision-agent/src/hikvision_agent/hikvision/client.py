"""Cliente ISAPI para el Hikvision DS-K1A340WX.

Los endpoints concretos viven SOLO acá (spec §11): el resto del agente habla
con ``HikvisionClient`` y no conoce ISAPI. Autenticación: HTTP Digest.

Endpoints usados (baseline ISAPI Access Control; confirmar contra el
firmware real con ``hikvision-agent diag``):

- ``GET  /ISAPI/System/deviceInfo``                  → modelo/serial/firmware (XML)
- ``GET  /ISAPI/System/time``                        → hora del reloj (XML, diagnóstico)
- ``POST /ISAPI/AccessControl/AcsEvent?format=json`` → búsqueda paginada de eventos
"""
from __future__ import annotations

import logging
import time
import uuid
import xml.etree.ElementTree as ET
from collections.abc import Iterator
from datetime import datetime

import requests
from requests.auth import HTTPDigestAuth

from ..config import DeviceConfig
from .models import DeviceInfo

log = logging.getLogger(__name__)

_DEVICE_INFO_PATH = "/ISAPI/System/deviceInfo"
_TIME_PATH = "/ISAPI/System/time"
_ACS_EVENT_PATH = "/ISAPI/AccessControl/AcsEvent?format=json"

_PAGE_SIZE = 30          # varios firmwares limitan maxResults a 30
_MAX_PAGES = 2000        # tope de seguridad por búsqueda

# Pausa entre páginas. Una recuperación histórica son cientos de consultas
# seguidas y el DS-K1A340WX real empieza a devolver 401 cuando se lo atropella
# (no es la contraseña: es el equipo cortando). Un respiro corto lo evita y
# apenas agrega unos segundos sobre miles de fichadas.
_PAUSA_ENTRE_PAGINAS = 0.2


class DeviceError(Exception):
    """Error genérico hablando con el reloj."""


class DeviceUnreachable(DeviceError):
    """No hay conectividad con el reloj (apagado, Wi-Fi caído, IP errónea)."""


class DeviceAuthError(DeviceError):
    """Credenciales ISAPI inválidas."""


class IsapiUnsupported(DeviceError):
    """El firmware no aceptó el recurso: revisar con el diagnóstico."""


def _strip_ns(tag: str) -> str:
    return tag.split("}", 1)[-1]


def _xml_a_dict(texto: str) -> dict[str, str]:
    try:
        raiz = ET.fromstring(texto)
    except ET.ParseError as exc:
        raise DeviceError(f"Respuesta XML inválida del reloj: {exc}") from exc
    return {_strip_ns(hijo.tag): (hijo.text or "").strip() for hijo in raiz}


class HikvisionClient:
    def __init__(self, config: DeviceConfig, password: str):
        if not config.host:
            raise DeviceError("Falta configurar la IP del reloj (hikvision.host)")
        if not password:
            raise DeviceAuthError("Falta la contraseña del reloj (HIKVISION_PASSWORD / secrets set)")
        self._config = config
        self._session = requests.Session()
        self._session.auth = HTTPDigestAuth(config.username, password)
        if config.use_https and not config.verify_tls:
            self._session.verify = False
            import urllib3

            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    # ------------------------------------------------------------------ http
    def _request(self, method: str, path: str, **kwargs) -> requests.Response:
        url = f"{self._config.base_url}{path}"
        try:
            respuesta = self._session.request(
                method, url, timeout=self._config.request_timeout_seconds, **kwargs
            )
        except (requests.ConnectionError, requests.Timeout) as exc:
            raise DeviceUnreachable(f"Sin conexión con el reloj {self._config.host}: {exc.__class__.__name__}") from exc
        except requests.RequestException as exc:
            raise DeviceError(f"Error HTTP con el reloj: {exc}") from exc

        if respuesta.status_code == 401:
            raise DeviceAuthError(
                "El reloj rechazó las credenciales ISAPI (401). Si venía "
                "funcionando, suele ser el equipo cortando conexiones tras "
                "muchas consultas seguidas, no la contraseña: se reintenta solo."
            )
        if respuesta.status_code == 403:
            raise DeviceAuthError("El usuario ISAPI no tiene permisos suficientes (403)")
        return respuesta

    # ------------------------------------------------------------- operaciones
    def healthcheck(self) -> bool:
        self.get_device_info()
        return True

    def get_device_info(self) -> DeviceInfo:
        respuesta = self._request("GET", _DEVICE_INFO_PATH)
        if respuesta.status_code != 200:
            raise DeviceError(f"deviceInfo devolvió HTTP {respuesta.status_code}")
        datos = _xml_a_dict(respuesta.text)
        return DeviceInfo(
            model=datos.get("model", ""),
            serial=datos.get("serialNumber", ""),
            firmware=" ".join(
                p for p in (datos.get("firmwareVersion", ""), datos.get("firmwareReleasedDate", "")) if p
            ),
            name=datos.get("deviceName", ""),
        )

    def get_device_time(self) -> str:
        """Hora local del reloj (texto), para el chequeo de zona horaria."""
        respuesta = self._request("GET", _TIME_PATH)
        if respuesta.status_code != 200:
            raise DeviceError(f"time devolvió HTTP {respuesta.status_code}")
        return _xml_a_dict(respuesta.text).get("localTime", "")

    def search_events(self, start_at: datetime, end_at: datetime) -> Iterator[dict]:
        """Itera los eventos crudos (items de InfoList) del rango pedido."""
        search_id = str(uuid.uuid4())
        posicion = 0
        for _ in range(_MAX_PAGES):
            cuerpo = {
                "AcsEventCond": {
                    "searchID": search_id,
                    "searchResultPosition": posicion,
                    "maxResults": _PAGE_SIZE,
                    "major": 0,
                    "minor": 0,
                    "startTime": start_at.isoformat(timespec="seconds"),
                    "endTime": end_at.isoformat(timespec="seconds"),
                }
            }
            respuesta = self._request("POST", _ACS_EVENT_PATH, json=cuerpo)
            if respuesta.status_code in (400, 404):
                raise IsapiUnsupported(
                    "El firmware no aceptó AcsEvent en JSON "
                    f"(HTTP {respuesta.status_code}). Ejecutá `hikvision-agent diag` "
                    "y revisá el ISAPI Developer Guide para este firmware."
                )
            if respuesta.status_code != 200:
                raise DeviceError(f"AcsEvent devolvió HTTP {respuesta.status_code}: {respuesta.text[:200]}")

            try:
                datos = respuesta.json()
            except ValueError as exc:
                raise IsapiUnsupported("AcsEvent no devolvió JSON; capturar payload real con diag") from exc

            bloque = datos.get("AcsEvent") or {}
            items = bloque.get("InfoList") or []
            for item in items:
                yield item

            estado = str(bloque.get("responseStatusStrg") or "").upper()
            cantidad = int(bloque.get("numOfMatches") or len(items))
            posicion += cantidad
            if estado != "MORE" or cantidad == 0:
                return
            time.sleep(_PAUSA_ENTRE_PAGINAS)
        log.warning("Búsqueda ISAPI cortada por tope de páginas (%s)", _MAX_PAGES)
