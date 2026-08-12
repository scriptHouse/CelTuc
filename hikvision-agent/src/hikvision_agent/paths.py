"""Rutas de trabajo del agente.

Todo lo mutable (config, secretos, base de datos, logs) vive en ProgramData
para que el servicio pueda correr como SYSTEM sin depender de un perfil de
usuario. `HIKAGENT_HOME` permite mover la carpeta (útil en desarrollo).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path


def base_dir() -> Path:
    override = os.environ.get("HIKAGENT_HOME")
    if override:
        return Path(override)
    if sys.platform == "win32":
        program_data = os.environ.get("ProgramData", r"C:\ProgramData")
        return Path(program_data) / "CelTuc" / "HikvisionAgent"
    return Path.home() / ".hikvision-agent"


def data_dir() -> Path:
    return base_dir() / "data"


def logs_dir() -> Path:
    return base_dir() / "logs"


def default_config_path() -> Path:
    return base_dir() / "config.toml"


def default_secrets_path() -> Path:
    return base_dir() / "secrets.dat"


def default_db_path() -> Path:
    return data_dir() / "agent.db"


def ensure_dirs() -> None:
    for carpeta in (base_dir(), data_dir(), logs_dir()):
        carpeta.mkdir(parents=True, exist_ok=True)
