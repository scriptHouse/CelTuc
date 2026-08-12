"""Tests del parser ISAPI contra el fixture.

El fixture inicial modela la forma documentada del AcsEvent; el flujo de la
spec exige reemplazarlo con una captura real (`diag --save-fixture`) y volver
a correr estos tests antes de dar por cerrado el parser.
"""
import json
from pathlib import Path

from hikvision_agent.hikvision import parser

FIXTURE = Path(__file__).parent / "fixtures" / "hikvision_event_sample.json"


def _items():
    datos = json.loads(FIXTURE.read_text(encoding="utf-8"))
    return datos["AcsEvent"]["InfoList"]


def test_parsea_fichadas_y_descarta_eventos_de_sistema():
    eventos = [parser.parse_event_item(i, "SERIE-1", "America/Argentina/Buenos_Aires") for i in _items()]
    fichadas = [e for e in eventos if e is not None]
    assert len(fichadas) == 3  # el evento de puerta sin empleado se ignora


def test_normaliza_tipo_y_metodo():
    fichadas = [
        e for i in _items()
        if (e := parser.parse_event_item(i, "SERIE-1", "America/Argentina/Buenos_Aires"))
    ]
    primera = fichadas[0]
    assert primera.employee_number == "145"
    assert primera.event_type == "check_in"
    assert primera.verification_method == "face"
    assert primera.occurred_at.utcoffset() is not None
    assert fichadas[1].event_type == "check_out"
    assert fichadas[2].event_type == "break_out"
    assert fichadas[2].verification_method == "card"


def test_estado_desconocido_no_rompe():
    item = dict(_items()[0])
    item["attendanceStatus"] = "algoRaro"
    item["currentVerifyMode"] = "otraCosa"
    evento = parser.parse_event_item(item, "SERIE-1", "America/Argentina/Buenos_Aires")
    assert evento is not None
    assert evento.event_type == "unknown"
    assert evento.verification_method == "unknown"


def test_uid_estable_y_prioriza_serial_del_reloj():
    item = _items()[0]
    a = parser.parse_event_item(item, "SERIE-1", "America/Argentina/Buenos_Aires")
    b = parser.parse_event_item(dict(item), "SERIE-1", "America/Argentina/Buenos_Aires")
    assert a.uid == b.uid  # determinista
    assert a.source_event_id == "118"

    sin_serial = dict(item)
    sin_serial.pop("serialNo")
    c = parser.parse_event_item(sin_serial, "SERIE-1", "America/Argentina/Buenos_Aires")
    d = parser.parse_event_item(dict(sin_serial), "SERIE-1", "America/Argentina/Buenos_Aires")
    assert c.uid == d.uid
    assert c.uid != a.uid  # cambia la base del hash, sigue siendo estable


def test_hora_sin_zona_asume_la_configurada():
    item = dict(_items()[0])
    item["time"] = "2026-08-10T08:01:22"
    evento = parser.parse_event_item(item, "SERIE-1", "America/Argentina/Buenos_Aires")
    assert evento.occurred_at.tzinfo is not None
    assert evento.occurred_at.isoformat().endswith("-03:00")
