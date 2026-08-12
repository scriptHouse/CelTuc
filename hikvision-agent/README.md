# Agente de Asistencia CelTuc (Hikvision DS-K1A340WX)

Servicio para Windows que corre en la notebook de la sucursal y sincroniza las
fichadas del reloj Hikvision con el backend de CelTuc, sin intervención de
nadie: **prender la notebook y olvidarse**.

```text
Hikvision DS-K1A340WX ──ISAPI/LAN──> Agente (esta app) ──HTTPS──> CelTuc (Django) ──> PostgreSQL
                                        │
                                   SQLite (buffer)
```

Especificación completa: [`docs/asistencia-hikvision-spec.md`](../docs/asistencia-hikvision-spec.md).

## Cómo funciona

- **Tres loops independientes** (hilos): reloj→SQLite, SQLite→backend y heartbeat.
- **Buffer SQLite** en `C:\ProgramData\CelTuc\HikvisionAgent\data\agent.db`:
  nada se pierde si se corta Internet, se cae el backend o se apaga la notebook.
  Un evento local pasa a `SYNCED` solo cuando Django confirmó `accepted` o
  `duplicate`; los `rejected` reintentan pocas veces y quedan `ERROR`.
- **Watermark + solapamiento**: cada consulta al reloj repite los últimos
  minutos ya vistos; los duplicados los absorbe el uid único local y la
  idempotencia del backend.
- **Recuperación histórica**: si la notebook estuvo apagada días, al arrancar
  pide todo el rango faltante (en tramos de 7 días). La primera vez trae
  `initial_backfill_days` (configurable desde la web).
- **Config remota**: casi todo (IP del reloj, intervalos, backfill, nivel de
  log) se administra desde **CelTuc → Asistencia → Configuración** y llega en
  cada heartbeat; se cachea en SQLite para arrancar sin Internet. El
  `config.toml` local solo necesita URL del backend + token (+ IP inicial).
- **Backoff**: reloj apagado, Internet caído o backend 5xx → reintentos
  5→10→20→30→60 s. Token inválido → log CRÍTICO y reintento cada 5 min.
  El proceso nunca termina solo.
- **Secretos**: contraseña del reloj y token cifrados con **DPAPI**
  (`secrets set`); la contraseña del reloj jamás viaja al backend. También se
  aceptan las variables de entorno `HIKVISION_PASSWORD` y `BACKEND_AGENT_TOKEN`.
- **Logs rotativos** en `C:\ProgramData\CelTuc\HikvisionAgent\logs\agent.log`
  (5 MB × 5). Nunca se loguean contraseñas, tokens ni datos biométricos.

## FASE 1 — Probar el reloj (antes de instalar nada)

Desde una PC en la misma red que el reloj (requiere Python 3.11+):

```powershell
cd hikvision-agent
py -3 -m venv .venv ; .venv\Scripts\pip install requests tzdata pytest
.venv\Scripts\python scripts\test_hikvision_connection.py --host 192.168.1.50 --username admin --password ****
```

Salida esperada: `[OK] Device reachable / Authentication / Model / Firmware /
Events query` y el payload JSON del primer evento.

**Importante (spec §11/§54):** el parser se escribió contra la forma
documentada del `AcsEvent` de la línea MinMoe, pero el payload exacto depende
del firmware. Con el reloj a mano, capturar un fixture real y volver a correr
los tests:

```powershell
.venv\Scripts\python scripts\test_hikvision_connection.py --host ... --password ... `
    --save-fixture tests\fixtures\hikvision_event_sample.json --anonymize
.venv\Scripts\python -m pytest
```

Si el firmware no acepta `POST /ISAPI/AccessControl/AcsEvent?format=json`, el
diagnóstico lo dice explícitamente; en ese caso consultar el ISAPI Developer
Guide del portal TPP de Hikvision antes de tocar `hikvision/client.py`.

## Build del ejecutable

En la máquina de desarrollo:

```powershell
cd hikvision-agent
powershell -ExecutionPolicy Bypass -File scripts\build_exe.ps1
# → dist\hikvision-agent.exe
```

## Instalación en la notebook de la sucursal

1. En CelTuc → **Asistencia → Configuración** crear el reloj y su agente, y
   **descargar el `config.toml`** (incluye el token).
2. Copiar a la notebook (pendrive o red): `hikvision-agent.exe`,
   `config.toml` y `scripts\install_task.ps1`.
3. En PowerShell **como Administrador**:

   ```powershell
   powershell -ExecutionPolicy Bypass -File install_task.ps1
   ```

   El script instala el exe, restringe permisos de la carpeta de datos, pide
   la contraseña del reloj (queda cifrada con DPAPI) y registra la tarea
   programada **"CelTuc Hikvision Agent"**: arranca con Windows como SYSTEM,
   sin ventana, sin sesión iniciada y con reinicio automático.
4. Verificar: en 1–2 minutos el equipo aparece **En línea** en
   CelTuc → Asistencia → Panel.

Desinstalar: `uninstall_task.ps1` (con `-PurgeData` borra datos y logs).

## Operación y diagnóstico en la notebook

```powershell
& "C:\Program Files\CelTuc\HikvisionAgent\hikvision-agent.exe" diag       # prueba reloj + backend
& "C:\Program Files\CelTuc\HikvisionAgent\hikvision-agent.exe" config     # config efectiva (sin secretos)
& "C:\Program Files\CelTuc\HikvisionAgent\hikvision-agent.exe" secrets set
Get-Content C:\ProgramData\CelTuc\HikvisionAgent\logs\agent.log -Tail 30
Start-ScheduledTask "CelTuc Hikvision Agent"   # tras cambiar secretos/config
```

Para correrlo a mano viendo el log en vivo: `hikvision-agent.exe run --console`
(detener antes la tarea programada para no duplicar instancias).

## Tests

```powershell
py -3 -m venv .venv ; .venv\Scripts\pip install -e .[dev]
.venv\Scripts\python -m pytest
```

Cubren: parser contra fixture, idempotencia del buffer, recuperación
histórica, backend caído sin pérdida, rechazos controlados y config remota.

### Pruebas de aceptación en campo (spec §43–§47)

1. **Reinicio**: fichar → apagar notebook → fichar varias veces → prender →
   sin tocar nada, las fichadas aparecen en CelTuc una sola vez.
2. **Sin Internet**: desconectar Internet (manteniendo LAN) → fichar → los
   eventos quedan `PENDING` locales → volver Internet → suben solos.
3. **Backend caído**: idem con el backend abajo.
4. **Reloj caído**: apagar el reloj → el agente sigue vivo con warnings →
   prenderlo → se reconecta y recupera solo.
5. **Duplicados**: reenviar el mismo lote dos veces → una sola fichada en
   PostgreSQL (lo garantiza el backend y lo cubre `backend/asistencia/tests.py`).
