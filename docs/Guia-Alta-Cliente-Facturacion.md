# Guía: dar de alta un cliente para facturar con CelTuc

**Playbook operativo — incluye el caso de migración desde otra app que debe dejar de funcionar.**

> Hay **dos escenarios**:
> - **Caso A** — Cliente nuevo (no facturaba por Web Service todavía).
> - **Caso B** — Cliente que **ya usaba otra app** (Web Services) y hay que migrarlo y **desactivar la app anterior**.
>
> Reparto de tareas: lo que dice **(ARCA)** lo hace **la persona con SU Clave Fiscal** (nivel 3); lo que dice **(CelTuc)** lo hacés vos/el administrador.

---

## 0. Antes de empezar — qué pedirle al cliente

- **CUIT**
- **Razón social / nombre**
- **Condición fiscal real**: Monotributista o Responsable Inscripto
- **Clave Fiscal (nivel 3)** a mano (presencial, o que te delegue los servicios)

> ⚠️ Un certificado de **homologación NO sirve en producción**. Para clientes reales se usa siempre **producción**.

---

## 1. Los 3 archivos (no confundirlos NUNCA)

| Archivo | Empieza con | ¿Se sube a ARCA? | ¿Va al panel CelTuc? |
|---|---|---|---|
| **`.csr`** | `-----BEGIN CERTIFICATE REQUEST-----` | ✅ (campo PKCS#10) | ❌ |
| **`.crt`** | `-----BEGIN CERTIFICATE-----` (sin "REQUEST") | — (lo devuelve ARCA) | ✅ Certificado |
| **`.key`** | `-----BEGIN RSA PRIVATE KEY-----` | ❌ **nunca** | ✅ Clave privada |

> El error más común: pegar el **`.csr`** en el campo "Certificado". Ahí va el **`.crt`**.

---

## 2. CASO A — Cliente nuevo (paso a paso)

### 2.1 — Generar clave + pedido (CelTuc / técnico)
```
python manage.py generar_csr --cuit <CUIT> --razon-social "<Nombre>" --alias <alias>
```
- `alias`: solo letras/números, sin guiones ni espacios (ej. `juanperez`).
- Genera `<alias>.key` (privada, guardar segura) y `<alias>.csr` (para subir a ARCA).

### 2.2 — Crear el certificado de producción (ARCA)
1. Entrar a ARCA con la Clave Fiscal del cliente → **"Administración de Certificados Digitales"**.
2. **Alias:** poné el nombre simbólico. **CUIT:** ya viene fijo.
3. **Seleccionar archivo:** subir el **`.csr`**.
4. **"Agregar alias"** → ARCA devuelve el **`.crt`** → **descargarlo**.

### 2.3 — Autorizar el web service de facturación (ARCA)
1. **"Administrador de Relaciones de Clave Fiscal"** → **"Nueva Relación"**.
2. En **Representante** → **Buscar** → elegir el **Computador Fiscal** (el alias del certificado).
3. En **Servicio** → **Buscar** → **ARCA** → **"Facturación Electrónica"** *(NO "de Exportación", NO "Facturador")*.
4. **Confirmar**.

> Truco: si elegís primero el **Representante** (el computador fiscal), al buscar el servicio ARCA te filtra los web services y aparece "Facturación Electrónica".

### 2.4 — Crear el Punto de Venta Web Services (ARCA)
1. Buscador de ARCA → **"Administración de puntos de venta y domicilios"** → seleccionar CUIT.
2. **"ABM Puntos de Venta"** → **"Agregar"**.
3. **Número:** el siguiente libre (ej. 3). **Sistema:** **"Factura Electrónica – Monotributo – Web Services"** (o, si es RI, "RECE – Web Service"). **Domicilio:** el comercial.
4. **Aceptar** y **anotar el número de PV**.

> ⚠️ Tiene que ser un PV **nuevo y de Web Services** (NO "Factuweb/Imprenta" ni "Factura en Línea").

### 2.5 — Cargar la cuenta en CelTuc (CelTuc)
**Facturación → Nueva cuenta:**
- Condición real · **CUIT** · **Punto de venta** (el del paso 2.4)
- **Certificado** = contenido del `.crt` · **Clave privada** = contenido del `.key`
- **Producción: ON** → **Guardar**

### 2.6 — Probar y emitir (CelTuc)
1. **"Probar conexión"** → debe dar **OK**.
2. **Nueva factura** → cargar ítems → **Emitir** → verificar **CAE + QR** y **descargar el PDF**.

---

## 3. CASO B — Cliente que YA usaba otra app (migración)

**Concepto clave:** cada **punto de venta** tiene su **numeración independiente**. Lo recomendado al migrar es **darle a CelTuc un punto de venta NUEVO de Web Service** (arranca en 1) y dejar el de la app anterior aparte. Es legal y limpio.

### 3.1 — Dar de alta al cliente en CelTuc
Igual que el **Caso A** (pasos 2.1 a 2.6), con una aclaración:
- CelTuc usa **su PROPIO certificado nuevo** (el que generás con `generar_csr`) — **no** reutiliza el certificado de la app vieja.
- CelTuc usa un **punto de venta NUEVO** de Web Service — **no** reutiliza el PV de la app vieja.

### 3.2 — Desactivar la app anterior (para que "no funcione más")

**Si la app anterior usaba Web Services (su propio certificado + punto de venta):**
- ✅ **Recomendado — dar de baja su punto de venta:** ARCA → "Administración de puntos de venta y domicilios" → ABM → seleccionar el **PV viejo** → **"Baja"**. Así **ninguna app puede emitir más en ese PV** (la historia se conserva).
- ✅ **Y/o cortar su acceso al web service** (más contundente): ARCA → "Administrador de Relaciones" → **eliminar la relación** del servicio "Facturación Electrónica" con el **computador fiscal viejo**; o **revocar el certificado viejo** en "Administración de Certificados Digitales". Sin certificado/relación válidos, la app vieja **no puede autenticar**.

**Si la app anterior era el portal de AFIP ("Factura en Línea" / "Comprobantes en Línea"):**
- No se "desactiva" (es de AFIP, siempre está disponible). Simplemente el cliente **deja de usarlo** y factura por CelTuc. Igual conviene usar un **PV nuevo** para CelTuc para no mezclar.

### 3.3 — Reglas de oro de la migración
- ⚠️ **No usar el MISMO punto de venta en dos apps a la vez** → los números chocan y ARCA rechaza. Por eso CelTuc usa un PV propio.
- ⚠️ **No "continuar" la numeración del PV viejo en el PV nuevo.** Cada PV lleva su propia secuencia **desde 1**. Es lo correcto.
- ✅ Las facturas viejas (del PV anterior) **siguen siendo válidas**; no se tocan.

---

## 4. Verificar que la factura quedó bien

- El **CAE** es la prueba: ARCA lo otorga **en el momento** de emitir. Si CelTuc te muestra un CAE, la factura **está autorizada y registrada**.
- ⚠️ **"Mis Comprobantes" tiene DEMORA** (no es en tiempo real): puede tardar **horas** en mostrar una factura recién emitida. **No te asustes** si no aparece enseguida — eso no significa que falló.
- **Para confirmar AL INSTANTE:** ARCA → **"Constatación de Comprobantes"** → cargás Tipo, Punto de Venta, Número, CAE, Importe y Fecha → te dice **"Aprobado"**. (O escaneás el **QR del PDF**, que va a la verificación oficial de AFIP.)
- El comprobante que se le da al cliente es el **PDF de CelTuc** (con CAE y QR).

---

## 5. Uso diario (ya con el cliente dado de alta)

1. **Facturación** → elegir la **cuenta** del cliente.
2. **Nueva factura** → cargar ítems (o traer del inventario) → elegir condición del cliente.
3. **Emitir** → se obtiene el CAE.
4. **Descargar PDF** y entregárselo al cliente.
5. *(Opcional)* marcar **"cobrada"** cuando pague — es control interno, no afecta a ARCA.

---

## 6. Problemas frecuentes y solución

| Mensaje / síntoma | Qué pasó | Solución |
|---|---|---|
| **"El emisor no tiene certificado y/o clave privada cargados"** | La cuenta se creó sin credenciales | Editar la cuenta → pegar `.crt` y `.key` → Guardar |
| **"El certificado o la clave no son válidos (formato PEM)"** | Pegaste el `.csr` en "Certificado" | En "Certificado" va el **`.crt`** (empieza con `BEGIN CERTIFICATE`, sin "REQUEST") |
| **"11002: El punto de venta no se encuentra habilitado en el presente WS"** | El PV del panel no es el de Web Services | Poné en CelTuc el **número del PV "Web Services"** (Caso A, paso 2.4) |
| **Error de TLS / "DH_KEY_TOO_SMALL"** | TLS viejo de los servidores de ARCA | Ya está resuelto en CelTuc (SECLEVEL=1). Si reaparece, es del servidor de CelTuc |
| **"Tengo el CAE pero no aparece en Mis Comprobantes"** | Demora de ese listado (no es tiempo real) | La factura es válida igual; verificá con **Constatación de Comprobantes** |
| **La factura salió fechada "mañana"** | Tomaba la fecha en UTC | Ya corregido: CelTuc usa la **fecha de Argentina** |

---

## 7. Checklist por cliente

- [ ] Datos del cliente (CUIT, razón social, condición) + Clave Fiscal a mano
- [ ] Generar `.key` + `.csr` (`generar_csr`)
- [ ] ARCA: crear certificado de producción (subir `.csr`, bajar `.crt`)
- [ ] ARCA: autorizar el web service **"Facturación Electrónica"** al computador fiscal
- [ ] ARCA: crear el **punto de venta Web Services** (anotar el número)
- [ ] **(Migración)** Desactivar la app anterior: baja del PV viejo y/o revocar su certificado
- [ ] CelTuc: crear la cuenta (condición real, CUIT, PV, `.crt` + `.key`, **Producción ON**)
- [ ] CelTuc: **"Probar conexión"** → OK
- [ ] CelTuc: emitir la primera factura y verificar **CAE + QR + PDF**

---

*Quién hace qué:* los pasos en **ARCA** los hace la persona con su Clave Fiscal; los pasos **técnicos** (generar el CSR, cargar la cuenta) los hace CelTuc / el administrador.
