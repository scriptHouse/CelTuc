# Envío de documentos por WhatsApp y email

> Botón «Enviar» del módulo Documentos (`/documentos`): manda al cliente el
> papel que se acaba de generar, o cualquiera del Historial. Es **aditivo y
> aislado**: no toca la generación del PDF/Excel/ticket, ni el archivado, ni el
> cupón correlativo, ni los permisos. Si el SMTP no está configurado, el email
> queda deshabilitado con un aviso claro y el WhatsApp sigue funcionando igual.
>
> Docs relacionadas: `docs/WHATSAPP-COMPROBANTES.md`, `docs/EMAIL-COMPROBANTES.md`
> (los equivalentes de Facturación, de donde sale el patrón).

---

## 1. Idea general

Dos canales, **un solo mensaje** (plantilla global editable con el lápiz):

```
                     ┌─ WhatsApp: link wa.me con el texto ya escrito.
Botón «Enviar» ──────┤            El archivo se adjunta a mano en el chat
  (modal)            │            (el modal ofrece «Descargar para adjuntar»).
                     └─ Email:    POST al backend → adjunta el archivo GUARDADO
                                  y lo manda por SMTP.
```

La diferencia con Facturación: allá el PDF lo arma el front y viaja en base64
porque el backend no lo tiene. Acá el archivo **ya está en el servidor**
(`DocumentoGenerado.archivo`, lo sube el módulo al exportar), así que el correo
adjunta exactamente el mismo archivo que se descargó y se entregó en el
mostrador — no se vuelve a generar nada.

## 2. De dónde salen el teléfono y el mail

Se precargan solos, en este orden (y siempre quedan editables):

1. **Del documento**: cada plantilla declara en `documentos/registry.tsx` qué
   campo del formulario es el teléfono y cuál el mail (`camposCliente`). El
   historial guarda el formulario completo en `datos`, así que el modal lee de
   ahí (`contactoDelDocumento`).
2. **De la base de clientes**: si el papel no pedía contacto (una compraventa
   lleva DNI, no teléfono), se busca al cliente por su documento —o por su
   nombre si no tiene— con `GET /api/documentos/clientes/`. Nunca pisa lo que ya
   esté escrito.

`moduloDe(tipo)` incluye módulos que ya no aparecen en el selector (Recepción):
el historial guarda documentos de tipos que después se ocultaron.

## 3. Frontend

- **`lib/mensajeDocumento.ts`**: plantilla con variables `{cliente}`,
  `{documento}`, `{numero}`, `{fecha}`, `{detalle}`, `{total}`, `{sucursal}` +
  `construirMensajeDocumento()`. Como los documentos se completan muy distinto
  entre sí, el relleno va **renglón por renglón**: el que existía solo para
  mostrar un dato que este documento no tiene ("Total: {total}") se borra en vez
  de quedar hueco. `{cliente}` es la excepción a propósito — sin nombre,
  "Hola {cliente}," queda en "Hola," y el saludo no desaparece.
- **`documentos/EnviarDocumentoModal.tsx`**: el modal (teléfono + WhatsApp,
  mail + Enviar, lápiz para editar la plantilla, y «Descargar para adjuntar»).
- **`lib/descargar.ts`**: `descargarBlob()`, el guardado a disco que comparten
  el editor, el historial y el modal (antes estaba duplicado en dos archivos).
- **Dónde aparece el botón**:
  - `DocumentosPage` → al lado de «PDF», apenas se exporta algo (el envío
    necesita el archivo ya archivado). «Limpiar» lo saca: el papel en pantalla
    ya no es el que se archivó.
  - `HistorialDocumentos` → un ícono ✈ en cada renglón, junto a ver/descargar.
- **`lib/whatsapp.ts`** se reusa tal cual (normaliza el celular argentino).

## 4. La plantilla es una preferencia GLOBAL

Clave `documentos.mensaje_envio` en `comun.views.CLAVES_PREFERENCIAS`, **sin
permiso de módulo**: Documentos lo usa cualquier cuenta autenticada, igual que
su historial. Valor vacío = «sin personalizar» → el front usa su default (así
las mejoras del default llegan solas a quien nunca lo tocó). Mismo sistema que
las plantillas de Facturación y Cotizaciones.

## 5. Backend

### `documentos/email.py`
- `EmailNoConfigurado`: `settings.EMAIL_HOST` vacío.
- `ArchivoNoDisponible`: el archivo ya no está en disco.
- `enviar_documento(documento, email_destino, mensaje=None)`: arma asunto
  (`<Tipo> N° <ref> - CelTuc`), cuerpo en texto plano (el mensaje del usuario) +
  HTML sobrio con el resumen del documento, y adjunta el archivo guardado con su
  nombre y content-type reales. El `*negrita*` de WhatsApp se traduce a
  `<strong>`, **escapando antes**: lo que escriba el usuario nunca inyecta HTML.

### `documentos/views.py` → `EnviarDocumentoEmailView`
`POST /api/documentos/<pk>/enviar-email/` con `{ email, mensaje }`.
Mismo alcance que la descarga (`_visibles_para`): un empleado no puede mandar el
documento de otro. **No toca el historial ni el archivo.** Errores: 400 email
inválido, 404 documento ajeno / archivo perdido, 503 sin SMTP, 502 fallo del
correo (con `logger.exception`).

### `documentos/models.py`
Tres propiedades que ahora comparten la descarga y el email: `nombre_tipo`,
`nombre_descarga` (siempre con la extensión real) y `content_type_efectivo`.

## 6. Tests

`documentos/tests.py` → `EnviarDocumentoPorEmailTests` (SMTP en memoria):
adjunta el archivo guardado, el Excel va con su content-type, el mensaje del
usuario no inyecta HTML, sin mensaje usa el cuerpo por defecto, un empleado no
manda el documento de otro (y el admin sí), sin sesión no se envía, email
inválido 400, sin SMTP 503, archivo perdido 404, y enviar no toca el historial.

## 7. Configuración y deploy

Nada nuevo: usa el **mismo SMTP** que las facturas (`EMAIL_HOST`, `EMAIL_PORT`,
`EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, … en el `.env` del server, ver
`docs/EMAIL-COMPROBANTES.md` §4). Sin migraciones ni variables nuevas.
