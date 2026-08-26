"""Dónde escribe el agente según el sistema donde corre.

Esto parece trivial y no lo es: en la Mac el agente corre como daemon de
launchd, o sea **como root**. Si `HIKAGENT_HOME` no mandara, `Path.home()`
devolvería `/var/root` y el agente escribiría su base y sus logs ahí, en vez
de la carpeta que preparó el instalador — con la config y los secretos en otro
lado. Arrancaría igual, sin config, y la sucursal no sincronizaría nunca sin
que nada explique por qué.
"""
import sys

import pytest

from hikvision_agent import paths


def test_hikagent_home_manda_sobre_todo(monkeypatch, tmp_path):
    """Es la variable que el LaunchDaemon (y el servicio de Windows) le pasan."""
    monkeypatch.setenv("HIKAGENT_HOME", str(tmp_path))

    assert paths.base_dir() == tmp_path
    assert paths.data_dir() == tmp_path / "data"
    assert paths.logs_dir() == tmp_path / "logs"
    assert paths.default_config_path() == tmp_path / "config.toml"
    assert paths.default_secrets_path() == tmp_path / "secrets.dat"
    assert paths.default_db_path() == tmp_path / "data" / "agent.db"


def test_sin_la_variable_cada_sistema_usa_lo_suyo(monkeypatch):
    monkeypatch.delenv("HIKAGENT_HOME", raising=False)
    base = paths.base_dir()

    if sys.platform == "win32":
        # Fuera de un perfil de usuario: el servicio corre como SYSTEM.
        assert base.parts[-2:] == ("CelTuc", "HikvisionAgent")
    else:
        assert base.name == ".hikvision-agent"


def test_ensure_dirs_crea_todo_de_una(monkeypatch, tmp_path):
    destino = tmp_path / "todavia-no-existe"
    monkeypatch.setenv("HIKAGENT_HOME", str(destino))

    paths.ensure_dirs()

    assert destino.is_dir()
    assert (destino / "data").is_dir()
    assert (destino / "logs").is_dir()


@pytest.fixture()
def dpapi_como_en_mac(monkeypatch):
    """Carga `dpapi` como si el sistema fuera macOS, y lo deja como estaba.

    El módulo elige su implementación en el import, mirando `sys.platform`.
    Recargarlo con la plataforma pisada es la única forma de probar desde
    Windows el camino que se va a usar en la Mac — que es justamente el que
    no se puede probar en la sucursal el día de la instalación.
    """
    import importlib

    from hikvision_agent import dpapi

    monkeypatch.setattr(sys, "platform", "darwin")
    yield importlib.reload(dpapi)
    monkeypatch.undo()
    importlib.reload(dpapi)


def test_los_secretos_van_y_vuelven_fuera_de_windows(dpapi_como_en_mac, tmp_path):
    """En Mac y Linux no hay DPAPI: se guarda codificado, no cifrado.

    Lo que protege el archivo son los permisos, y por eso el instalador lo
    deja en 600 con dueño root. Este test fija que el ida y vuelta funcione,
    que es de lo que depende que el agente encuentre la contraseña del reloj
    al arrancar como daemon.
    """
    archivo = tmp_path / "secrets.dat"
    dpapi_como_en_mac.save_secrets(archivo, {"hikvision_password": "clave del reloj"})

    assert archivo.exists()
    assert dpapi_como_en_mac.load_secrets(archivo) == {"hikvision_password": "clave del reloj"}


def test_un_secrets_de_windows_no_se_lee_en_mac(dpapi_como_en_mac, tmp_path):
    """Copiar el secrets.dat de otra máquina no sirve, y tiene que decirlo.

    En Windows el archivo está cifrado con DPAPI, atado a ESE equipo. Acá lo
    importante es que no explote: devuelve vacío y el agente pide cargarlos
    de nuevo.
    """
    archivo = tmp_path / "secrets.dat"
    # Un blob de DPAPI es binario y no arranca con el prefijo que usa
    # el camino de Mac/Linux, asi que `unprotect` lo rechaza.
    archivo.write_bytes(bytes([1, 0, 0, 0]) + b"cifrado con DPAPI en otra maquina")

    assert dpapi_como_en_mac.load_secrets(archivo) == {}


def test_secretos_ilegibles_no_tumban_al_agente(tmp_path):
    """Un archivo corrupto o de otra máquina no puede impedir que arranque."""
    from hikvision_agent import dpapi

    archivo = tmp_path / "secrets.dat"
    archivo.write_bytes(b"esto no es un archivo de secretos")

    assert dpapi.load_secrets(archivo) == {}
