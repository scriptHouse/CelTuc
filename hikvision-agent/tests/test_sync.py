"""Flujo completo con dobles de prueba: reloj → SQLite → backend.

Cubre los escenarios obligatorios de la spec: recuperación histórica,
backend caído sin pérdida, rechazos controlados y config remota aplicada.
"""
import json
import sqlite3
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

from hikvision_agent.backend.models import BulkItemResult, BulkResult
from hikvision_agent.config import ConfigHolder, Secrets
from hikvision_agent.storage.repository import Repository
from hikvision_agent.sync.backend_sync import BackendSync
from hikvision_agent.sync.device_sync import DeviceSync
from hikvision_agent.sync.heartbeat import Heartbeat
from hikvision_agent.sync.status import StatusBoard

FIXTURE = Path(__file__).parent / "fixtures" / "hikvision_event_sample.json"
TZ = ZoneInfo("America/Argentina/Buenos_Aires")


def _holder():
    return ConfigHolder(
        {
            "hikvision": {"host": "192.168.1.50", "initial_backfill_days": 7},
            "backend": {"base_url": "https://celtuc.test", "batch_size": 100},
        }
    )


def _secrets():
    return Secrets(hikvision_password="clave", backend_token="asist_token")


class RelojFalso:
    """Simula el HikvisionClient devolviendo los items del fixture."""

    def __init__(self):
        datos = json.loads(FIXTURE.read_text(encoding="utf-8"))
        self.items = datos["AcsEvent"]["InfoList"]
        self.busquedas = []

    def get_device_info(self):
        from hikvision_agent.hikvision.models import DeviceInfo

        return DeviceInfo(model="DS-K1A340WX", serial="SERIE-1", firmware="V1.2.7")

    def search_events(self, start_at, end_at):
        self.busquedas.append((start_at, end_at))
        for item in self.items:
            momento = datetime.fromisoformat(item["time"])
            if start_at <= momento <= end_at:
                yield item


class BackendFalso:
    def __init__(self, respuesta=None, error=None):
        self.respuesta = respuesta
        self.error = error
        self.lotes = []

    def send_events(self, eventos):
        if self.error:
            raise self.error
        self.lotes.append(eventos)
        return self.respuesta(eventos) if callable(self.respuesta) else self.respuesta


@pytest.fixture()
def db(tmp_path):
    return tmp_path / "agent.db"


def test_reloj_a_sqlite_recupera_historico_e_idempotente(db, monkeypatch):
    reloj = RelojFalso()
    monkeypatch.setattr(
        "hikvision_agent.sync.device_sync.HikvisionClient", lambda *_args, **_kw: reloj
    )
    # Congelar "ahora" justo despues del dia del fixture real (2026-07-18),
    # para que la ventana de backfill (7 dias) lo cubra entero.
    ahora = datetime(2026, 7, 19, 12, 0, tzinfo=TZ)

    class _FakeDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return ahora.astimezone(tz) if tz else ahora

    monkeypatch.setattr("hikvision_agent.sync.device_sync.datetime", _FakeDatetime)

    sincronizador = DeviceSync(_holder(), _secrets(), StatusBoard(), db)
    assert sincronizador.run_once() == 48  # los 2 `minor 76` (rostro no reconocido) se descartan

    # Segunda pasada: solapamiento + mismos eventos → cero nuevos, cero duplicados en el buffer.
    assert sincronizador.run_once() == 0

    repo = Repository(db)
    assert repo.counts()["PENDING"] == 48
    assert repo.get_watermark() is not None
    repo.close()


def test_sqlite_a_backend_marca_synced_y_maneja_rechazos(db, monkeypatch):
    repo = Repository(db)
    from hikvision_agent.hikvision.models import ClockEvent

    for uid in ("uid-1", "uid-2", "uid-3"):
        repo.insert_event_if_new(
            ClockEvent(
                uid=uid,
                source_event_id="",
                employee_number="145",
                employee_name="",
                occurred_at=datetime(2026, 8, 10, 11, 0, tzinfo=timezone.utc),
                event_type="check_in",
                verification_method="face",
                raw={},
            )
        )

    def respuesta(eventos):
        return BulkResult(
            accepted=1,
            duplicates=1,
            rejected=1,
            results=[
                BulkItemResult(uid="uid-1", status="accepted"),
                BulkItemResult(uid="uid-2", status="duplicate"),
                BulkItemResult(uid="uid-3", status="rejected", error="fecha inválida"),
            ],
        )

    backend = BackendFalso(respuesta=respuesta)
    monkeypatch.setattr(
        "hikvision_agent.sync.backend_sync.BackendClient", lambda *_a, **_k: backend
    )

    sincronizador = BackendSync(_holder(), _secrets(), db)
    assert sincronizador.run_once() == 2  # accepted + duplicate confirmados

    conteo = Repository(db).counts()
    assert conteo["SYNCED"] == 2
    assert conteo["PENDING"] == 1  # el rechazado reintenta (aún no llegó a ERROR)


