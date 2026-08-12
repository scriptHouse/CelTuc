# Especificación técnica — Sincronización automática Hikvision → Django

## 1. Objetivo

Construir un **agente local para Windows** que se ejecute automáticamente en una notebook ubicada en una sucursal y sincronice las fichadas de un reloj Hikvision con un backend central en Django.

La operación debe ser **100% transparente para el usuario de la sucursal**:

```text
Hikvision DS-K1A340WX
        ↓
Red local de la sucursal (Wi‑Fi/LAN)
        ↓
Notebook Windows
        ↓
Agente/servicio Python automático
        ↓ HTTPS / Internet
API Django
        ↓
PostgreSQL
```

La persona de la sucursal solamente debe:

1. Encender la notebook.
2. Conectarla normalmente a la red/Internet.

A partir de ahí, **no debería abrir programas, consolas ni presionar botones**.

---

# 2. Hardware identificado

## Reloj

**Marca:** Hikvision  
**Familia:** MinMoe / Face Recognition Terminal  
**Modelo exacto:** `DS-K1A340WX`

Información confirmada oficialmente para este modelo/serie:

- Reconocimiento facial.
- Pantalla táctil de 4,3".
- Cámara de 2 MP.
- Capacidad aproximada de **1.500 rostros**.
- Capacidad de **300.000 registros/eventos de asistencia**.
- La `W` del modelo indica soporte **Wi‑Fi**.
- Soporta **ISAPI** para integración con software de terceros.
- Soporta **ISUP 5.0**.
- Permite exportar eventos/registros mediante USB como alternativa manual.
- Permite administrar funciones de asistencia local.
- Hikvision documenta estados de asistencia tales como check in, check out, break out, break in, overtime in y overtime out.

> IMPORTANTE: la integración planteada en este documento **no debe depender del pendrive/USB**. El USB queda únicamente como método de contingencia o diagnóstico.

---

# 3. Principio fundamental de la solución

El backend Django en Internet **NO debe intentar conectarse directamente al reloj de la sucursal**.

El reloj normalmente vive dentro de una red privada de la sucursal y no debe publicarse directamente en Internet.

La comunicación será iniciada desde la notebook:

```text
Reloj → Notebook → Internet → Django
```

Esto evita:

- abrir puertos del router;
- exponer el reloj a Internet;
- depender de una IP pública fija;
- tener que montar una VPN solamente para consultar fichadas;
- realizar acciones manuales en la sucursal.

---

# 4. Funcionamiento esperado

## Al encender la notebook

El agente debe arrancar automáticamente junto con Windows.

Flujo:

```text
Windows inicia
    ↓
Agente Hikvision inicia en segundo plano
    ↓
Comprueba red local
    ↓
Busca/intenta conectar al reloj
    ↓
Si no está disponible → reintenta
    ↓
Comprueba Internet / backend
    ↓
Consulta eventos nuevos del reloj
    ↓
Guarda eventos localmente
    ↓
Envía pendientes a Django
    ↓
Django persiste en PostgreSQL
    ↓
Agente continúa ejecutándose
```

No se debe mostrar una consola permanentemente al usuario.

---

# 5. Comportamiento ante notebook apagada

Este requisito es fundamental.

Ejemplo:

```text
Lunes:
08:00 empleado ficha
09:00 notebook se apaga

Lunes y martes:
el reloj continúa funcionando y registrando fichadas

Miércoles:
08:00 notebook vuelve a encender
```

Al arrancar el miércoles, el agente debe consultar al reloj y recuperar **todos los eventos todavía no sincronizados**.

Por lo tanto:

> Nunca asumir que solamente necesitamos eventos generados mientras la notebook está encendida.

El reloj posee almacenamiento propio, por lo que el agente debe trabajar con sincronización incremental + recuperación histórica.

---

# 6. Estrategia recomendada de sincronización

No utilizar únicamente una variable simple como `ultima_fecha_sincronizada`, porque puede haber:

- reloj desfasado;
- eventos fuera de orden;
- reintentos;
- duplicados;
- notebook apagada;
- backend caído;
- errores temporales de red.

Implementar un **watermark temporal** y una pequeña ventana de solapamiento.

