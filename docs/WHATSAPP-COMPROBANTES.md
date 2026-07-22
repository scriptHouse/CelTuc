# Envío de comprobantes por WhatsApp

> Botón «WhatsApp» en el detalle de un comprobante (`/facturacion`). Aditivo y
> aislado: no toca la emisión, ARCA, el PDF ni el email.
>
> Docs relacionadas: `docs/FACTURACION.md`, `docs/EMAIL-COMPROBANTES.md`.

---

## 1. Cómo funciona (click-to-chat, sin API)

No usa la API de WhatsApp Business: arma un link oficial *click-to-chat*
(`https://wa.me/<numero>?text=<mensaje>`) y lo abre en una pestaña nueva. Se
abre el WhatsApp del vendedor (app o Web) con el chat del cliente y el mensaje
ya redactados; solo falta apretar enviar. Sin credenciales, sin costo por
mensaje, sin aprobación de Meta.

**Límite conocido:** por esta vía el PDF no puede adjuntarse solo — se descarga
con «Descargar PDF» y se adjunta a mano en el chat (la UI lo recuerda).

## 2. Frontend

- **`lib/whatsapp.ts`**: `waNumeroArgentino()` normaliza el teléfono como se
  escribe en la vida real («381 555-4433», «0381 15-555-4433», «+54 9 …») al
  formato `549` + área + número; devuelve `null` si no parece un celular
  argentino (la UI avisa en vez de abrir un chat roto). `waLink()` arma el link;
  sin número, WhatsApp deja elegir el chat.
- **`lib/mensajeFactura.ts`**: plantilla del mensaje con variables `{cliente}`,
  `{tipo}`, `{numero}`, `{emisor}`, `{fecha}`, `{total}`, `{cae}`, `{vto_cae}`
  + `construirMensajeFactura()` (rellena y limpia: sin nombre no queda
  «Hola ,»). El default replica el email.
- **`FacturacionPage` → `DetalleModal`**: input de teléfono (precargado con el
  de la factura; si la factura no tiene, se busca al cliente en la base por su
  documento) + botón «WhatsApp» + lápiz que abre el editor de plantilla
  (`MensajeWhatsappModal`, el mismo de Cotizaciones, generalizado por props).

## 3. La plantilla es una preferencia GLOBAL (backend)

Se guarda en el backend y vale para todos los usuarios y dispositivos (la de
Cotizaciones también usa este sistema):

- **`comun.models.Preferencia`**: clave única → valor de texto (hereda
  `ModeloBase`). Tabla `preferencias` (migración `comun/0001`).
- **`comun.views.PreferenciaView`**: `GET/PUT /api/preferencias/<clave>/`.
  Solo claves declaradas en `CLAVES_PREFERENCIAS` (hoy:
  `facturacion.mensaje_whatsapp` → permiso `ver_facturacion`, y
  `cotizaciones.mensaje_whatsapp` → `ver_cotizaciones`); clave desconocida →
  404. Valor vacío = «sin personalizar» (el front usa su default, así las
  mejoras del default llegan a quien nunca lo tocó).
- Permiso: `LecturaYEscrituraConPermiso` — leer y guardar es operación de
  mostrador, igual que facturar. Editable también desde el admin.
- Front: `services/preferencias.ts` + react-query (si el GET falla, cae al
  texto por defecto y el botón sigue funcionando).
- **Migración desde localStorage (Cotizaciones)**: la plantilla vivía en el
  navegador; al abrir la página, si el backend aún no tiene valor y este
  dispositivo tenía uno personalizado, se sube solo y se limpia la copia
  local (`plantillaLocalPendiente()` en `lib/mensajeCotizacion.ts`).

Para sumar otra preferencia global: agregar la clave a `CLAVES_PREFERENCIAS`
y consumirla igual desde el front.

## 4. Tests

`comun/tests.py` (`PreferenciasTests`): auth requerida, default vacío, guardar
y releer (upsert sin duplicar), vaciar restaura default, clave desconocida 404,
valor no-texto 400, permisos de rol.

## 5. Deploy

Nada manual: `deploy/entrypoint.sh` corre `migrate --noinput` en cada arranque,
así que el redeploy normal crea la tabla. Sin variables de entorno nuevas.