def test_backend_caido_no_pierde_nada(db, monkeypatch):
    from hikvision_agent.backend.client import BackendTransientError
    from hikvision_agent.hikvision.models import ClockEvent

    repo = Repository(db)
    repo.insert_event_if_new(
        ClockEvent(
            uid="uid-1",
            source_event_id="",
            employee_number="145",
            employee_name="",
            occurred_at=datetime(2026, 8, 10, 11, 0, tzinfo=timezone.utc),
            event_type="check_in",
            verification_method="face",
            raw={},
        )
    )

    backend = BackendFalso(error=BackendTransientError("HTTP 503"))
    monkeypatch.setattr(
        "hikvision_agent.sync.backend_sync.BackendClient", lambda *_a, **_k: backend
    )
    sincronizador = BackendSync(_holder(), _secrets(), db)

    with pytest.raises(BackendTransientError):
        sincronizador.run_once()
    assert Repository(db).counts()["PENDING"] == 1  # sigue PENDING, nada se marcó


def test_config_remota_pisa_la_local():
    holder = _holder()
    assert holder.current.device.poll_seconds == 20
    cambio = holder.apply_remote(
        {
            "version": 5,
            "device": {"poll_seconds": 45, "host": "192.168.1.99"},
            "backend": {"sync_seconds": 30},
            "logging": {"level": "DEBUG"},
        }
    )
    assert cambio is True
    assert holder.current.device.poll_seconds == 45
    assert holder.current.device.host == "192.168.1.99"
    assert holder.current.backend.sync_seconds == 30
    assert holder.current.log_level == "DEBUG"
    assert holder.current.remote_version == 5
    # Aplicar lo mismo otra vez no reporta cambios.
    assert holder.apply_remote({"version": 5, "device": {"poll_seconds": 45, "host": "192.168.1.99"}, "backend": {"sync_seconds": 30}, "logging": {"level": "DEBUG"}}) is False


def test_los_repos_se_abren_en_el_hilo_que_los_usa(db):
    """Regresión: sqlite prohíbe usar una conexión desde otro hilo.

    Los sincronizadores se CONSTRUYEN en el hilo principal pero corren dentro
    del hilo de su loop. Cuando el Repository se abría en `__init__`, el primer
    acceso desde el loop reventaba con `sqlite3.ProgrammingError` y el agente
    quedaba en un bucle de errores sin sincronizar nada. Los tests no lo veían
    porque llamaban a `run_once()` desde el mismo hilo.
    """
    trabajos = [
        BackendSync(_holder(), _secrets(), db).run_once,
        Heartbeat(_holder(), _secrets(), StatusBoard(), db).run_once,
        DeviceSync(_holder(), _secrets(), StatusBoard(), db).run_once,
    ]

    errores_de_hilo = []

    def correr(trabajo):
        try:
            trabajo()
        except sqlite3.ProgrammingError as exc:
            errores_de_hilo.append(exc)
        except Exception:
            # Fallas de red o de reloj no importan acá: lo que se prueba es
            # que la conexión SQLite sea utilizable desde este hilo.
            pass

    for trabajo in trabajos:
        hilo = threading.Thread(target=correr, args=(trabajo,))
        hilo.start()
        hilo.join(timeout=30)

    assert not errores_de_hilo, f"SQLite usado desde otro hilo: {errores_de_hilo}"


def test_cada_sincronizador_abre_su_propia_conexion(db):
    """Dos sincronizadores no comparten conexión (una por hilo)."""
    uno = BackendSync(_holder(), _secrets(), db)
    otro = BackendSync(_holder(), _secrets(), db)
    assert uno._repo is not otro._repo
    # Y dentro del mismo objeto se reutiliza (no abre una por llamada).
    assert uno._repo is uno._repo