Ejemplo:

```text
último poll correcto: 10:30
nuevo poll: eventos desde 10:28 hasta ahora
```

El solapamiento puede ser inicialmente de **2 a 5 minutos**.

Esto genera posibles duplicados, que deben resolverse mediante idempotencia.

---

# 7. Idempotencia / evitar duplicados

La API y la base de datos deben tolerar que un mismo evento llegue varias veces.

## Prioridad para identificar un evento

1. Usar un identificador único del evento entregado por Hikvision, si el payload ISAPI/firmware lo proporciona.
2. Si no existe uno confiable, construir una clave/hash estable usando campos como:

```text
device_serial
employee_number
event_datetime
event_type
verification_method
```

Ejemplo conceptual:

```python
sha256(
    f"{device_serial}|{employee_no}|{event_datetime}|{event_type}|{method}"
)
```

En PostgreSQL:

```text
UNIQUE(source_event_id)
```

o:

```text
UNIQUE(event_hash)
```

Así, enviar dos veces un evento nunca debe generar dos fichadas.

---

# 8. Buffer local en la notebook

Además de consultar el reloj, el agente debe tener una pequeña base local **SQLite**.

Objetivo:

```text
Reloj
  ↓
SQLite local
  ↓
Django
```

NO:

```text
Reloj → Django directamente y si Django falla se pierde el evento
```

SQLite permitirá almacenar:

- eventos descargados del reloj;
- eventos todavía no enviados;
- eventos enviados;
- estado de sincronización;
- configuración no sensible;
- última consulta exitosa;
- cantidad de reintentos;
- errores recientes.

Tabla conceptual:

```sql
local_events
------------
id
event_uid
device_serial
employee_no
occurred_at
event_type
verification_method
raw_payload
sync_status
retry_count
created_at
synced_at
```

Estados sugeridos:

```text
PENDING
SYNCED
ERROR
```

---

# 9. Dos sincronizaciones independientes

El agente debe separar conceptualmente:

## A. Hikvision → SQLite

Responsable de descargar los eventos existentes en el reloj.

## B. SQLite → Django

Responsable de enviar al servidor los eventos pendientes.

Esto permite que haya reloj pero no Internet, que Internet exista pero Django esté temporalmente caído, que el reloj se desconecte o que la notebook reinicie sin perder información.

---

# 10. Polling

Para empezar, usar **polling**.

No hace falta que cada fichada llegue en tiempo real absoluto.

Configuración inicial sugerida:

```text
Hikvision polling: cada 15–30 segundos
Upload a Django: cada 10–30 segundos
```

Ambos valores deben estar en configuración y no hardcodeados.

Ejemplo:

```env
DEVICE_POLL_SECONDS=20
BACKEND_SYNC_SECONDS=10
```

Posteriormente se puede evaluar recepción push/eventos ISAPI si el firmware y la documentación correspondiente lo justifican, pero **no es necesario para el MVP**.

---

# 11. Integración con Hikvision

El DS-K1A340WX soporta oficialmente **ISAPI**.

ISAPI es el mecanismo recomendado para que el agente Python consulte el dispositivo.

La API de Hikvision funciona sobre HTTP y puede utilizar XML/JSON según el recurso. Hikvision documenta el uso de **HTTP Digest Authentication** en ISAPI.

En Python se puede preparar la conexión con `requests`, por ejemplo conceptualmente:

```python
import requests
from requests.auth import HTTPDigestAuth

session = requests.Session()
session.auth = HTTPDigestAuth(
    DEVICE_USERNAME,
    DEVICE_PASSWORD
)
```

## MUY IMPORTANTE PARA CLAUDE

**No asumir a ciegas el endpoint exacto de eventos.**

Los comandos ISAPI disponibles pueden variar según:

- modelo;
- versión de firmware;
- baseline de ISAPI.

Antes de cerrar la implementación se debe:

1. Leer la versión de firmware real del dispositivo.
2. Verificar conectividad ISAPI.
3. Consultar la documentación ISAPI oficial correspondiente a `DS-K1A340WX`.
4. Confirmar el recurso exacto para búsqueda de eventos de Access Control / Time Attendance.
5. Capturar uno o varios payloads reales del reloj.
6. Recién entonces fijar el parser.

