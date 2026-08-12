"""Cifrado de secretos con DPAPI de Windows (sin dependencias extra).

Se usa alcance de MÁQUINA (CRYPTPROTECT_LOCAL_MACHINE) para que el mismo
archivo pueda leerlo tanto el administrador que instala como la tarea
programada que corre como SYSTEM. En sistemas no-Windows (solo desarrollo)
se guarda en claro con un prefijo que lo deja explícito.
"""
from __future__ import annotations

import base64
import json
import sys
from pathlib import Path

_PLAIN_PREFIX = b"PLAINDEV:"

if sys.platform == "win32":
    import ctypes
    import ctypes.wintypes as wintypes

    class _DATA_BLOB(ctypes.Structure):
        _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]

    _CRYPTPROTECT_UI_FORBIDDEN = 0x01
    _CRYPTPROTECT_LOCAL_MACHINE = 0x04

    def _blob(data: bytes) -> _DATA_BLOB:
        buffer = ctypes.create_string_buffer(data, len(data))
        return _DATA_BLOB(len(data), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_char)))

    def _from_blob(blob: _DATA_BLOB) -> bytes:
        try:
            return ctypes.string_at(blob.pbData, blob.cbData)
        finally:
            ctypes.windll.kernel32.LocalFree(blob.pbData)

    def protect(data: bytes) -> bytes:
        entrada = _blob(data)
        salida = _DATA_BLOB()
        flags = _CRYPTPROTECT_UI_FORBIDDEN | _CRYPTPROTECT_LOCAL_MACHINE
        if not ctypes.windll.crypt32.CryptProtectData(
            ctypes.byref(entrada), None, None, None, None, flags, ctypes.byref(salida)
        ):
            raise OSError("CryptProtectData falló")
        return _from_blob(salida)

    def unprotect(data: bytes) -> bytes:
        entrada = _blob(data)
        salida = _DATA_BLOB()
        if not ctypes.windll.crypt32.CryptUnprotectData(
            ctypes.byref(entrada), None, None, None, None, _CRYPTPROTECT_UI_FORBIDDEN, ctypes.byref(salida)
        ):
            raise OSError("CryptUnprotectData falló (¿el archivo se creó en otra máquina?)")
        return _from_blob(salida)

else:  # desarrollo en Linux/macOS

    def protect(data: bytes) -> bytes:
        return _PLAIN_PREFIX + base64.b64encode(data)

    def unprotect(data: bytes) -> bytes:
        if not data.startswith(_PLAIN_PREFIX):
            raise OSError("secrets.dat fue cifrado con DPAPI en Windows; no se puede leer acá")
        return base64.b64decode(data[len(_PLAIN_PREFIX):])


def save_secrets(path: Path, valores: dict[str, str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    crudo = json.dumps(valores).encode("utf-8")
    path.write_bytes(protect(crudo))


def load_secrets(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    try:
        return json.loads(unprotect(path.read_bytes()).decode("utf-8"))
    except Exception:
        # Archivo corrupto o de otra máquina: mejor pedir recargar secretos
        # que tumbar el agente.
        return {}
