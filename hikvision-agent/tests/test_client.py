"""Tests del cliente ISAPI: paginación y recuperación de cortes del reloj.

El DS-K1A340WX real corta la sesión de búsqueda con un 401 en medio de una
recuperación larga. No es la contraseña: con una conexión y un `searchID`
nuevos, la MISMA posición responde 200 y se puede seguir.

Medido contra el equipo (5.469 eventos, 90 días): el corte depende del TIEMPO
de vida de la sesión, no de la cantidad de consultas — paginando sin pausa
hubo 3 cortes en 10 s, y agregando 0,2 s entre páginas subió a 14 cortes y
49 s. Estos tests fijan la recuperación con un reloj simulado que corta igual.
"""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from hikvision_agent.config import DeviceConfig
from hikvision_agent.hikvision import client as mod
from hikvision_agent.hikvision.client import DeviceAuthError, HikvisionClient

TZ = ZoneInfo("America/Argentina/Buenos_Aires")
FIN = datetime(2026, 8, 17, 18, 0, tzinfo=TZ)
INICIO = FIN - timedelta(days=90)


def _config():
    return DeviceConfig(
        host="192.168.1.31", port=80, use_https=False, username="admin",
        poll_seconds=20, overlap_seconds=180, request_timeout_seconds=10,
        initial_backfill_days=90, timezone="America/Argentina/Buenos_Aires",
        verify_tls=False,
    )


class RespuestaFalsa:
    def __init__(self, status_code, payload=None):
        self.status_code = status_code
        self._payload = payload or {}
        self.text = ""

    def json(self):
        return self._payload


class RelojSimulado:
    """Sirve `total` eventos de a 30 y corta con 401 cada `corta_cada` páginas."""

    total = 200
    corta_cada = 3
    sesiones_creadas = 0

    def __init__(self):
        RelojSimulado.sesiones_creadas += 1
        self.auth = None
        self.verify = True
        self.servidas = 0

    def request(self, method, url, timeout=None, **kwargs):
        cond = kwargs["json"]["AcsEventCond"]
        posicion = cond["searchResultPosition"]

        self.servidas += 1
        if self.servidas > RelojSimulado.corta_cada:
            return RespuestaFalsa(401)  # el reloj corta la sesión de búsqueda

        if posicion >= RelojSimulado.total:
            return RespuestaFalsa(200, {"AcsEvent": {
                "numOfMatches": 0, "InfoList": [], "responseStatusStrg": "OK"}})

        cuantos = min(30, RelojSimulado.total - posicion)
        items = [{"serialNo": posicion + i, "employeeNoString": "EMP1",
                  "time": "2026-06-10T09:00:00-03:00"} for i in range(cuantos)]
        return RespuestaFalsa(200, {"AcsEvent": {
            "numOfMatches": cuantos,
            "InfoList": items,
            "responseStatusStrg": "MORE" if posicion + cuantos < RelojSimulado.total else "OK",
        }})

    def close(self):
        pass


@pytest.fixture()
def reloj(monkeypatch):
    RelojSimulado.sesiones_creadas = 0
    RelojSimulado.total = 200
    RelojSimulado.corta_cada = 3
    monkeypatch.setattr(mod.requests, "Session", RelojSimulado)
    monkeypatch.setattr(mod, "_PAUSA_TRAS_RENOVAR", 0)
    return RelojSimulado


def test_pagina_hasta_el_final_sin_cortes(reloj, monkeypatch):
    reloj.corta_cada = 999  # un reloj que aguanta todo
    cliente = HikvisionClient(_config(), "clave")
    eventos = list(cliente.search_events(INICIO, FIN))
    assert len(eventos) == 200
    assert reloj.sesiones_creadas == 1  # no hizo falta renovar