Hikvision ofrece el **ISAPI Developer Guide** a través de su portal TPP. La documentación de integración puede requerir una cuenta y la aceptación del Materials License Agreement.

Diseñar desde el inicio una interfaz desacoplada:

```python
class HikvisionClient:
    def healthcheck(self):
        ...

    def get_device_info(self):
        ...

    def search_events(self, start_at, end_at):
        ...
```

El resto del programa NO debe conocer los endpoints ISAPI concretos.

---

# 12. Prueba inicial del reloj

Antes de programar todo el agente, crear una herramienta/script:

```text
scripts/test_hikvision_connection.py
```

Debe comprobar:

1. La IP configurada responde.
2. La autenticación es válida.
3. Se puede obtener información básica del dispositivo.
4. Se puede consultar al menos un evento.
5. Se imprime el payload original recibido.

Ejemplo de salida deseada:

```text
[OK] Device reachable: 192.168.1.50
[OK] Authentication successful
[OK] Model: DS-K1A340WX
[OK] Firmware: ...
[OK] Events query successful
Found 17 events
```

Guardar además un fixture anonimizado:

```text
tests/fixtures/hikvision_event_sample.json
```

o XML si el equipo devuelve XML.

Todos los parsers deben probarse contra fixtures reales.

---

# 13. IP del reloj

Conviene que el reloj tenga una dirección predecible dentro de la sucursal.

### Recomendada

Reserva DHCP en el router:

```text
MAC Hikvision → 192.168.1.50
```

### Alternativa

IP estática configurada en el dispositivo.

El agente tendrá:

```env
HIKVISION_HOST=192.168.1.50
```

Nunca descubrir el dispositivo solamente por una IP hardcodeada sin documentar el procedimiento.

---

# 14. Red

Notebook y reloj deben poder verse dentro de la misma red local.

El modelo `DS-K1A340WX` soporta Wi‑Fi, por lo que puede conectarse a la red Wi‑Fi de la sucursal.

No asumir que el reloj posee o utiliza Ethernet físicamente: la topología relevante es simplemente:

```text
Reloj y notebook → misma LAN
```

Ejemplo:

```text
Router sucursal
 ├── Hikvision 192.168.1.50
 └── Notebook   192.168.1.120
```

La notebook debe poder comunicarse con la IP del reloj incluso cuando Internet esté caído, siempre que la LAN siga disponible.

---

# 15. Backend Django

Crear una API específica para agentes.

Ejemplo conceptual:

```text
POST /api/v1/attendance/events/bulk/
```

Payload sugerido:

```json
{
  "agent_id": "sucursal-centro-notebook-01",
  "device_id": "hikvision-centro-01",
  "events": [
    {
      "source_event_id": "abc123",
      "employee_number": "145",
      "occurred_at": "2026-08-11T08:01:22-03:00",
      "event_type": "check_in",
      "verification_method": "face",
      "raw": {}
    }
  ]
}
```

Preferir **batch/bulk** antes que un request HTTP por fichada.

Ejemplo:

```text
hasta 100–500 eventos por request
```

Debe ser configurable.

Respuesta conceptual:

```json
{
  "accepted": 37,
  "duplicates": 2,
  "rejected": []
}
```

---

# 16. Modelo PostgreSQL sugerido

```text
AttendanceDevice
----------------
id
branch_id
name
serial_number
model
is_active
created_at

AttendanceEvent
---------------
id
device_id
source_event_id
event_hash
employee_number
occurred_at
received_at
event_type
verification_method
raw_payload
```

Constraints:

```text
UNIQUE(device_id, source_event_id)
```

Cuando `source_event_id` no esté disponible:

```text
UNIQUE(device_id, event_hash)
```

Guardar siempre `raw_payload` para troubleshooting y reprocesamiento.

---

# 17. Usuario / empleado

No asumir que el nombre escrito en el reloj es el identificador maestro del empleado.

Utilizar preferentemente `employee_number` como referencia externa.

Si una fichada pertenece a un employee_number desconocido:

- NO descartarla;
- guardarla;
- marcarla como `UNMAPPED`;
- permitir asociarla posteriormente.

