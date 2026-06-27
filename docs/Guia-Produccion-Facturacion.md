# Guía de puesta en producción — Facturación electrónica (ARCA)

**CelTuc · Cómo dar de alta emisores reales, paso a paso**

> Modelo: **cada emisor con su propio certificado** (cada Monotributista/RI factura
> como sí mismo). Esta guía es operativa: seguila en orden por cada persona.
>
> ⚠️ Un certificado de **homologación NO sirve en producción**. Cada emisor necesita
> sacar su certificado **de producción**.

---

## Parte 0 — Preparar el servidor (una sola vez)

1. **Redeployar** la app en el servidor. Esto instala las dependencias nuevas
   (`zeep`, `cryptography`, `qrcode`) y **aplica las migraciones solo** (el arranque
   corre `migrate` automáticamente).
2. Verificar que el servidor **pueda salir a internet hacia `afip.gov.ar`** (los Web
   Services de ARCA). Sin eso, no se puede facturar.
3. HTTPS, `SECRET_KEY` y `DEBUG=False` ya están configurados en producción.

---

## Parte 1 — Trámite en ARCA, por CADA emisor

Esto lo hace **la persona dueña del CUIT, con SU Clave Fiscal** (nivel 3). No se puede
hacer por ella sin su login. Pueden hacerlo juntos en pantalla.

### 1.1 — Generar la clave privada + el pedido (CSR)
*(Paso técnico: lo corre CelTuc, con los datos reales de la persona.)*

```
python manage.py generar_csr --cuit <CUIT_real> --razon-social "<Razón social real>" --alias <alias>
```

Genera dos archivos:
- **`<alias>.key`** → la clave privada. **Guardarla segura. NUNCA se sube a ARCA.**
- **`<alias>.csr`** → el pedido de certificado (público).

### 1.2 — Crear el certificado de PRODUCCIÓN (la persona, en ARCA)
- Entrar a ARCA con Clave Fiscal → adherir/abrir **"Administración de Certificados
  Digitales"**.
- Crear un alias/DN y **subir el `.csr`** → **descargar el certificado `.crt`**.

### 1.3 — Autorizar el Web Service de facturación (la persona)
- Ir a **"Administrador de Relaciones de Clave Fiscal" → Nueva relación**.
- Buscar el servicio **"Facturación Electrónica" (WSFE)** y asignárselo al
  **certificado** recién creado.
- *Sin este paso, ARCA autentica pero rechaza facturar.*

### 1.4 — Crear el Punto de Venta para Web Services (la persona)
- Servicio **"Administración de puntos de venta y domicilios" → ABM → Alta**.
- Tipo **"Web Services"** (Factura Electrónica – Web Service / RECE, según la condición).
- ⚠️ Debe ser un **punto de venta NUEVO y distinto** del que usan en "Comprobantes en
  línea" / facturador web. **Anotar el número de punto de venta.**

### 1.5 — Entregar a CelTuc
- El **`.crt`**, el **`.key`**, el **CUIT**, el **número de punto de venta** y la
  **condición fiscal real** (Responsable Inscripto o Monotributo).

---

## Parte 2 — Cargar el emisor en CelTuc (administrador)

En el panel → **Facturación → Nueva cuenta**:
- **Nombre / razón social**.
- **Condición fiscal REAL** (la que tiene en ARCA).
- **CUIT** y **Punto de venta** (el del paso 1.4).
- Pegar **Certificado** (`.crt`) y **Clave privada** (`.key`).
- Prender **Producción**. Guardar.

---

## Parte 3 — Validar y emitir la primera factura real

1. **"Probar conexión"** → debe dar **OK** y el último número (en un emisor nuevo, 0).
2. Emitir **una** factura real de prueba (¡ya tiene valor fiscal!) con un monto chico.
3. Verificar **CAE + vencimiento + QR** y **descargar el PDF**.
4. Listo: ese emisor ya factura en producción. Repetir Parte 1–3 por cada persona.

---

## Parte 4 — Seguridad y operación (no saltear)

- 🔐 **Claves privadas:** hoy se guardan como texto en la base (nunca se exponen por la
  API, pero están en la DB). Para producción se recomienda **cifrarlas en reposo**
  (mejora pendiente, fácil de agregar).
- 💾 **Backups de la base:** ahí viven los certificados y todos los comprobantes con su CAE.
- 🗓️ **Renovación:** los certificados vencen (~2 años). Al vencer, repetir Parte 1 y
  actualizar la cuenta (Editar → pegar el nuevo `.crt`).
- 🧾 **Un certificado por emisor.** No compartir un certificado entre dos cuentas (ARCA da
  un solo token por certificado cada 12 h y la segunda fallaría).
- ❌ **Anular:** el borrado en el panel es lógico (oculta), **no anula en ARCA**. Para
  anular hace falta una **Nota de Crédito** (pendiente de implementar).

---

## Parte 5 — Diferencias homologación vs producción

| | Homologación (prueba) | Producción (real) |
|---|---|---|
| Dónde se saca el certificado | Portal WSASS (`wsass-homo...`) | "Administración de Certificados Digitales" |
| El CAE | De prueba, sin valor | **Real, con valor fiscal** |
| Condición fiscal | No se valida | **Se valida** (Mono→C, RI→A/B) |
| Flag "Producción" en la cuenta | Apagado | **Encendido** |

---

## Los 3 archivos (no confundirlos)

| Archivo | ¿Se sube a ARCA? | ¿Va al panel CelTuc? | Qué es |
|---|---|---|---|
| `.csr` | ✅ (campo PKCS#10) | ❌ | Pedido de certificado (público) |
| `.crt` | — (lo devuelve ARCA) | ✅ Certificado | Certificado firmado (público) |
| `.key` | ❌ **nunca** | ✅ Clave privada | La clave secreta (privada) |

---

## Checklist por emisor

- [ ] Generar `.key` + `.csr` (`generar_csr` con CUIT y razón social reales)
- [ ] ARCA: crear certificado de producción (subir `.csr`, bajar `.crt`)
- [ ] ARCA: autorizar el web service **WSFE** al certificado
- [ ] ARCA: crear el **punto de venta** Web Services (anotar el número)
- [ ] CelTuc: crear la cuenta con condición real, CUIT, PV, `.crt` + `.key`, **Producción ON**
- [ ] CelTuc: **"Probar conexión"** → OK
- [ ] CelTuc: emitir la primera factura real y verificar CAE + QR + PDF

---

*Quién hace qué:* los pasos en **ARCA** los hace la persona con su Clave Fiscal; los pasos
**técnicos** (generar el CSR, cargar la cuenta) los hace CelTuc/administrador.
