# Módulo de Facturación Electrónica (ARCA) — CelTuc

> **Para quién es este documento:** para un futuro Claude (o cualquier dev) que
> necesite entender, mantener o extender la facturación electrónica de CelTuc sin
> haber estado presente cuando se construyó. Está escrito detalle por detalle, paso
> a paso, con el *qué*, el *cómo* y el *por qué*.
>
> **Última actualización:** 27/06/2026.
> **Estado:** funcionando y **validado contra ARCA homologación** (se obtuvieron CAE
> reales de prueba para Factura C, A y B). Falta puesta en producción y Notas de Crédito.

---

## Tabla de contenidos

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Decisiones clave (y por qué)](#2-decisiones-clave-y-por-qué)
3. [Arquitectura general](#3-arquitectura-general)
4. [Backend — app `facturacion` archivo por archivo](#4-backend--app-facturacion-archivo-por-archivo)
5. [La integración con ARCA (`arca/`)](#5-la-integración-con-arca-arca)
6. [API REST — endpoints](#6-api-rest--endpoints)
7. [Frontend archivo por archivo](#7-frontend-archivo-por-archivo)
8. [El PDF de la factura y la regla de marca](#8-el-pdf-de-la-factura-y-la-regla-de-marca)
9. [Reglas fiscales y tablas de códigos](#9-reglas-fiscales-y-tablas-de-códigos)
10. [Flujo de emisión end-to-end](#10-flujo-de-emisión-end-to-end)
11. [Certificados ARCA: cómo se obtienen (homologación y producción)](#11-certificados-arca-cómo-se-obtienen-homologación-y-producción)
12. [Qué datos necesita cada emisor](#12-qué-datos-necesita-cada-emisor)
13. [Cómo probar / validar](#13-cómo-probar--validar)
14. [Gotchas y lecciones aprendidas](#14-gotchas-y-lecciones-aprendidas)
15. [Pendientes / próximos pasos](#15-pendientes--próximos-pasos)
16. [Mapa de archivos](#16-mapa-de-archivos)

---

## 1. Resumen ejecutivo

CelTuc es un sistema de gestión (Django REST + React/TS). El módulo de **facturación
electrónica** permite emitir comprobantes fiscales (Factura A, B y C) con **CAE real**
de **ARCA** (ex AFIP), para **múltiples emisores** (N Responsables Inscriptos + N
Monotributistas), cada uno con sus propias credenciales.

Puntos centrales:

- **Conexión DIRECTA a los Web Services oficiales de ARCA** (WSAA + WSFEv1) desde
  nuestro propio backend. **NO se usa AFIP SDK / afipsdk.com** (servicio pago de
  terceros). Esto fue una **decisión explícita del usuario**: todo en nuestro código,
  sin costos ni límites de terceros.
- **Multi-emisor**: cada emisor (cuenta) guarda su CUIT, punto de venta, certificado y
  clave privada. Una instancia lógica de cliente ARCA por emisor.
- **Antes** la pantalla `/facturacion` era 100% simulada en `localStorage`. **Ahora** es
  real contra el backend.
- Genera **PDF descargable** (estilo ARCA con QR + CAE) usando el motor `@react-pdf/renderer`
  que ya tenía el proyecto para otros documentos.

---

## 2. Decisiones clave (y por qué)

| Decisión | Qué se eligió | Por qué |
|---|---|---|
| **Cómo conectar a ARCA** | Directo (WSAA+WSFEv1) con `zeep` + `cryptography`, sin SDK externo | El usuario **rechazó** afipsdk.com. Sin costos, sin límite de CUITs, todo el código en el repo. |
| **Modelo multi-emisor** | **Opción A: cada emisor con su propio certificado** | El usuario lo confirmó. Cada Monotributista/RI factura como sí mismo. (La opción B, "delegación" con un cert para varios CUITs, quedó documentada como futura.) |
| **Almacenamiento de credenciales** | Texto PEM (`certificado`, `clave_privada`) en la base, **write-only** en la API | Lo más simple para cargar/rotar desde el panel. Nunca se devuelven por la API. |
| **Ambiente por defecto** | **Homologación** (testing) por emisor, con switch a producción | Probar sin riesgo. Cada emisor tiene su flag `produccion`. |
| **Firma del Ticket de Acceso** | CMS/PKCS#7 con **SHA-256** | Funciona contra ARCA actual (validado). |
| **Notas de Crédito** | Pospuestas (2da etapa) | Primero dejar sólida la emisión de facturas. |
| **Marca CelTuc en el PDF** | Sólo en **A/B** (RI = CelTuc); en **C** (Monotributo) no aparece | El Monotributista es un tercero independiente. La decisión se basa en el **tipo del comprobante** (inmutable), no en el estado actual de la cuenta. |

---

## 3. Arquitectura general

```
Frontend (React/TS, Vite)                Backend (Django + DRF)                 ARCA (SOAP)
┌───────────────────────────┐            ┌──────────────────────────────┐       ┌──────────────┐
│ pages/FacturacionPage.tsx │  REST/JSON │ facturacion/views.py          │       │ WSAA         │
│ services/facturacion.ts   │ ─────────▶ │ facturacion/serializers.py    │       │ (LoginCms)   │
│ documentos/FacturaPdf.tsx │ /api/      │ facturacion/arca/servicio.py  │ ────▶ │ WSFEv1       │
│ (react-pdf → PDF + QR)    │ facturacion│   ├─ arca/wsaa.py  (auth)      │ SOAP  │ (FECAESolic.)│
└───────────────────────────┘            │   └─ arca/wsfev1.py (facturar)│       └──────────────┘
                                         │ facturacion/models.py (4 tablas)│
                                         └──────────────────────────────┘
```

**Flujo resumido:** el front pide emitir → la view valida → `servicio.emitir()` obtiene
el token de WSAA (cacheado), pide el último número a WSFEv1, solicita el CAE, y **solo si
ARCA aprueba** guarda el `Comprobante` con su CAE + arma la URL del QR. El front baja el
detalle (con items + QR como imagen) y puede generar el PDF.

**Stack relevante:**
- Backend: Django 6, DRF, auth JWT propia (`usuarios`), Postgres en prod / SQLite en dev.
- Deps nuevas: `zeep` (SOAP), `cryptography` (firma CMS), `qrcode[pil]` (imagen QR).
- Frontend: React 19, TanStack Query, `@react-pdf/renderer`, Tailwind.

---

## 4. Backend — app `facturacion` archivo por archivo

La app sigue los patrones del proyecto:
- **`ModeloBase`** (`comun/models.py`): da `creado`, `actualizado`, `creado_por`,
  `actualizado_por` y **borrado lógico** (`borrado`, `fecha_borrado`, `borrado_por`).
  Manager `objects` oculta borrados; `todos` los incluye.
- **`AuditoriaMixin`** (`comun/mixins.py`): rellena auditoría en las vistas DRF.
- **Tablas en español** vía `db_table`.

### `models.py` — 4 tablas

**`Emisor`** (tabla `facturacion_emisores`) — una cuenta que factura ante ARCA.
- `nombre` (razón social), `condicion` (`responsable_inscripto` | `monotributista`),
  `cuit` (11 dígitos, validado), `punto_venta` (PositiveInteger, default 1).
- `certificado` (TextField, PEM del `.crt`), `clave_privada` (TextField, PEM del `.key`)
  — **write-only en la API**.
- `produccion` (bool, default `False` = homologación), `activo` (bool).
- Propiedad **`tiene_credenciales`** → `True` si hay cert + clave cargados.
- Hereda `ModeloBase`.

**`TicketAcceso`** (tabla `facturacion_tickets_acceso`) — **cache del TA de WSAA**.
- `models.Model` plano (no `ModeloBase`; es infraestructura).
- `emisor` (FK CASCADE), `servicio` (default `'wsfe'`), `produccion` (bool),
  `token` (Text), `sign` (Text), `generado`, `expiracion`.
- `unique_together (emisor, servicio)`.
- Método **`vigente(margen_segundos=600)`** → `True` si el TA sirve (con margen).
- **Por qué existe:** el TA de WSAA dura ~12 h y ARCA **rechaza** pedir uno nuevo si ya
  hay uno vigente ("El CEE ya posee un TA válido"). Cacheándolo en DB, todos los workers
  de gunicorn lo comparten y no se re-autentica de más.

**`Comprobante`** (tabla `facturacion_comprobantes`) — una factura emitida con su CAE.
- `emisor` (FK PROTECT), `tipo` (`A`|`B`|`C`), `concepto` (1=Productos, 2=Servicios,
  3=ambos; default 1), `punto_venta`, `numero` (el número autorizado por ARCA).
- Cliente: `cliente_nombre`, `cliente_doc_tipo` (`CUIT`|`CUIL`|`DNI`|`CF`),
  `cliente_doc_numero`, `cliente_condicion` (RI | Mono | Consumidor Final | Exento).
- `fecha` (DateField), `vencimiento` (DateField null).
- Importes: `alicuota_iva` (default 21), `neto`, `iva`, `importe_exento`,
  `importe_no_gravado`, `total` (Decimals).
- Resultado ARCA: `cae`, `cae_vencimiento` (DateField), `qr_url` (Text), `respuesta_afip`
  (JSONField, guardamos un dict chico: resultado/cae/vto/obs).
- `estado_cobro` (`pendiente`|`pagada` — interno, NO fiscal), `observaciones`.
- `unique_together (emisor, tipo, punto_venta, numero)`.
- Propiedad **`numero_formateado`** → `0001-00000007` (PV 4 dígitos + número 8 dígitos).
- Hereda `ModeloBase` (el borrado es lógico: oculta de la lista, **no anula en ARCA**;
  para anular se emite Nota de Crédito).

**`ItemComprobante`** (tabla `facturacion_items`) — renglón del comprobante.
- `models.Model` plano. `comprobante` (FK CASCADE related_name `items`), `descripcion`,
  `cantidad` (Decimal), `precio_unitario` (Decimal, **NETO sin IVA**).
- Propiedad `subtotal`.

> **Importante (modelo de IVA):** el `precio_unitario` de los ítems es **NETO**. En A/B se
> agrega IVA al 21% (`alicuota_iva`); en C el IVA es 0 y el total = neto. Es la misma regla
> que el front.

### `logica.py` — reglas fiscales puras (sin tocar ARCA ni la DB)

- **`tipo_comprobante(condicion_emisor, condicion_receptor)`**:
  - Emisor Monotributista → siempre `'C'`.
  - Emisor RI → `'A'` si el receptor es RI, si no `'B'`.
- **`calcular_totales(items, tipo, alicuota_iva)`** → `{neto, iva, total}` (IVA 0 en C),
  redondeo a 2 decimales (`ROUND_HALF_UP`).

> Estas reglas están **espejadas** en el front (`lib/afip.ts`) para que el tipo y los
> totales coincidan de los dos lados.

### `permissions.py`

- **`PuedeFacturar`**: cuenta autenticada que sea `es_administrador` **o** tenga el
  permiso de módulo **`ver_facturacion`** (que ya existía sembrado en `usuarios`).
- **Por qué propio:** a diferencia del resto del sistema, **emitir** (un POST) lo puede
  hacer cualquier facturador (un cajero), no solo un admin. La **gestión de emisores y
  credenciales** sí es solo de administradores (usa `LecturaConPermisoEscrituraAdmin`).

### `serializers.py`

- **`EmisorSerializer`**: `certificado`/`clave_privada` son **write-only**;
  `tiene_credenciales` es read-only. En lectura **nunca** se devuelven las credenciales.
  - `validate_cuit` normaliza (quita guiones) y exige 11 dígitos.
  - `update()`: si llegan cert/clave **vacíos**, no se pisan (permite editar otros campos
    sin reenviar el certificado).
  - **Bug arreglado:** el campo `cuit` autogenerado por ModelSerializer heredaba del modelo
    `max_length=11` + el `RegexValidator`, que corren **antes** de `validate_cuit`. Por eso
    un CUIT con guiones fallaba. Se **declara el campo a mano**: `cuit = CharField(max_length=20)`,
    y la normalización la hace `validate_cuit`.
- **`ItemComprobanteSerializer`**: `cantidad`/`precio_unitario` con `coerce_to_string=False`
  (viajan como número), `subtotal` read-only.
- **`CrearComprobanteSerializer`** (un `Serializer`, no ModelSerializer): entrada para
  emitir — `emisor` (PK), `concepto`, `cliente_*`, `fecha`, `vencimiento`, `alicuota_iva`,
  `observaciones`, `estado_cobro`, `items` (anidado). La emisión real la hace
  `arca.servicio.emitir`, no el serializer.
- **`ComprobanteListSerializer`**: datos resumidos para la lista (incluye `emisor_nombre`,
  `numero_formateado`, `total`, `estado_cobro`, `cae`).
- **`ComprobanteDetailSerializer`**: detalle completo. Agrega `emisor_cuit`,
  `emisor_condicion` (vía `source='emisor.*'`), `items`, `neto`, `iva`, `cae_vencimiento`,
  `qr_url`, y **`qr`** (SerializerMethodField → imagen PNG data-URI generada al vuelo con
  `arca.qr.imagen_data_uri`).
- **`ActualizarComprobanteSerializer`**: lo único editable de un comprobante emitido es
  `estado_cobro` y `observaciones` (es inmutable a nivel fiscal).

### `views.py`

- **`EmisorListCreateView` / `EmisorDetailView`**: `AuditoriaMixin` + `LecturaConPermisoEscrituraAdmin`
  (`permiso_requerido='ver_facturacion'`). Leer = facturadores; escribir = solo admin.
- **`EmisorProbarConexionView`** (`APIView`, `PuedeFacturar`): `POST /emisores/<pk>/probar/`
  → `servicio.probar_conexion(emisor)`.
- **`ComprobanteListCreateView`** (`PuedeFacturar`): `GET` lista (filtros `?emisor=` y
  `?estado=`); `POST` **emite** — valida con `CrearComprobanteSerializer`, llama a
  `servicio.emitir`, captura `ErrorARCA` → HTTP **502** con `{detail}`, y devuelve el
  **detalle** (`ComprobanteDetailSerializer`) con status 201.
- **`ComprobanteDetailView`** (`PuedeFacturar`, `AuditoriaMixin`): `GET` detalle;
  `PATCH` solo `estado_cobro`/`observaciones` (devuelve el detalle completo);
  `DELETE` = borrado lógico.

### `urls.py` (montado en `/api/facturacion/` desde `celtuc/urls.py`)

```
emisores/                  GET (listar) · POST (crear, admin)
emisores/<pk>/             GET · PATCH/PUT (editar, admin) · DELETE (admin)
emisores/<pk>/probar/      POST (probar conexión)
comprobantes/              GET (listar, ?emisor=&estado=) · POST (emitir)
comprobantes/<pk>/         GET (detalle) · PATCH (estado/obs) · DELETE (lógico)
```

### `admin.py`

- `EmisorAdmin` (con borrado lógico + acción restaurar), `ComprobanteAdmin` (campos
  fiscales read-only, inline de ítems), `TicketAccesoAdmin` (solo lectura; se puede borrar
  para forzar re-autenticación). Usan `unfold` (como el resto del admin).

### `management/commands/generar_csr.py`

Comando para generar la **clave privada (`.key`) y el pedido de certificado (`.csr`)** de
un emisor (paso previo a sacar el certificado en ARCA).

```bash
python manage.py generar_csr --cuit 20111111112 --razon-social "Mi Empresa SRL" --alias miempresa
```

- Genera RSA 2048 + CSR firmado SHA-256.
- Subject del CSR (formato que pide ARCA): `C=AR, O=<razón social>, CN=<alias>,
  serialNumber=CUIT <cuit>`.
- Escribe `<alias>.key` y `<alias>.csr`, e imprime los pasos siguientes en ARCA + el CSR
  para copiar/pegar.

### `tests.py`

11 tests **sin red** (lógica pura, mapeo y serializers):
- `tipo_comprobante` y `calcular_totales` (con/sin IVA).
- `_iva_id` (alícuota → Id).
- `_construir_detalle` para A (discrimina IVA), C (sin `Iva`), y servicios (agrega fechas).
- `qr.construir_url` (payload base64).
- `EmisorSerializer`: normaliza CUIT, oculta credenciales, CUIT inválido, y que editar sin
  credenciales no las pisa.

```bash
python manage.py test facturacion   # 11 tests, ~7ms
```

### Cambios en archivos existentes

- `celtuc/settings.py`: `INSTALLED_APPS += 'facturacion'`.
- `celtuc/urls.py`: `path('api/facturacion/', include('facturacion.urls'))`.
- `requirements.txt`: `zeep>=4.3,<5.0`, `cryptography>=43.0`, `qrcode[pil]>=7.4,<9.0`.

---

## 5. La integración con ARCA (`arca/`)

Paquete `facturacion/arca/`. **Las deps pesadas (`zeep`, `cryptography`, `qrcode`) se
importan DENTRO de las funciones**, no al cargar el módulo, para que la app se pueda
importar/migrar/chequear aunque no estén instaladas.

### `constantes.py`

- **Endpoints** (indexados por `produccion` True/False):
  - WSAA: `wsaahomo.afip.gov.ar/ws/services/LoginCms?wsdl` / `wsaa.afip.gov.ar/...`
  - WSFEv1: `wswhomo.afip.gov.ar/wsfev1/service.asmx?WSDL` / `servicios1.afip.gov.ar/...`
- `TIMEOUT = 30`.
- Tablas de códigos (ver §9): `TIPO_CBTE`, `DOC_TIPO`, `COND_IVA_RECEPTOR`, `IVA_ALICUOTA_ID`.

### `errores.py`

- **`ErrorARCA(mensaje, detalle=None)`**: excepción única. Las views la atrapan y devuelven
  502 con mensaje claro. `detalle` lleva observaciones/errores de ARCA.

### `wsaa.py` — autenticación (el corazón delicado)

- **`obtener_ta(emisor) → (token, sign)`**:
  1. Si hay `TicketAcceso` cacheado, **vigente** y del **mismo ambiente**, lo devuelve.
  2. Si no, abre transacción + **`select_for_update()` sobre la fila del emisor** (serializa
     logins concurrentes) → re-chequea cache → `_login` → guarda el TA.
- **`_login(emisor)`**:
  1. `_armar_tra('wsfe')`: XML `loginTicketRequest` con `uniqueId` (timestamp),
     `generationTime` = ahora−10min, `expirationTime` = ahora+10min (ISO con offset, tz local).
  2. `_firmar_cms(tra, cert, key)`: con `cryptography`, carga el cert (`load_pem_x509_certificate`)
     y la clave (`load_pem_private_key`), y firma en **CMS/PKCS#7 DER** con **SHA-256**
     (`pkcs7.PKCS7SignatureBuilder().set_data(...).add_signer(cert, key, SHA256()).sign(DER, [Binary])`),
     y lo pasa a base64.
  3. `zeep` → `cliente.service.loginCms(in0=cms)`.
  4. `_parsear_respuesta`: extrae `credentials/token`, `credentials/sign`, `header/expirationTime`.
- Cliente zeep cacheado con `@lru_cache`.

> **Validado:** la firma SHA-256 **funciona** contra ARCA homologación (no hizo falta SHA-1,
> que usaban implementaciones viejas con openssl).

### `wsfev1.py` — facturación

- **`estado_servidor(produccion)`** → `FEDummy` (App/Db/Auth = OK). No requiere auth.
- **`ultimo_autorizado(produccion, cuit, token, sign, pto, tipo)`** → `FECompUltimoAutorizado`,
  devuelve `CbteNro` (0 si no hay).
- **`solicitar_cae(produccion, cuit, token, sign, pto, tipo, detalle)`**:
  - Arma `FeCAEReq = {FeCabReq{CantReg:1, PtoVta, CbteTipo}, FeDetReq{FECAEDetRequest:[detalle]}}`.
  - `FECAESolicitar`. Parsea `FeDetResp.FECAEDetResponse[0]`: si `Resultado != 'A'` →
    `ErrorARCA` con las observaciones. Devuelve `{cae, cae_vencimiento (aaaammdd), numero, ...}`.
- `_chequear_errores` (mira `r.Errors.Err`), `_texto_observaciones` (mira `resp.Observaciones.Obs`).
- Cliente zeep cacheado por ambiente.

> **Verificado contra el WSDL:** `FECAEDetRequest` incluye `CondicionIVAReceptorId` (obligatorio
> RG 5616) y `Iva` es `ArrayOfAlicIva` → se manda como `{'AlicIva': [{'Id','BaseImp','Importe'}]}`.

### `qr.py`

- **`construir_url(...)`**: arma el JSON de la especificación AFIP (`ver, fecha, cuit, ptoVta,
  tipoCmp, nroCmp, importe, moneda, ctz, tipoDocRec, nroDocRec, tipoCodAut:'E', codAut`),
  lo codifica base64 → `https://www.afip.gob.ar/fe/qr/?p=<base64>`.
- **`imagen_data_uri(url)`**: PNG del QR como `data:image/png;base64,...` (importa `qrcode`
  perezosamente; si falta, devuelve `None` y la factura igual queda emitida).

### `servicio.py` — orquestador

- **`emitir(emisor, datos, usuario=None) → Comprobante`**:
  1. Valida `emisor.activo` y `tiene_credenciales`.
  2. `tipo = tipo_comprobante(emisor.condicion, datos['cliente_condicion'])`.
  3. Si `tipo == 'A'` exige cliente con **CUIT**.
  4. `calcular_totales(...)`.
  5. `with transaction.atomic(): select_for_update()` sobre el emisor (**serializa la
     numeración** ultimo+1 entre pedidos concurrentes).
  6. `wsaa.obtener_ta` → `wsfev1.ultimo_autorizado` → `numero = ultimo + 1`.
  7. `_construir_detalle` (FECAEDetRequest) → `wsfev1.solicitar_cae`.
  8. Parsea `cae_vencimiento`, arma `qr.construir_url`.
  9. **Crea el `Comprobante` + `ItemComprobante`** sólo si ARCA aprobó (CAE presente).
- **`probar_conexion(emisor) → dict`**: `FEDummy` → `obtener_ta` (valida cert/clave) →
  `ultimo_autorizado` (tipo C si Mono, B si RI). Devuelve `{servidor, autenticacion,
  ultimo_numero, ok, mensaje}`.
- **`_construir_detalle(...)`**: arma el dict del WSFEv1 (importes como `float` 2 decimales,
  `CbteFch` `'%Y%m%d'`, `MonId='PES'`, `MonCotiz=1`, `CondicionIVAReceptorId`; si concepto
  2/3 agrega `FchServDesde/Hasta`/`FchVtoPago`; si `tipo != 'C'` agrega `Iva.AlicIva`).
- `_iva_id(alicuota)`: porcentaje → Id de alícuota (21 → 5, default 21).

---

## 6. API REST — endpoints

Base: `/api/facturacion/`. Auth: Bearer JWT (igual que el resto). Permiso `ver_facturacion`
para leer/emitir; gestión de emisores solo admin.

| Método | Ruta | Permiso | Qué hace |
|---|---|---|---|
| GET | `emisores/` | ver_facturacion | Lista emisores (sin credenciales) |
| POST | `emisores/` | admin | Crea emisor (con cert/clave write-only) |
| GET/PATCH/DELETE | `emisores/<id>/` | leer: ver_fact / escribir: admin | Detalle / editar / baja lógica |
| POST | `emisores/<id>/probar/` | ver_facturacion | Prueba conexión y credenciales |
| GET | `comprobantes/?emisor=<id>` | ver_facturacion | Lista comprobantes |
| POST | `comprobantes/` | ver_facturacion | **Emite** (llama a ARCA, devuelve CAE) |
| GET | `comprobantes/<id>/` | ver_facturacion | Detalle (incluye `qr` como data-URI) |
| PATCH | `comprobantes/<id>/` | ver_facturacion | Cambia `estado_cobro` / `observaciones` |
| DELETE | `comprobantes/<id>/` | ver_facturacion | Borrado lógico (no anula en ARCA) |

**Payload de emisión (POST comprobantes/):**
```json
{
  "emisor": 1, "concepto": 1,
  "cliente_nombre": "Juan Perez", "cliente_doc_tipo": "CUIT",
  "cliente_doc_numero": "20111111112", "cliente_condicion": "responsable_inscripto",
  "fecha": "2026-06-27", "vencimiento": "2026-07-12", "alicuota_iva": 21,
  "estado_cobro": "pendiente", "observaciones": "",
  "items": [{ "descripcion": "iPhone 15", "cantidad": 1, "precio_unitario": 1350000 }]
}
```
Si ARCA rechaza/falla → **502** `{ "detail": "..." }`. Si aprueba → **201** con el detalle
(incluye `cae`, `cae_vencimiento`, `numero_formateado`, `qr`).

---

## 7. Frontend archivo por archivo

### `types/index.ts` (agregados)

Tipos del backend real (snake_case, ids numéricos), **conviven** con los tipos mock viejos
(`Cuenta`/`Factura`) que todavía usa el dashboard:
- `Emisor`, `EstadoCobro`, `DocTipo`, `ItemComprobante`, `Comprobante`
  (incluye `emisor_cuit?`, `emisor_condicion?`, `qr?`, `qr_url?`, `items?`).

### `services/facturacion.ts` (reescrito a backend)

`listarEmisores`, `crearEmisor`, `actualizarEmisor`, `eliminarEmisor`, `probarConexion`
(`ResultadoConexion`), `listarComprobantes(emisorId?)`, `obtenerComprobante`,
`emitirComprobante`, `cambiarEstadoCobro`, `eliminarComprobante`. Tipos `EmisorInput`,
`NuevoComprobante`. Usa `api` (fetch + Bearer) y `useAuth.getState().access`.

### `lib/afip.ts` (NO se tocó; se reutiliza)

`CONDICION_LABEL`, `CONDICION_CORTA`, `tipoComprobante`, `condicionesClientePara`,
`calcularTotales`, `IVA_RATE`. Lo usan también `PanelPage` y el dashboard mock, **por eso
quedó intacto**.

### `lib/format.ts` (fix)

**`fecha()`** ahora interpreta `'aaaa-mm-dd'` (DateField del backend) como fecha **local**,
para que no se corra un día por zona horaria. Un timestamp ISO completo va como antes.

### `pages/FacturacionPage.tsx` (reescrito)

Estructura:
- **Selector de emisores** (chips) + **barra de estado** del emisor (ambiente, credenciales
  ✓/✗, CUIT) con botones **"Probar conexión"** y **"Editar"** (admin).
- **Stats** (facturado/cobrado/pendiente/cantidad) y **listado** de comprobantes.
- **`DetalleModal`**: trae el detalle por id (con items + QR + CAE), muestra **CAE +
  vencimiento + QR**, y tiene **"Descargar PDF"**.
- **`NuevaFacturaModal`**: cliente (nombre, condición, tipo doc, número), fechas, ítems
  (incluye picker del inventario mock), preview de totales, y emite. Badge del tipo (A/B/C)
  calculado en vivo.
- **`EmisorModal`** (crear/editar, solo admin): datos fiscales + credenciales (textareas
  PEM, write-only; en edición vacío = no cambiar) + switches producción/activo.
- Helpers: `DOC_LABEL`, `docTiposPara`, `estadoComprobante`, **`formatCuit`**,
  `descargarFacturaPdf` (carga `@react-pdf` y `FacturaPdf` **en diferido**).

**Autoformato de CUIT:** en el número de documento, si es CUIT/CUIL se separa solo
(`20-14343433-6`) con un **botón chico "Auto"** para activar/desactivar. Lo que se envía a
ARCA siguen siendo solo dígitos (el formateo es visual).

### `documentos/FacturaPdf.tsx` (nuevo)

Ver §8.

---

## 8. El PDF de la factura y la regla de marca

- Componente `@react-pdf/renderer` (Helvetica built-in, sin fuentes de red), monocromático,
  estilo ARCA: letra A/B/C, datos del emisor, cliente, tabla de ítems, totales (neto+IVA en
  A/B; solo total en C), y pie con **CAE + vencimiento + QR** (imagen data-URI del backend).
- Se descarga desde el detalle ("Descargar PDF") y desde un ícono en cada fila. `react-pdf`
  se carga **en diferido** (no engorda el bundle principal).

### Regla de marca CelTuc (¡importante y sutil!)

```js
const mostrarMarca = c.tipo !== 'C'   // A/B = RI = CelTuc (con logo); C = Monotributo (sin marca)
const condicionEmisor = c.tipo === 'C' ? 'Monotributista' : 'Responsable Inscripto'
```

- **Se decide por `c.tipo`**, que es **inmutable** (se guarda al emitir), **NO** por la
  condición actual de la cuenta ni por el usuario logueado.
- **Por qué:** una misma cuenta puede cambiar de condición con el tiempo (de hecho en las
  pruebas se flipeó Mono↔RI). Si la marca dependiera del estado actual del emisor, un **PDF
  viejo de Factura C** mostraría el logo de CelTuc si la cuenta hoy figura como RI. Con la
  regla por tipo, los PDFs viejos quedan **siempre correctos**.
- **Supuesto:** todos los RI son CelTuc. Si algún día hay un RI que es un **tercero** (no
  CelTuc), habría que cambiar esto por un **flag por emisor** ("mostrar marca CelTuc").

---

## 9. Reglas fiscales y tablas de códigos

- **Tipo de comprobante** (`TIPO_CBTE`): Factura A=1, B=6, C=11. (Notas de Crédito futuras:
  A=3, B=8, C=13.)
- **Tipo de documento** (`DOC_TIPO`): CUIT=80, CUIL=86, DNI=96, Consumidor Final=99.
- **Condición IVA del receptor** (`COND_IVA_RECEPTOR`, RG 5616, **obligatorio**):
  RI=1, Exento=4, Consumidor Final=5, Monotributo=6.
- **Alícuotas de IVA** (`IVA_ALICUOTA_ID`): 0%=3, 10.5%=4, **21%=5**, 27%=6, 5%=8, 2.5%=9.
- **Quién emite qué:** Monotributo → solo **C** (sin IVA). RI → **A** (a RI, IVA
  discriminado) o **B** (a consumidor final / monotributo / exento).
- **Factura A** requiere cliente con **CUIT**.

---

## 10. Flujo de emisión end-to-end

1. **Front** (`NuevaFacturaModal`) arma el payload y `POST /api/facturacion/comprobantes/`.
2. **`ComprobanteListCreateView.create`** valida con `CrearComprobanteSerializer`.
3. **`servicio.emitir`**:
   a. valida emisor (activo + credenciales) y reglas (A requiere CUIT);
   b. calcula totales; abre transacción + lock del emisor;
   c. `wsaa.obtener_ta` (cacheado) → token+sign;
   d. `wsfev1.ultimo_autorizado` → `numero = ultimo + 1`;
   e. `_construir_detalle` → `wsfev1.solicitar_cae` → CAE;
   f. arma QR URL; **crea** `Comprobante` + ítems.
4. La view responde **201** con el `ComprobanteDetailSerializer` (incluye `qr` como imagen).
5. El front muestra toast con el CAE y abre el detalle. Desde ahí se **descarga el PDF**.

Errores: cualquier `ErrorARCA` (credenciales, red, rechazo) → **502** `{detail}` → toast.

---

## 11. Certificados ARCA: cómo se obtienen (homologación y producción)

ARCA **no** genera la clave; uno genera **clave + CSR** localmente, sube el CSR y ARCA
devuelve el certificado.

### Homologación (testing) — lo que se hizo y funciona

1. **Generar key + CSR**: `python manage.py generar_csr --cuit <CUIT> --razon-social "<nombre>" --alias <alias>`.
2. Entrar a **WSASS homologación** (con Clave Fiscal): `https://wsass-homo.afip.gob.ar/wsass/portal/main.aspx`.
3. **"Nuevo Certificado" → "Crear DN y certificado"**:
   - **Nombre simbólico del DN** = alias (¡**solo letras/números, sin guiones**!).
   - **CUIT** viene fijo (el del usuario logueado; homologación usa tu CUIT real).
   - **Solicitud (PKCS#10)** = pegar el contenido del `.csr`.
   - "Crear DN y obtener certificado" → en **"Resultado"** aparece el `.crt` → copiarlo.
4. **"Crear autorización a servicio"**: DN = alias, CUIT representado = tu CUIT,
   **Servicio = `wsfe` (Facturación Electrónica)**.
5. En el panel CelTuc → **Nueva cuenta**: pegar `.crt` + `.key`, dejar **Homologación**,
   guardar y **"Probar conexión"**.

> **Ojo (aprendido):** WSASS **sobrescribe el CN** del certificado con el "Nombre simbólico
> del DN" (alias). Da igual: la **clave privada generada sigue siendo la pareja del cert**
> (ARCA respeta la public key del CSR). El `.key` se nombra según el `--alias` que pasaste al
> comando (puede no coincidir con el CN final del cert).

### Producción (pendiente de hacer) — diferencias

- Cada emisor usa **su** Clave Fiscal y la sección **"Administración de Certificados
  Digitales"** (NO el WSASS de homologación).
- El certificado se asocia al WS **wsfe** y se crea el **punto de venta** tipo "Facturación
  Electrónica – Web Services".
- La condición fiscal del emisor debe ser la **real** (producción la valida: Mono solo C; RI
  A/B).
- En el panel: cargar `.crt` + `.key`, prender **Producción**.
- El **servidor de producción debe poder salir a `afip.gov.ar`**.

---

## 12. Qué datos necesita cada emisor

Para dar de alta una cuenta que factura:
1. **Nombre / razón social**
2. **Condición**: Responsable Inscripto o Monotributista
3. **CUIT** (11 dígitos)
4. **Punto de venta** habilitado para Web Services en ARCA
5. **Certificado** (`.crt`/`.pem`) con el WS `wsfe` autorizado para ese CUIT
6. **Clave privada** (`.key`) del certificado
7. Interruptor **homologación / producción**

---

## 13. Cómo probar / validar

- **Backend tests:** `python manage.py test facturacion` (11 tests, sin red).
- **Probar conexión real:** botón "Probar conexión" en el panel, o
  `servicio.probar_conexion(emisor)` desde el shell.
- **Lo validado (homologación, 27/06/2026):** se obtuvieron **CAE reales de prueba**:
  - Factura **C** (Monotributo) → CAE OK.
  - Factura **A** (RI → RI) → CAE OK, **IVA discriminado correcto** (Neto + 21% + Total).
  - Factura **B** → mismo camino que A (emisor RI + cliente Consumidor Final).
  - El PDF renderiza bien (incluido el QR) y respeta la regla de marca por tipo.
- **Emisor de homologación cargado** en la `db.sqlite3` local (id 1, CUIT 20432029876).

---

## 14. Gotchas y lecciones aprendidas

1. **Firma SHA-256 funciona** con ARCA (no hace falta SHA-1). Si alguna vez fallara la
   autenticación, el primer lugar a revisar es `arca/wsaa.py::_firmar_cms`.
2. **Cache del TA en DB es necesario**: ARCA rechaza pedir un TA nuevo si ya hay uno vigente
   ("El CEE ya posee un TA válido"). Por eso `TicketAcceso`.
3. **Un certificado por emisor.** Si dos `Emisor` comparten el mismo cert/CUIT, el segundo
   falla al autenticar mientras el TA del primero siga vigente (12 h). Para "una cuenta RI y
   una Mono de prueba" con el mismo cert, **mejor editar la condición de una sola cuenta**,
   no crear dos.
4. **Desfase de fechas:** los `DateField` llegan como `aaaa-mm-dd`; `new Date('aaaa-mm-dd')`
   se interpreta UTC y restaba un día en AR. Arreglado en `lib/format.ts::fecha`.
5. **Campo `cuit` del serializer:** los validadores del modelo corren antes del
   `validate_cuit`; hubo que declarar el campo a mano (`CharField(max_length=20)`) para
   aceptar guiones y normalizar.
6. **Homologación es permisiva:** no valida tu condición fiscal real ni el padrón del
   receptor. Por eso se pudo simular A/B/C con un CUIL persona física.
7. **WSASS "Nombre simbólico del DN":** solo letras y números (sin guiones). Y sobrescribe
   el CN del certificado.
8. **Marca por tipo, no por estado actual** (ver §8): clave para que los PDFs viejos no
   muestren CelTuc en una Factura C.
9. **`@react-pdf/renderer` se carga en diferido** desde el front para no engordar el bundle.
   (Nota para tests en Node: no se puede bundlear su build de Node como ESM —`js-md5` hace
   `require('crypto')`—; hay que dejarlo `external`.)
10. **El dashboard sigue mock:** `PanelPage`/`services/dashboard.ts`/`lib/db.ts` leen de
    `localStorage` y **no** reflejan la facturación real todavía.

---

## 15. Pendientes / próximos pasos

- [ ] **Puesta en producción** por emisor (certificados reales, condición real, punto de
      venta WS, flag `produccion`).
- [ ] **Notas de Crédito** (anular/devolver): tipos A=3/B=8/C=13, con `CbtesAsoc`
      (comprobante asociado). Es la 2da etapa acordada.
- [ ] **Snapshot de identidad del emisor** en el `Comprobante` (nombre/CUIT al momento de
      emitir), para inmutabilidad total si se renombra una cuenta. Hoy `emisor_nombre` /
      `emisor_cuit` se leen en vivo del FK (en el caso actual no cambian).
- [ ] **Campos formales del emisor** para un PDF "completo": domicilio comercial, Ingresos
      Brutos, inicio de actividades (requiere campos nuevos en `Emisor` + form + PDF).
- [ ] **Migrar el dashboard** a datos reales (hoy es mock).
- [ ] **Opción B (delegación):** un solo certificado para varios CUITs. Requiere: separar
      "CUIT dueño del cert" del "CUIT que factura" (`Auth.Cuit` = representado) y **cachear
      el TA por certificado**, no por emisor.
- [ ] (Opcional) **Flag por emisor "mostrar marca CelTuc"** si aparece un RI tercero.

---

## 16. Mapa de archivos

**Backend (nuevos):**
```
backend/facturacion/
  __init__.py  apps.py  models.py  logica.py  permissions.py
  serializers.py  views.py  urls.py  admin.py  tests.py
  arca/  __init__.py  constantes.py  errores.py  wsaa.py  wsfev1.py  qr.py  servicio.py
  management/commands/generar_csr.py
  migrations/0001_initial.py
```
**Backend (modificados):** `celtuc/settings.py`, `celtuc/urls.py`, `requirements.txt`.

**Frontend (nuevo):** `frontend/src/documentos/FacturaPdf.tsx`.
**Frontend (modificados):** `frontend/src/types/index.ts`,
`frontend/src/services/facturacion.ts`, `frontend/src/pages/FacturacionPage.tsx`,
`frontend/src/lib/format.ts`.

**Memoria asociada:** `~/.claude/.../memory/facturacion-arca.md` (apunta a este doc).

---

> **Regla de oro para el futuro:** todo lo fiscal es **inmutable** una vez emitido (el CAE es
> la autorización de ARCA). No edites comprobantes; para corregir, se emite una Nota de
> Crédito. Y el comprobante debe representar **al emisor**, no a CelTuc (salvo que el emisor
> sea CelTuc, es decir, RI → A/B).