---

# 18. Zona horaria

La sucursal está en Argentina.

Configurar explícitamente una zona IANA adecuada, por ejemplo:

```text
America/Argentina/Buenos_Aires
```

Verificar durante instalación:

- hora del reloj;
- fecha;
- timezone;
- hora de Windows;
- timezone de Django.

En Django:

```python
USE_TZ = True
```

Guardar timestamps correctamente y presentar en la zona local correspondiente.

---

# 19. API de Django: autenticación

El endpoint NO debe ser público sin autenticación.

Usar una credencial diferente por agente/sucursal.

Opciones válidas:

- API key propia;
- token firmado;
- JWT de máquina;
- HMAC.

Para una primera versión puede utilizarse:

```http
Authorization: Bearer <AGENT_TOKEN>
```

Cada agente debe tener su propio token.

NO reutilizar el password del usuario administrador Django, el password del reloj ni tokens generales del frontend.

---

# 20. HTTPS

Toda comunicación `Notebook → Backend Django` debe utilizar **HTTPS**.

Nunca enviar fichadas o credenciales hacia el backend mediante HTTP por Internet.

---

# 21. Credenciales del Hikvision

La contraseña del reloj se necesita solamente en la notebook/agente.

No debe viajar al backend Django.

Configuración conceptual:

```env
HIKVISION_HOST=192.168.1.50
HIKVISION_USERNAME=integration
HIKVISION_PASSWORD=...
```

Si el firmware permite crear un usuario con permisos suficientes de solo lectura/eventos, preferirlo sobre utilizar admin.

No hardcodear contraseñas en Git.

Para MVP:

- `.env` local fuera del repositorio;
- permisos de archivos restringidos.

Para producción mejorada:

- Windows Credential Manager;
- DPAPI;
- almacenamiento cifrado.

---

# 22. Seguridad de red

NO hacer:

```text
Internet → port forwarding → Hikvision
```

No exponer puertos del reloj públicamente.

No hace falta que Django pueda iniciar conexiones hacia la sucursal.

El flujo debe ser siempre saliente:

```text
Notebook → Django
```

y local:

```text
Notebook → Hikvision
```

---

# 23. Servicio automático de Windows

La implementación final debe ejecutarse sin intervención.

## Alternativa A — MVP rápido: Task Scheduler

Empaquetar el agente como ejecutable y crear una tarea:

```text
Trigger: At startup
Run whether user is logged on or not
Restart on failure
```

El propio agente debe tolerar que la red todavía no esté disponible.

Ejemplo:

```text
PC inicia
→ agente inicia
→ Wi‑Fi tarda 25 segundos
→ conexión falla
→ agente espera
→ vuelve a intentar
→ funciona
```

## Alternativa B — Recomendada para producción: Windows Service

Ejecutar el agente como servicio real de Windows.

Beneficios:

- arranca con Windows;
- funciona sin que nadie inicie sesión;
- puede reiniciarse automáticamente si falla;
- no muestra consola;
- administración central más limpia.

Se puede implementar como servicio Python con `pywin32`, o como binario empaquetado + wrapper de servicio como WinSW.

Claude debe elegir una solución mantenible y documentar instalación/desinstalación.

---

# 24. Empaquetado

La sucursal no debería necesitar Python, pip, virtualenv, VS Code ni Git.

Empaquetar el agente como `.exe`, por ejemplo con PyInstaller:

```text
hikvision-agent.exe
```

Distribución sugerida:

```text
C:\Program Files\Company\HikvisionAgent    hikvision-agent.exe
    config
C:\ProgramData\Company\HikvisionAgent    data    logs```

No incluir secretos dentro del ejecutable.

---

# 25. Inicio sin Internet

Si la notebook prende y todavía no hay Internet, el agente **NO debe terminar**.

Debe entrar en reintento con backoff.

Ejemplo:

```text
5 s
10 s
20 s
30 s
60 s
60 s
...
```

Con límite máximo configurable.

Cuando Internet vuelva, sincroniza automáticamente.

---

# 26. Reloj desconectado

Si el reloj está apagado, el Wi‑Fi cayó, la IP es incorrecta o el router se está reiniciando, el agente tampoco debe cerrarse.

