"""Tipos de datos del lado del backend CelTuc."""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class BulkItemResult:
    uid: str
    status: str  # accepted | duplicate | rejected
    error: str = ""


@dataclass(frozen=True)
class BulkResult:
    accepted: int = 0
    duplicates: int = 0
    rejected: int = 0
    results: list[BulkItemResult] = field(default_factory=list)

    @classmethod
    def from_json(cls, datos: dict) -> "BulkResult":
        items = [
            BulkItemResult(
                uid=str(r.get("uid") or ""),
                status=str(r.get("status") or ""),
                error=str(r.get("error") or ""),
            )
            for r in (datos.get("results") or [])
        ]
        return cls(
            accepted=int(datos.get("accepted") or 0),
            duplicates=int(datos.get("duplicates") or 0),
            rejected=int(datos.get("rejected") or 0),
            results=items,
        )
