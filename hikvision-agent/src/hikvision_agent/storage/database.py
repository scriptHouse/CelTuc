"""Conexión y esquema del buffer SQLite.

WAL + transacciones: un apagón en medio de una sincronización no corrompe
el estado (spec §28).
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

_ESQUEMA = """
CREATE TABLE IF NOT EXISTS local_events (
    uid                 TEXT PRIMARY KEY,
    source_event_id     TEXT NOT NULL DEFAULT '',
    employee_number     TEXT NOT NULL DEFAULT '',
    employee_name       TEXT NOT NULL DEFAULT '',
    occurred_at         TEXT NOT NULL,
    event_type          TEXT NOT NULL DEFAULT 'unknown',
    verification_method TEXT NOT NULL DEFAULT 'unknown',
    raw_payload         TEXT NOT NULL DEFAULT '{}',
    sync_status         TEXT NOT NULL DEFAULT 'PENDING',
    retry_count         INTEGER NOT NULL DEFAULT 0,
    last_error          TEXT,
    created_at          TEXT NOT NULL,
    synced_at           TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_status ON local_events (sync_status, occurred_at);

CREATE TABLE IF NOT EXISTS kv_state (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""


def connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conexion = sqlite3.connect(str(path), timeout=10)
    conexion.row_factory = sqlite3.Row
    conexion.execute("PRAGMA journal_mode=WAL")
    conexion.execute("PRAGMA synchronous=NORMAL")
    conexion.execute("PRAGMA busy_timeout=5000")
    conexion.executescript(_ESQUEMA)
    return conexion