def test_renueva_la_sesion_y_sigue_donde_quedo(reloj):
    """El caso real: el reloj corta y la búsqueda continúa igual."""
    cliente = HikvisionClient(_config(), "clave")
    eventos = list(cliente.search_events(INICIO, FIN))

    assert len(eventos) == 200, "se perdieron eventos al renovar"
    seriales = [e["serialNo"] for e in eventos]
    assert seriales == sorted(seriales), "los eventos salieron desordenados"
    assert len(set(seriales)) == 200, "se repitieron eventos al reanudar"
    assert reloj.sesiones_creadas > 1, "nunca renovó la sesión"


def test_no_relee_lo_ya_entregado(reloj):
    """Al reanudar se pide la MISMA posición, no se vuelve a empezar."""
    reloj.corta_cada = 2
    cliente = HikvisionClient(_config(), "clave")
    seriales = [e["serialNo"] for e in cliente.search_events(INICIO, FIN)]
    assert seriales == list(range(200))


def test_si_el_reloj_no_se_recupera_se_rinde(reloj, monkeypatch):
    """Un 401 permanente no puede volverse un bucle infinito."""
    monkeypatch.setattr(mod, "_MAX_RENOVACIONES_SESION", 3)
    reloj.corta_cada = 0  # corta siempre, incluso recién renovada
    cliente = HikvisionClient(_config(), "clave")
    with pytest.raises(DeviceAuthError):
        list(cliente.search_events(INICIO, FIN))
    # Intentó renovar unas pocas veces y paró.
    assert reloj.sesiones_creadas <= 5


def test_una_clave_de_verdad_equivocada_no_se_reintenta_para_siempre(reloj, monkeypatch):
    """Distinguir el corte del reloj de una credencial mal puesta: en ambos
    casos hay 401, pero el tope de renovaciones garantiza que termine."""
    monkeypatch.setattr(mod, "_MAX_RENOVACIONES_SESION", 2)
    reloj.corta_cada = 0
    cliente = HikvisionClient(_config(), "clave-mala")
    with pytest.raises(DeviceAuthError):
        list(cliente.search_events(INICIO, FIN))


def test_detecta_el_bloqueo_del_reloj_y_cuanto_falta(reloj, monkeypatch):
    """Un 401 por bloqueo no es una contraseña equivocada.

    Ante intentos fallidos, el equipo bloquea el acceso y responde un
    `userCheck` con `lockStatus` y `unlockTime`. Confundirlo con credenciales
    malas manda a revisar una contraseña que está bien; y peor: insistir
    durante el bloqueo reinicia su contador y lo deja inaccesible.
    """
    from hikvision_agent.hikvision.client import DeviceLocked

    CUERPO = """<?xml version="1.0" encoding="UTF-8"?>
<userCheck version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">
  <statusValue>401</statusValue>
  <isActivated>true</isActivated>
  <lockStatus>lock</lockStatus>
  <unlockTime>1509</unlockTime>
</userCheck>"""

    class Bloqueado(RelojSimulado):
        def request(self, method, url, timeout=None, **kwargs):
            r = RespuestaFalsa(401)
            r.text = CUERPO
            return r

    monkeypatch.setattr(mod.requests, "Session", Bloqueado)
    cliente = HikvisionClient(_config(), "clave")

    with pytest.raises(DeviceLocked) as caso:
        cliente.get_device_info()

    assert caso.value.segundos == 1509
    assert "bloque" in str(caso.value).lower()
    assert "25 min" in str(caso.value)


def test_un_401_sin_bloqueo_sigue_siendo_credenciales(reloj, monkeypatch):
    """Contraprueba: sin `lockStatus`, el 401 se reporta como antes."""
    from hikvision_agent.hikvision.client import DeviceAuthError, DeviceLocked

    class Rechaza(RelojSimulado):
        def request(self, method, url, timeout=None, **kwargs):
            r = RespuestaFalsa(401)
            r.text = "<userCheck><statusValue>401</statusValue></userCheck>"
            return r

    monkeypatch.setattr(mod.requests, "Session", Rechaza)
    cliente = HikvisionClient(_config(), "clave")

    with pytest.raises(DeviceAuthError) as caso:
        cliente.get_device_info()
    assert not isinstance(caso.value, DeviceLocked)