def test_precarga_la_config_remota_antes_de_arrancar_los_loops():
    """El backfill inicial se decide con la config de CelTuc, no con la local.

    Regresión: el loop del reloj arrancaba antes del primer heartbeat, hacía el
    backfill con el default local (7 días) en vez del configurado (90) y dejaba
    el watermark seteado, perdiendo el histórico para siempre.
    """
    from hikvision_agent.service.runner import precargar_config_remota

    llamadas = []

    class HeartbeatFalso:
        def run_once(self):
            llamadas.append(1)

    assert precargar_config_remota(HeartbeatFalso()) is True
    assert llamadas == [1]


def test_sin_internet_el_agente_arranca_igual():
    """Si el heartbeat inicial falla, no puede impedir que el agente arranque."""
    from hikvision_agent.backend.client import BackendTransientError
    from hikvision_agent.service.runner import precargar_config_remota

    class HeartbeatCaido:
        def run_once(self):
            raise BackendTransientError("sin red todavía")

    assert precargar_config_remota(HeartbeatCaido()) is False


class RelojQueCorta:
    """Simula al reloj real: responde unos tramos y después corta con 401.

    Es lo que hace el DS-K1A340WX cuando se lo atropella con cientos de
    consultas seguidas durante una recuperación histórica.
    """

    def __init__(self, tramos_ok=1):
        self.tramos_ok = tramos_ok
        self.consultas = 0

    def get_device_info(self):
        from hikvision_agent.hikvision.models import DeviceInfo

        return DeviceInfo(model="DS-K1A340WX", serial="SERIE-1", firmware="V1.2.7")

    def search_events(self, start_at, end_at):
        from hikvision_agent.hikvision.client import DeviceAuthError

        self.consultas += 1
        if self.consultas > self.tramos_ok:
            raise DeviceAuthError("El reloj rechazó las credenciales ISAPI (401)")
        return iter(())


def _congelar_ahora(monkeypatch, momento):
    class _FakeDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return momento.astimezone(tz) if tz else momento

    monkeypatch.setattr("hikvision_agent.sync.device_sync.datetime", _FakeDatetime)


def test_un_corte_a_mitad_del_backfill_no_pierde_el_progreso(db, monkeypatch):
    """Regresión: el watermark avanza por tramo, no solo al terminar todo.

    Antes se guardaba únicamente al completar el rango entero, así que un 401
    a mitad de una recuperación de 90 días tiraba TODO el progreso: el
    reintento arrancaba de cero, volvía a martillar al reloj y nunca terminaba.
    """
    from hikvision_agent.hikvision.client import DeviceAuthError

    reloj = RelojQueCorta(tramos_ok=2)
    monkeypatch.setattr(
        "hikvision_agent.sync.device_sync.HikvisionClient", lambda *_a, **_k: reloj
    )
    ahora = datetime(2026, 8, 17, 18, 0, tzinfo=TZ)
    _congelar_ahora(monkeypatch, ahora)

    holder = ConfigHolder({
        "hikvision": {"host": "192.168.1.31", "initial_backfill_days": 90},
        "backend": {"base_url": "https://celtuc.test"},
    })
    sincronizador = DeviceSync(holder, _secrets(), StatusBoard(), db)

    with pytest.raises(DeviceAuthError):
        sincronizador.run_once()

    # Se leyeron 2 tramos de 7 días antes del corte: el progreso quedó guardado.
    marca = Repository(db).get_watermark()
    assert marca is not None, "el corte tiró todo el progreso del backfill"
    esperado = ahora - timedelta(days=90) + timedelta(days=14)
    assert marca == esperado

    # Y el reintento RETOMA desde ahí en vez de empezar de cero.
    reloj.tramos_ok = 99
    sincronizador.run_once()
    assert Repository(db).get_watermark() == ahora
    # 2 consultas antes del corte + 1 fallida + los tramos restantes (no 13 de nuevo).
    assert reloj.consultas < 20


def test_un_404_del_proxy_es_transitorio(db, monkeypatch):
    """Durante un redespliegue el proxy contesta 404: hay que reintentar corto.

    Antes caía en el `except Exception` genérico del loop, que escribe una
    traza completa en el log — alarmante para algo que se resuelve solo en
    segundos.
    """
    from hikvision_agent.backend.client import BackendClient, BackendTransientError

    class RespuestaFalsa:
        status_code = 404
        text = "404 page not found"

        def json(self):
            return {}

    with pytest.raises(BackendTransientError):
        BackendClient._interpretar(RespuestaFalsa())
