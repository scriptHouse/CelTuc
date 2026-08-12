"""Logs locales rotativos.

Nunca se loguean: password del reloj, token del backend ni fotos/biometría.
"""
from __future__ import annotations

import logging
import logging.handlers
import sys
from pathlib import Path

_FORMATO = "%(asctime)s %(levelname)s %(name)s %(message)s"
_FECHA = "%Y-%m-%d %H:%M:%S"


def setup_logging(logs_dir: Path, level: str = "INFO", console: bool = False) -> None:
    logs_dir.mkdir(parents=True, exist_ok=True)
    raiz = logging.getLogger()
    raiz.setLevel(getattr(logging, level.upper(), logging.INFO))
    raiz.handlers.clear()

    archivo = logging.handlers.RotatingFileHandler(
        logs_dir / "agent.log", maxBytes=5 * 1024 * 1024, backupCount=5, encoding="utf-8"
    )
    archivo.setFormatter(logging.Formatter(_FORMATO, _FECHA))
    raiz.addHandler(archivo)

    if console:
        pantalla = logging.StreamHandler(sys.stderr)
        pantalla.setFormatter(logging.Formatter(_FORMATO, _FECHA))
        raiz.addHandler(pantalla)

    # requests/urllib3 son muy charlatanes en DEBUG.
    logging.getLogger("urllib3").setLevel(logging.WARNING)


def set_level(level: str) -> None:
    logging.getLogger().setLevel(getattr(logging, level.upper(), logging.INFO))
