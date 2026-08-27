"""Pizarra de estado compartida entre los hilos (para el heartbeat)."""
from __future__ import annotations

import threading
from datetime import datetime, timedelta, timezone

from ..hikvision.models import DeviceInfo


class StatusBoard:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.started_at = datetime.now(timezone.utc)
        self._device_reachable: bool | None = None
        self._device_error: str = ""
        self._device_info: DeviceInfo | None = None
        self._last_device_sync_at: datetime | None = None
        # Hasta cuando el propio reloj tiene cerrado el acceso por su
        # proteccion antifuerza-bruta. Se informa aparte del error de texto
        # porque cambia lo que se PUEDE hacer: durante un bloqueo, cada intento
        # nuevo reinicia el contador del equipo. Que el panel lo sepa es lo que
        # le permite no ofrecer un reintento que empeoraria las cosas.
        self._device_locked_until: datetime | None = None

    def device_ok(self, info: DeviceInfo | None, momento: datetime) -> None:
        with self._lock:
            self._device_reachable = True
            self._device_error = ""
            self._device_locked_until = None
            if info is not None:
                self._device_info = info
            self._last_device_sync_at = momento

    def device_fail(self, error: str) -> None:
        with self._lock:
            self._device_reachable = False
            self._device_error = error[:300]
            # Una falla comun no dice nada del bloqueo: se deja de afirmarlo.
            self._device_locked_until = None

    def device_locked(self, error: str, segundos: int) -> None:
        """El reloj cerro el acceso por intentos fallidos y avisa cuanto falta."""
        with self._lock:
            self._device_reachable = False
            self._device_error = error[:300]
            self._device_locked_until = datetime.now(timezone.utc) + timedelta(
                seconds=max(0, int(segundos))
            )

    def snapshot(self) -> dict:
        with self._lock:
            info = self._device_info
            bloqueo = self._device_locked_until
            faltan = None
            if bloqueo is not None:
                faltan = max(0, int((bloqueo - datetime.now(timezone.utc)).total_seconds()))
            return {
                "started_at": self.started_at.isoformat(timespec="seconds"),
                "device_reachable": self._device_reachable,
                "device_error": self._device_error or None,
                "device_locked_seconds": faltan,
                "last_device_sync_at": (
                    self._last_device_sync_at.isoformat(timespec="seconds")
                    if self._last_device_sync_at
                    else None
                ),
                "device_info": (
                    {"model": info.model, "serial_number": info.serial, "firmware": info.firmware}
                    if info
                    else None
                ),
            }

    @property
    def device_info(self) -> DeviceInfo | None:
        with self._lock:
            return self._device_info

    def set_device_info(self, info: DeviceInfo) -> None:
        with self._lock:
            self._device_info = info
