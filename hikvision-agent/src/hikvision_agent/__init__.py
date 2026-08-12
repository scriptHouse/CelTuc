"""Agente local de asistencia CelTuc.

Corre en la notebook de la sucursal, lee las fichadas del reloj Hikvision
por ISAPI, las guarda en un buffer SQLite y las sube al backend Django.
"""

AGENT_VERSION = "1.0.0"