Debe registrar un warning y continuar intentando.

---

# 27. Django caído

Si el backend devuelve 500/502/503, timeout o error DNS:

1. mantener eventos en SQLite;
2. incrementar retry_count;
3. hacer backoff;
4. volver a enviar posteriormente.

Nunca marcar un evento como `SYNCED` antes de recibir confirmación válida del servidor.

---

# 28. Reinicio inesperado

Si Windows se apaga mientras se sincroniza:

- no debe corromper estado;
- usar transacciones SQLite;
- al volver a arrancar reintentar eventos `PENDING`;
- la idempotencia del backend debe impedir duplicados.

---

# 29. Logging

Logs locales rotativos.

Ruta sugerida:

```text
C:\ProgramData\Company\HikvisionAgent\logs```

Formato:

```text
2026-08-11 08:10:03 INFO Agent started
2026-08-11 08:10:04 INFO Device connected
2026-08-11 08:10:04 INFO Device model=DS-K1A340WX
2026-08-11 08:10:05 INFO Retrieved 12 events
2026-08-11 08:10:05 INFO 8 new, 4 duplicate
2026-08-11 08:10:07 INFO Uploaded 8 events
```

Nunca loguear password del Hikvision, API token, fotografías faciales completas ni información biométrica innecesaria.

---

# 30. Heartbeat

Agregar un heartbeat periódico hacia Django.

Ejemplo:

```text
POST /api/v1/agents/heartbeat/
```

Payload:

```json
{
  "agent_id": "sucursal-centro-notebook-01",
  "device_id": "hikvision-centro-01",
  "agent_version": "1.0.0",
  "device_reachable": true,
  "pending_events": 0,
  "last_device_sync_at": "2026-08-11T08:20:00-03:00"
}
```

Esto permitirá ver desde el sistema central:

```text
Sucursal Centro
Notebook: online
Reloj: online
Última sincronización: hace 14 s
Pendientes: 0
```

Muy recomendable.

---

# 31. Actualización del agente

Agregar desde el inicio una constante `AGENT_VERSION`, por ejemplo `1.0.0`, y enviarla en heartbeat.

No implementar auto-update en el MVP salvo necesidad real.

---

# 32. Configuración sugerida

Ejemplo de `config.toml`:

```toml
[agent]
id = "sucursal-centro-notebook-01"
branch_id = "centro"

[hikvision]
host = "192.168.1.50"
username = "integration"
poll_seconds = 20
overlap_seconds = 180
request_timeout_seconds = 10

[backend]
base_url = "https://mi-dominio.com"
sync_seconds = 10
batch_size = 200
request_timeout_seconds = 20

[storage]
sqlite_path = "C:/ProgramData/Company/HikvisionAgent/data/agent.db"

[logging]
level = "INFO"
```

Secretos por separado:

```text
HIKVISION_PASSWORD
BACKEND_AGENT_TOKEN
```

---

# 33. Estructura recomendada del proyecto

```text
hikvision-agent/
│
├── src/
│   └── hikvision_agent/
│       ├── __init__.py
│       ├── main.py
│       ├── config.py
│       ├── logging_config.py
│       │
│       ├── hikvision/
│       │   ├── client.py
│       │   ├── parser.py
│       │   └── models.py
│       │
│       ├── backend/
│       │   ├── client.py
│       │   └── models.py
│       │
│       ├── storage/
│       │   ├── database.py
│       │   └── repository.py
│       │
│       ├── sync/
│       │   ├── device_sync.py
│       │   └── backend_sync.py
│       │
│       └── service/
│           └── windows_service.py
│
├── scripts/
│   ├── test_hikvision_connection.py
│   ├── install_service.ps1
│   └── uninstall_service.ps1
│
├── tests/
│   ├── fixtures/
│   ├── test_parser.py
│   ├── test_idempotency.py
│   └── test_sync.py
│
├── pyproject.toml
├── README.md
└── .gitignore
```

---

# 34. Librerías Python sugeridas

Mantener pocas dependencias.

Ejemplo:

```text
requests
pydantic
tenacity
```

Y según implementación:

```text
pywin32
```

SQLite ya está incluido en Python mediante `sqlite3`.

