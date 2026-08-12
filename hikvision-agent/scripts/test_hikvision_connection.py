"""FASE 1 (spec §12): probar la conexión al reloj antes de instalar nada.

Uso desde el código fuente (requiere Python 3.11+ y `pip install requests tzdata`):

    python scripts/test_hikvision_connection.py --host 192.168.1.50 --username admin --password ****

    # capturar un payload real como fixture para los tests del parser:
    python scripts/test_hikvision_connection.py --host ... --password ... \
        --save-fixture tests/fixtures/hikvision_event_sample.json --anonymize

En una notebook ya instalada existe el equivalente: `hikvision-agent.exe diag`.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from hikvision_agent.main import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main(["diag", *sys.argv[1:]]))
