"""Punto de entrada para el ejecutable empaquetado.

PyInstaller corre el script objetivo como `__main__`, sin contexto de
paquete: apuntarlo directo a `src/hikvision_agent/main.py` rompe todos sus
imports relativos (`from . import ...`) con «attempted relative import with
no known parent package». Este envoltorio importa el paquete de forma
absoluta, que es lo que PyInstaller necesita para resolverlo.
"""
import sys

from hikvision_agent.main import main

if __name__ == "__main__":
    sys.exit(main())
