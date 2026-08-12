"""Tipos de datos del lado del reloj."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime


@dataclass(frozen=True)
class DeviceInfo:
    model: str = ""
    serial: str = ""
    firmware: str = ""
    name: str = ""


@dataclass(frozen=True)
class ClockEvent:
    """Una fichada ya normalizada, lista para el buffer local."""

    uid: str
    source_event_id: str
    employee_number: str
    employee_name: str
    occurred_at: datetime
    event_type: str
    verification_method: str
    raw: dict = field(default_factory=dict)