---

# 35. Concurrencia

No complicar inicialmente con múltiples procesos.

Puede ejecutarse:

```text
Loop A: device polling
Loop B: backend uploading
Loop C: heartbeat
```

Con threads o asyncio.

Prioridad:

```text
simplicidad + recuperación + observabilidad
```

por encima de micro-optimizaciones.

---

# 36. Pseudocódigo principal

```python
def main():
    initialize_logging()
    storage = LocalStorage()
    hikvision = HikvisionClient()
    backend = BackendClient()

    while True:
        try:
            sync_device_to_local(storage, hikvision)
        except Exception:
            log_exception()

        try:
            sync_local_to_backend(storage, backend)
        except Exception:
            log_exception()

        try:
            maybe_send_heartbeat(storage, backend)
        except Exception:
            log_exception()

        sleep(SHORT_INTERVAL)
```

Idealmente las tres tareas tendrán sus propios intervalos.

---

# 37. Sincronización reloj → SQLite

Pseudocódigo:

```python
def sync_device_to_local(storage, device):
    now = current_time()
    last_poll = storage.get_last_successful_device_poll()

    if last_poll:
        start = last_poll - OVERLAP
    else:
        start = now - INITIAL_BACKFILL

    events = device.search_events(start_at=start, end_at=now)

    for event in events:
        uid = build_event_uid(event)
        storage.insert_if_not_exists(uid, event)

    storage.set_last_successful_device_poll(now)
```

---

# 38. Backfill inicial

En la primera instalación no empezar necesariamente desde "ahora".

Configurable:

```env
INITIAL_BACKFILL_DAYS=7
```

Por ejemplo:

```text
primera ejecución → buscar últimos 7 días
```

Si el sistema debe migrar histórico, permitir 30/60/90 días o un rango manual.

---

# 39. Sincronización SQLite → Django

Pseudocódigo:

```python
def sync_local_to_backend(storage, backend):
    batch = storage.get_pending(limit=200)

    if not batch:
        return

    response = backend.send_events(batch)

    for event in response.accepted:
        storage.mark_synced(event.uid)

    for event in response.duplicates:
        storage.mark_synced(event.uid)
```

Un duplicate confirmado por Django se considera sincronizado correctamente.

---

# 40. Manejo de errores HTTP

```text
200 / 201 → OK
400 → payload inválido; guardar detalle y no hacer retry infinito sin control
401 / 403 → credencial incorrecta; alerta crítica
409 → posible duplicate; manejar idempotentemente
429 → respetar backoff
500 / 502 / 503 / 504 → retry
```

Usar timeouts explícitos siempre.

---

# 41. Datos biométricos

El objetivo es sincronizar **fichadas**, no construir una base central de fotografías biométricas.

En principio guardar:

```text
employee_number
fecha/hora
tipo de evento
método de autenticación
identificador del reloj
```

Evitar transferir fotografías faciales salvo que exista un requerimiento funcional/legal explícito.

---

# 42. Primera instalación física

Checklist:

```text
[ ] Encender Hikvision
[ ] Activar/configurar dispositivo
[ ] Configurar timezone
[ ] Configurar Wi‑Fi
[ ] Registrar empleados
[ ] Obtener IP
[ ] Reservar IP en router
[ ] Verificar acceso desde notebook
[ ] Crear/configurar credencial de integración
[ ] Anotar modelo
[ ] Anotar serial
[ ] Anotar firmware
[ ] Realizar una fichada de prueba
[ ] Consultarla por ISAPI
[ ] Instalar agente
[ ] Configurar backend
[ ] Instalar servicio de Windows
[ ] Reiniciar notebook
[ ] Confirmar que sincroniza sin intervención
```

---

# 43. Test obligatorio: reinicio

1. Hacer una fichada.
2. Confirmar sincronización.
3. Apagar notebook.
4. Hacer varias fichadas con notebook apagada.
5. Encender notebook.
6. No abrir ningún programa.
7. Verificar que el servicio inicia solo.
8. Verificar que recupera las fichadas pendientes.
9. Confirmar que no genera duplicados.

Este es uno de los principales criterios de aceptación.

---

