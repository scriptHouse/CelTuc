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

# El DS-K1A340WX corta la búsqueda con un 401 y hay que renovar la sesión para
# seguir. NO es la contraseña: con una conexión y un `searchID` nuevos, la
# MISMA posición responde 200 y la paginación continúa.
#
# Medido contra el equipo real (5.469 eventos, 90 días):
#
#     sin pausa entre páginas ->  3 renovaciones, 10 s
#     con 0,2 s de pausa      -> 14 renovaciones, 49 s
#
# O sea que el límite es el TIEMPO DE VIDA de la sesión de búsqueda, no la
# cantidad de consultas: ir más lento solo quema ese presupuesto y multiplica
# los cortes. Por eso se pagina lo más rápido posible y se renueva al cortar.
_PAUSA_TRAS_RENOVAR = 0.2

# Tope de seguridad para que un 401 permanente no sea un bucle infinito. Con
# ~1.800 eventos por sesión da margen de sobra; una contraseña realmente mal
# puesta falla antes, en `get_device_info()`.
_MAX_RENOVACIONES_SESION = 200


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
        self._password = password
        self._session = self._nueva_sesion()

    def _nueva_sesion(self) -> requests.Session:
        sesion = requests.Session()
        sesion.auth = HTTPDigestAuth(self._config.username, self._password)
        if self._config.use_https and not self._config.verify_tls:
            sesion.verify = False
            import urllib3

            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        return sesion

    def _renovar_sesion(self) -> None:
        """Conexión y autenticación nuevas, descartando la anterior."""
        try:
            self._session.close()
        except Exception:
            pass
        self._session = self._nueva_sesion()

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

    def _pedir_pagina(self, search_id, posicion, start_at, end_at):
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
        return self._request("POST", _ACS_EVENT_PATH, json=cuerpo)

    def search_events(self, start_at: datetime, end_at: datetime) -> Iterator[dict]:
        """Itera los eventos crudos (items de InfoList) del rango pedido.

        Si el reloj corta la búsqueda a mitad (401 tras miles de eventos), se
        renueva la sesión y se continúa DESDE LA MISMA POSICIÓN, sin releer lo
        ya entregado ni perder el resto.
        """
        search_id = str(uuid.uuid4())
        posicion = 0
        renovaciones = 0
        for _ in range(_MAX_PAGES):
            try:
                respuesta = self._pedir_pagina(search_id, posicion, start_at, end_at)
            except DeviceAuthError:
                if renovaciones >= _MAX_RENOVACIONES_SESION:
                    raise
                renovaciones += 1
                log.info(
                    "El reloj cortó la búsqueda tras %s eventos; renovando sesión "
                    "y continuando desde ahí (renovación %s).", posicion, renovaciones
                )
                self._renovar_sesion()
                search_id = str(uuid.uuid4())
                time.sleep(_PAUSA_TRAS_RENOVAR)
                respuesta = self._pedir_pagina(search_id, posicion, start_at, end_at)

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
        log.warning("Búsqueda ISAPI cortada por tope de páginas (%s)", _MAX_PAGES)
