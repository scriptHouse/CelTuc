"""Pizarra de estado compartida entre los hilos (para el heartbeat)."""
from __future__ import annotations

import threading
from datetime import datetime, timezone

from ..hikvision.models import DeviceInfo


class StatusBoard:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.started_at = datetime.now(timezone.utc)
        self._device_reachable: bool | None = None
        self._device_error: str = ""
        self._device_info: DeviceInfo | None = None
        self._last_device_sync_at: datetime | None = None

    def device_ok(self, info: DeviceInfo | None, momento: datetime) -> None:
        with self._lock:
            self._device_reachable = True
            self._device_error = ""
            if info is not None:
                self._device_info = info
            self._last_device_sync_at = momento

    def device_fail(self, error: str) -> None:
        with self._lock:
            self._device_reachable = False
            self._device_error = error[:300]

    def snapshot(self) -> dict:
        with self._lock:
            info = self._device_info
            return {
                "started_at": self.started_at.isoformat(timespec="seconds"),
                "device_reachable": self._device_reachable,
                "device_error": self._device_error or None,
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