# 44. Test obligatorio: Internet caído

1. Notebook encendida.
2. Desconectar Internet manteniendo la LAN si es posible.
3. Realizar varias fichadas.
4. Verificar que los eventos quedan almacenados localmente.
5. Restaurar Internet.
6. Confirmar sincronización automática.
7. Confirmar cero pérdida y cero duplicados.

---

# 45. Test obligatorio: backend caído

1. Reloj y notebook funcionando.
2. Backend temporalmente inaccesible.
3. Realizar fichadas.
4. Confirmar que SQLite mantiene `PENDING`.
5. Restaurar backend.
6. Confirmar envío automático.

---

# 46. Test obligatorio: reloj caído

1. Notebook/Internet funcionando.
2. Apagar reloj.
3. Agente debe continuar vivo.
4. Encender reloj.
5. Agente debe reconectar solo.
6. Recuperar eventos faltantes.

---

# 47. Test de duplicados

Enviar dos veces exactamente el mismo batch.

Resultado esperado:

```text
1 sola AttendanceEvent en PostgreSQL
```

El backend debe ser idempotente.

---

# 48. Monitoreo desde Django

Crear eventualmente una pantalla:

```text
DISPOSITIVOS
─────────────────────────────────────
Sucursal Centro
Reloj: DS-K1A340WX
Estado: 🟢 Online
Notebook: 🟢 Online
Última ficha recibida: 08:14
Último heartbeat: hace 20 segundos
Eventos pendientes: 0
```

Esto permitirá diagnosticar remotamente sin llamar a la sucursal.

---

# 49. Qué NO hacer

```text
❌ No abrir puertos del Hikvision a Internet
❌ No depender de pendrives
❌ No pedir al usuario que ejecute un .bat todos los días
❌ No depender de que alguien abra el programa
❌ No guardar passwords en Git
❌ No asumir que Internet siempre funciona
❌ No asumir que Django siempre funciona
❌ No asumir que el reloj siempre funciona
❌ No confiar únicamente en la última fecha sincronizada
❌ No insertar eventos sin idempotencia
❌ No borrar eventos locales antes de confirmación del servidor
❌ No implementar el parser ISAPI usando campos inventados
```

---

# 50. Orden de implementación recomendado para Claude

## FASE 1 — Confirmar dispositivo

Crear primero:

```text
test_hikvision_connection.py
```

Objetivo:

```text
Python → Hikvision
```

Confirmar modelo, firmware, autenticación, API ISAPI y payload real de eventos.

NO avanzar con parser definitivo hasta obtener payload real.

## FASE 2 — Cliente Hikvision

Crear `HikvisionClient` con:

```python
healthcheck()
get_device_info()
search_events(start, end)
```

Pruebas unitarias con fixture real.

## FASE 3 — SQLite

Implementar event insert, deduplicación, pending, synced y watermark.

## FASE 4 — Django

Crear modelos equivalentes a:

```text
AttendanceDevice
AttendanceEvent
Agent
```

y endpoints:

```text
POST /attendance/events/bulk/
POST /agents/heartbeat/
```

Implementar constraints de idempotencia.

## FASE 5 — BackendClient

Implementar:

```text
SQLite → Django HTTPS
```

con retry/backoff.

## FASE 6 — Loop completo

```text
Hikvision
→ SQLite
→ Django
→ PostgreSQL
```

## FASE 7 — Servicio Windows

Empaquetar y lograr:

```text
Inicio Windows → agente automático
```

Sin consola.

## FASE 8 — Pruebas de resiliencia

Ejecutar todos los escenarios descritos anteriormente.

---

# 51. Criterios de aceptación

```text
[ ] Notebook recién iniciada sincroniza sola.
[ ] No es necesario iniciar sesión si se implementa como servicio.
[ ] No aparece consola al usuario.
[ ] Si no hay Internet, el servicio sigue vivo.
[ ] Cuando vuelve Internet, sincroniza solo.
[ ] Si Django está caído, no se pierden eventos.
[ ] Si el reloj está caído, el agente se recupera.
[ ] Si notebook estuvo apagada, recupera fichadas históricas.
[ ] Un mismo evento nunca se duplica en PostgreSQL.
[ ] Reloj nunca está publicado directamente en Internet.
[ ] Credenciales no están dentro del repositorio.
[ ] Hay logs útiles.
[ ] Django conoce el último heartbeat.
[ ] Se puede saber qué sucursal/reloj originó cada evento.
[ ] Raw payload se conserva para troubleshooting.
```

