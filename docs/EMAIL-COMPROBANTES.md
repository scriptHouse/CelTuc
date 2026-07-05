# Envío de comprobantes por email

> Documentación de la funcionalidad "Enviar factura por email". Está **aislada y es
> aditiva**: no afecta la emisión, el CAE, el PDF ni los permisos. Si el SMTP no está
> configurado, queda deshabilitada y el endpoint lo informa; nada más depende de esto.
>
> Doc general de facturación: `docs/FACTURACION.md`.

---

## 1. Idea general (por qué así)

El **PDF de la factura lo genera el frontend** (`FacturaPdf.tsx` con `@react-pdf/renderer`),
no el backend. Para no reimplementar el PDF en Python (riesgo + duplicación), el envío por
email reusa **ese mismo PDF**:

```
Frontend                                   Backend                         SMTP
─────────                                  ────────                        ─────
genera el PDF (mismo que "Descargar")      recibe el PDF (base64)          adjunta
  → lo pasa a base64                POST   → lo decodifica                 y envía
  → POST /comprobantes/<id>/enviar-email/  → EmailMessage + attach  ────►  (Django
     { email, pdf_base64, mensaje? }       → correo.send()                  core.mail)
```

**Decisiones:**
- El front manda el PDF ya armado → el backend **no** sabe nada de la estructura del PDF.
- Va en **base64 dentro de JSON** (los PDFs son chicos, ~5–10 KB): simple y consistente
  con el `api` client existente (JSON + Bearer). No hace falta multipart.
- El SMTP se configura por **variables de entorno** (secretos en el `.env` del server).

---

## 2. Backend

### `celtuc/settings.py` — bloque "Email (SMTP)"
Config estándar de Django, leída de variables de entorno con defaults seguros:
`EMAIL_BACKEND` (smtp), `EMAIL_HOST`, `EMAIL_PORT` (587), `EMAIL_HOST_USER`,
`EMAIL_HOST_PASSWORD`, `EMAIL_USE_TLS` (True), `EMAIL_USE_SSL` (False), `EMAIL_TIMEOUT`,
`DEFAULT_FROM_EMAIL`.

- **Si `EMAIL_HOST` está vacío**, el envío se considera *no configurado* (ver helper).
- Nada más del sistema usa email, así que agregar esto no cambia ningún comportamiento.

### `facturacion/email.py` — el helper aislado
- `EmailNoConfigurado(Exception)`: se lanza si `settings.EMAIL_HOST` está vacío.
- `enviar_comprobante(comprobante, email_destino, pdf_bytes, mensaje=None)`:
  - Si no hay `EMAIL_HOST` → `EmailNoConfigurado`.
  - Arma asunto (`Factura {tipo} N° {numero_formateado} - {emisor}`) y cuerpo (con total y CAE).
  - `EmailMessage(...).attach('factura-<tipo>-<nro>.pdf', pdf_bytes, 'application/pdf')` → `.send()`.

### `facturacion/serializers.py` — `EnviarEmailSerializer`
Entrada del endpoint: `email` (EmailField), `pdf_base64` (CharField), `mensaje` (opcional).

### `facturacion/views.py` — `EnviarComprobanteEmailView`
- `POST /api/facturacion/comprobantes/<pk>/enviar-email/`, permiso **`PuedeFacturar`**
  (cualquier facturador puede enviar, igual que emitir).
- Flujo: busca el `Comprobante` → valida la entrada → decodifica el base64 (tolera un data URL
  `data:...;base64,XXXX`) → `enviar_comprobante(...)`.
- **Errores** (nunca un 500 opaco):
  - PDF base64 inválido → **400**.
  - `EmailNoConfigurado` → **503** con mensaje claro.
  - Cualquier otra (SMTP caído, credenciales mal, timeout) → **502** con el detalle, y se loguea
    (`logger.exception`).
- Éxito → `{ "detail": "Factura enviada a <email>." }`.

### `facturacion/urls.py`
`path('comprobantes/<int:pk>/enviar-email/', EnviarComprobanteEmailView.as_view(), name='comprobante-email')`.

---

## 3. Frontend

### `services/facturacion.ts`
`enviarComprobanteEmail(id, email, pdfBase64, mensaje?)` → `POST .../enviar-email/` con
`{ email, pdf_base64, mensaje }` y el token.

### `pages/FacturacionPage.tsx`
- **`generarFacturaPdfBlob(c)`**: carga `@react-pdf` en diferido y devuelve el `Blob` del PDF.
  (Se extrajo de `descargarFacturaPdf`, que ahora lo reutiliza — la descarga sigue igual.)
- **`blobABase64(blob)`**: `FileReader.readAsDataURL` → devuelve el base64 **sin** el prefijo
  `data:...;base64,`.
- **`DetalleModal`**: agrega estado `email` / `enviando` y `enviarEmail()`:
  genera el Blob → base64 → `enviarComprobanteEmail(...)` → toast. En el footer del modal hay un
  **input de email + botón "Enviar"** (además del "Descargar PDF" existente).

> El PDF que se envía es **idéntico** al que se descarga (mismo componente `FacturaPdf`).

---

## 4. Configuración (para que funcione en producción)

Las credenciales SMTP viven en el `.env` del server (`/var/www/celtuc/.env`, gitignored). Ejemplo:
```
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_HOST_USER=elcorreo@dominio.com
EMAIL_HOST_PASSWORD=clave-de-aplicacion
EMAIL_USE_TLS=True
EMAIL_USE_SSL=False
DEFAULT_FROM_EMAIL=elcorreo@dominio.com
```
- **Gmail:** la contraseña debe ser una **"Contraseña de aplicación"** (requiere 2FA), no la normal.
- Después de tocar el `.env`, hay que **reiniciar/redesplegar** el contenedor para que lo lea.
- Documentado también en `backend/.env.example`.

---

## 5. Tests (`facturacion/tests.py` → `EnviarEmailTests`)

Con `@override_settings(EMAIL_BACKEND='...locmem...')` (email en memoria, sin SMTP real):
- `test_envia_con_adjunto`: POST con un PDF base64 → 200, `mail.outbox` tiene 1 correo con
  el destinatario y 1 adjunto.
- `test_sin_smtp_configurado_avisa`: con `EMAIL_HOST=''` → **503**.

---

## 6. Gotchas / cómo extender

- **Tamaño del PDF:** hoy va base64 en JSON (PDFs chicos). Si algún día los PDF crecen mucho,
  pasar a multipart/form-data o generar el PDF en el backend.
- **No se guarda** a quién se envió ni cuándo. Si se quiere historial, agregar campos/modelo
  (ej. `Comprobante.enviado_a`, `enviado_en`) — no está por ahora.
- **Rate/abuso:** el endpoint usa el throttle global de DRF; si se quiere limitar el envío,
  agregar un scope propio.
- **Remitente:** hoy es `DEFAULT_FROM_EMAIL` (una casilla). Si se quiere enviar "en nombre de
  cada emisor", habría que guardar un email por emisor y setear el `from_email` del `EmailMessage`
  (ojo con SPF/DKIM del dominio real).
- **Seguridad:** las credenciales SMTP NUNCA en el repo (van al `.env` del server). El PDF viaja
  del front al back autenticado con Bearer.
