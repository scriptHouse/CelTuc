"""Tests del parser ISAPI contra un payload REAL.

El fixture `hikvision_event_sample.json` es una captura real de un
DS-K1A340WX (firmware V1.2.7 build 240228) tomada con
``hikvision-agent diag --save-fixture --anonymize``. Los `name` vienen
anonimizados; el resto es exactamente lo que devuelve el equipo.

Particularidades REALES de este firmware que estos tests fijan:

- ``attendanceStatus`` siempre llega ``"undefined"``: el reloj no clasifica
  entrada/salida. Lo deriva el backend (``asistencia.jornada``).
- ``currentVerifyMode`` llega ``"faceOrFpOrCardOrPw"``: son los métodos
  HABILITADOS en el lector, no el que la persona usó.
- ``employeeNoString`` trae NOMBRES de pila, no números (en el fixture van
  seudonimizados como ``EMP1``, ``EMP2``… por privacidad).
- ``minor: 76`` son intentos de reconocimiento fallidos, sin empleado: no son
  fichadas y deben descartarse.
"""
import json
from pathlib import Path

import pytest

from hikvision_agent.hikvision import parser

FIXTURE = Path(__file__).parent / "fixtures" / "hikvision_event_sample.json"
TZ = "America/Argentina/Buenos_Aires"
SERIAL = "DS-K1A340WX20240228V010207ENFW4057622"


@pytest.fixture(scope="module")
def items():
    datos = json.loads(FIXTURE.read_text(encoding="utf-8"))
    return datos["AcsEvent"]["InfoList"]


@pytest.fixture(scope="module")
def fichadas(items):
    return [e for i in items if (e := parser.parse_event_item(i, SERIAL, TZ))]


def test_el_fixture_es_la_captura_real(items):
    assert len(items) == 50
    assert {i["attendanceStatus"] for i in items} == {"undefined"}
    assert {i["currentVerifyMode"] for i in items} == {"faceOrFpOrCardOrPw"}
    # La anonimización tiene que haber borrado la URL de la foto del rostro.
    assert not any("pictureURL" in i for i in items)


def test_descarta_los_intentos_fallidos_sin_empleado(items, fichadas):
    """`minor: 76` = rostro no reconocido. No es una fichada."""
    fallidos = [i for i in items if i["minor"] == 76]
    assert len(fallidos) == 2
    assert all(not i["employeeNoString"] for i in fallidos)
    assert len(fichadas) == 48  # 50 - 2 fallidos


def test_el_identificador_del_reloj_puede_ser_un_nombre(fichadas):
    """Los empleados están enrolados con su nombre, no con un número."""
    identificadores = {f.employee_number for f in fichadas}
    # Seudonimos del fixture: en el reloj real son nombres de pila, no numeros.
    assert identificadores == {"EMP1", "EMP2", "EMP3"}


def test_estado_indefinido_del_reloj_cae_en_unknown(fichadas):
    """El reloj no clasifica: el backend deriva entrada/salida por orden."""
    assert {f.event_type for f in fichadas} == {"unknown"}


def test_modo_de_verificacion_multiple(fichadas):
    """`faceOrFpOrCardOrPw` se reconoce en vez de caer en 'Otro'."""
    assert {f.verification_method for f in fichadas} == {"multiple"}


def test_las_fechas_conservan_la_zona_horaria_del_reloj(fichadas):
    for f in fichadas:
        assert f.occurred_at.tzinfo is not None
        assert f.occurred_at.utcoffset().total_seconds() == -3 * 3600


def test_serialno_sirve_como_id_idempotente(items, fichadas):
    """El reloj entrega un id propio, único y secuencial: idempotencia gratis."""
    seriales = [i["serialNo"] for i in items]
    assert len(set(seriales)) == len(seriales)
    assert max(seriales) - min(seriales) == len(seriales) - 1  # consecutivos

    assert all(f.source_event_id for f in fichadas)
    assert len({f.uid for f in fichadas}) == len(fichadas)  # ningún uid repetido


def test_uid_determinista(items):
    """Parsear dos veces el mismo evento da el mismo uid (idempotencia)."""
    item = next(i for i in items if i["employeeNoString"])
    a = parser.parse_event_item(item, SERIAL, TZ)
    b = parser.parse_event_item(dict(item), SERIAL, TZ)
    assert a.uid == b.uid


def test_sin_serialno_el_uid_sigue_siendo_estable(items):
    """Fallback: si el firmware no diera id propio, el hash lo reemplaza."""
    item = dict(next(i for i in items if i["employeeNoString"]))
    item.pop("serialNo")
    c = parser.parse_event_item(item, SERIAL, TZ)
    d = parser.parse_event_item(dict(item), SERIAL, TZ)
    assert c.uid == d.uid and c.source_event_id == ""


def test_conserva_el_payload_original(fichadas):
    """`raw` viaja completo al backend para diagnóstico y reprocesos."""
    assert all(f.raw.get("major") == 5 for f in fichadas)


def test_estados_reales_se_respetan_si_el_reloj_los_manda(items):
    """Si algún día se configura Hora y Asistencia, el valor real se usa."""
    item = dict(next(i for i in items if i["employeeNoString"]))
    item["attendanceStatus"] = "checkIn"
    item["currentVerifyMode"] = "face"
    evento = parser.parse_event_item(item, SERIAL, TZ)
    assert evento.event_type == "check_in"
    assert evento.verification_method == "face"


def test_valores_desconocidos_no_rompen(items):
    item = dict(next(i for i in items if i["employeeNoString"]))
    item["attendanceStatus"] = "algoNuevo"
    item["currentVerifyMode"] = "otraCosa"
    evento = parser.parse_event_item(item, SERIAL, TZ)
    assert evento is not None
    assert evento.event_type == "unknown"
    assert evento.verification_method == "unknown"


def test_hora_sin_zona_asume_la_configurada(items):
    item = dict(next(i for i in items if i["employeeNoString"]))
    item["time"] = "2026-08-10T08:01:22"
    evento = parser.parse_event_item(item, SERIAL, TZ)
    assert evento.occurred_at.isoformat().endswith("-03:00")
