"""El botón «reintentar» del panel, del lado del agente.

El servidor no puede probar el reloj: vive en la LAN de la sucursal. Lo único
que puede hacer es dejar una marca de tiempo en la config remota. Estos tests
cubren las tres piezas que convierten esa marca en un reintento real:

1. leer el valor de la config sin romperse si viene cualquier cosa,
2. que el heartbeat distinga un pedido NUEVO de uno viejo,
3. que el loop del reloj corte su espera cuando se lo piden.

Sin el punto 2 el agente reintentaría en cada arranque por un pedido de hace
semanas; sin el punto 3 el botón no haría nada y habría que esperar los cinco
minutos del reintento automático igual.
"""
import threading
import time

from hikvision_agent.config import ConfigHolder
from hikvision_agent.service.runner import Loop
from hikvision_agent.sync.heartbeat import Heartbeat


# --- 1. Leer la marca de la config -------------------------------------------

def test_la_marca_se_lee_de_la_config_remota():
    holder = ConfigHolder({}, {"version": 5, "reintento_pedido": 1724700000})
    assert holder.reintento_pedido == 1724700000


def test_sin_marca_vale_cero():
    assert ConfigHolder({}, {"version": 5}).reintento_pedido == 0


def test_una_marca_con_basura_no_tumba_al_agente():
    """El agente nunca puede caerse por un dato raro que mande el servidor."""
    holder = ConfigHolder({}, {"version": 5, "reintento_pedido": "cualquier cosa"})
    assert holder.reintento_pedido == 0


def test_un_agente_viejo_ignora_la_marca():
    """Contraprueba del diseño: la clave va suelta, no adentro de `device`.

    `device` se filtra por una lista de claves conocidas, así que meterla ahí
    la haría desaparecer. Yendo suelta, un agente sin esta función simplemente
    no la mira, y la config le sigue llegando igual de bien.
    """
    holder = ConfigHolder({}, {
        "version": 5,
        "reintento_pedido": 1724700000,
        "device": {"host": "192.168.1.31", "poll_seconds": 20},
    })
    assert holder.current.device.host == "192.168.1.31"
    assert holder.current.device.poll_seconds == 20


# --- 2. Distinguir un pedido nuevo de uno viejo ------------------------------

def _heartbeat(holder, despertar):
    from pathlib import Path

    from hikvision_agent.config import Secrets
    from hikvision_agent.sync.status import StatusBoard

    return Heartbeat(holder, Secrets(), StatusBoard(), Path("no-se-usa.db"), despertar)


def test_el_primer_heartbeat_no_dispara_un_pedido_viejo():
    """Al arrancar, la config ya trae el último pedido: puede ser de hace un mes."""
    despertar = threading.Event()
    holder = ConfigHolder({}, {"version": 1, "reintento_pedido": 1724700000})
    latido = _heartbeat(holder, despertar)

    latido._mirar_pedido_de_reintento()

    assert not despertar.is_set()


def test_un_pedido_nuevo_despierta_al_loop_del_reloj():
    despertar = threading.Event()
    holder = ConfigHolder({}, {"version": 1, "reintento_pedido": 1724700000})
    latido = _heartbeat(holder, despertar)
    latido._mirar_pedido_de_reintento()  # primer vistazo: solo anota

    holder.apply_remote({"version": 2, "reintento_pedido": 1724700999})
    latido._mirar_pedido_de_reintento()

    assert despertar.is_set()


def test_el_mismo_pedido_no_se_dispara_dos_veces():
    """El heartbeat corre cada pocos segundos: sin esto reintentaría siempre."""
    despertar = threading.Event()
    holder = ConfigHolder({}, {"version": 1, "reintento_pedido": 1724700000})
    latido = _heartbeat(holder, despertar)
    latido._mirar_pedido_de_reintento()

    holder.apply_remote({"version": 2, "reintento_pedido": 1724700999})
    latido._mirar_pedido_de_reintento()
    despertar.clear()

    for _ in range(3):
        latido._mirar_pedido_de_reintento()

    assert not despertar.is_set()


# --- 3. Cortar la espera del loop --------------------------------------------

def _loop(despertar=None, stop=None):
    return Loop(
        "prueba",
        lambda: 1,
        lambda: None,
        stop or threading.Event(),
        despertar,
    )


def test_el_loop_corta_la_espera_cuando_lo_despiertan():
    despertar = threading.Event()
    loop = _loop(despertar)
    despertar.set()

    arranque = time.monotonic()
    corto = loop._dormir(30)

    assert corto is True
    assert time.monotonic() - arranque < 2, "no cortó la espera: la aguantó entera"
    assert not despertar.is_set(), "el evento tiene que quedar consumido"


def test_sin_pedido_el_loop_espera_lo_que_le_toca():
    loop = _loop(threading.Event())
    arranque = time.monotonic()

    assert loop._dormir(0.5) is False
    assert time.monotonic() - arranque >= 0.45


def test_apagar_el_agente_sigue_siendo_inmediato():
    """La espera ahora se mira de a tramos: el apagado no puede haberse vuelto lento."""
    stop = threading.Event()
    loop = _loop(threading.Event(), stop)
    stop.set()

    arranque = time.monotonic()
    assert loop._dormir(30) is False
    assert time.monotonic() - arranque < 1


def test_un_loop_sin_evento_se_comporta_como_siempre():
    """Los otros dos loops (backend y heartbeat) no reciben evento: nada cambia."""
    loop = _loop()  # sin despertar
    assert loop._dormir(0.3) is False
