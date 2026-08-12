"""El buffer local nunca duplica un evento y no pierde nada sin confirmación."""
from datetime import datetime, timezone

import pytest

from hikvision_agent.hikvision.models import ClockEvent
from hikvision_agent.storage.repository import MAX_REJECT_RETRIES, Repository


@pytest.fixture()
def repo(tmp_path):
    repositorio = Repository(tmp_path / "agent.db")
    yield repositorio
    repositorio.close()


def _evento(uid="abc123", numero="145"):
    return ClockEvent(
        uid=uid,
        source_event_id="118",
        employee_number=numero,
        employee_name="EMPLEADO",
        occurred_at=datetime(2026, 8, 10, 11, 1, 22, tzinfo=timezone.utc),
        event_type="check_in",
        verification_method="face",
        raw={"serialNo": 118},
    )


def test_insertar_dos_veces_no_duplica(repo):
    assert repo.insert_event_if_new(_evento()) is True
    assert repo.insert_event_if_new(_evento()) is False
    assert repo.counts()["PENDING"] == 1


def test_synced_solo_con_confirmacion(repo):
    repo.insert_event_if_new(_evento())
    assert [e["uid"] for e in repo.pending_events(10)] == ["abc123"]

    repo.mark_synced(["abc123"])
    assert repo.pending_events(10) == []
    assert repo.counts()["SYNCED"] == 1

    # Un duplicate confirmado por Django también cuenta como sincronizado.
    repo.insert_event_if_new(_evento(uid="xyz789"))
    repo.mark_synced(["xyz789"])
    assert repo.counts()["SYNCED"] == 2


def test_rechazos_pasan_a_error_tras_reintentos(repo):
    repo.insert_event_if_new(_evento())
    for _ in range(MAX_REJECT_RETRIES - 1):
        assert repo.mark_rejected("abc123", "payload inválido") == "PENDING"
    assert repo.mark_rejected("abc123", "payload inválido") == "ERROR"
    assert repo.counts()["ERROR"] == 1
    assert repo.pending_events(10) == []


def test_watermark_y_config_cacheada(repo):
    assert repo.get_watermark() is None
    momento = datetime(2026, 8, 11, 10, 30, tzinfo=timezone.utc)
    repo.set_watermark(momento)
    assert repo.get_watermark() == momento

    assert repo.get_cached_remote_config() == {}
    repo.set_cached_remote_config({"version": 7, "device": {"poll_seconds": 15}})
    assert repo.get_cached_remote_config()["version"] == 7