---

# 52. Arquitectura final esperada

```text
┌───────────────────────────────────┐
│            SUCURSAL               │
│                                   │
│  ┌─────────────────────────────┐  │
│  │ Hikvision DS-K1A340WX       │  │
│  │ IP local fija/reservada     │  │
│  │ ISAPI                       │  │
│  └──────────────┬──────────────┘  │
│                 │                 │
│              Wi‑Fi/LAN            │
│                 │                 │
│  ┌──────────────▼──────────────┐  │
│  │ Notebook Windows            │  │
│  │                             │  │
│  │ Hikvision Agent             │  │
│  │ ┌─────────────────────────┐ │  │
│  │ │ ISAPI Client            │ │  │
│  │ ├─────────────────────────┤ │  │
│  │ │ SQLite Buffer           │ │  │
│  │ ├─────────────────────────┤ │  │
│  │ │ Sync Engine             │ │  │
│  │ ├─────────────────────────┤ │  │
│  │ │ Backend HTTPS Client    │ │  │
│  │ └─────────────────────────┘ │  │
│  └──────────────┬──────────────┘  │
│                 │                 │
└─────────────────┼─────────────────┘
                  │
                HTTPS
                  │
                  ▼
┌───────────────────────────────────┐
│              CLOUD                │
│                                   │
│        Django / DRF API           │
│                 │                 │
│                 ▼                 │
│            PostgreSQL             │
│                                   │
└───────────────────────────────────┘
```

---

# 53. Decisión de arquitectura

Para este caso, **la notebook ya disponible en la sucursal funciona como gateway/agente local**.

Es una solución simple porque:

- no requiere abrir puertos;
- no requiere IP pública;
- no requiere acceso remoto a la red;
- no requiere interacción cotidiana;
- tolera desconexiones;
- puede recuperar eventos cuando vuelve a encender;
- centraliza todo en Django/PostgreSQL.

La prioridad es que la experiencia en la sucursal sea:

```text
prender notebook y olvidarse
```

---

# 54. Fuentes oficiales Hikvision

Fuentes a utilizar como autoridad durante la implementación:

1. **Página oficial DS-K1A340WX**  
   https://www.hikvision.com/en/products/Access-Control-Products/Face-Recognition-Terminals/Value-Series/ds-k1a340wx/

2. **Release Notes oficiales DS-K1A340 Series MinMoe**  
   https://assets.hikvision.com/prd/public/all/files/202308/DS-K1A340%20Series%20MinMoe%20Terminal%20V1.2.7_build230609%20Release%20Note.pdf

3. **Portal oficial ISAPI Developer Guide / Hikvision TPP**  
   https://tpp.hikvision.com/download/ISAPI_OTAP

4. **Portal Hikvision TPP — documentación sobre ISAPI**  
   https://tpp.hikvision.com/download/

## Nota sobre documentación ISAPI

Hikvision restringe parte de la documentación ISAPI a usuarios que hayan aceptado su **Materials License Agreement (MLA)**.

Por ese motivo:

> Claude NO debe inventar endpoints ni asumir que un endpoint encontrado para otro modelo es necesariamente idéntico para este firmware.

Primero comprobar:

```text
DS-K1A340WX + firmware real
```

contra el Developer Guide correspondiente.

---

# 55. Prompt directo para Claude

> Implementá esta arquitectura por etapas. Empezá únicamente por la Fase 1: crear un proyecto Python limpio y un script de diagnóstico para conectarnos al Hikvision DS-K1A340WX mediante ISAPI, identificar modelo/firmware y recuperar eventos reales. No inventes el formato del payload ni cierres todavía el parser. Diseñá HikvisionClient desacoplado para que después podamos incorporar SQLite, sincronización con Django y ejecución como servicio de Windows. Priorizá resiliencia, idempotencia, logs y funcionamiento completamente automático después del arranque de Windows.
