# Notas de crédito

> Acreditar (total o parcialmente) una factura ya emitida, desde `/facturacion`.
> Es el **mismo web service de ARCA** que las facturas: no hay que habilitar
> nada nuevo, solo cambia el código de comprobante y viaja la factura asociada.
>
> Docs relacionadas: `docs/FACTURACION.md`, `docs/EMAIL-COMPROBANTES.md`,
> `docs/WHATSAPP-COMPROBANTES.md`.

---

## 1. Lo fiscal, en tres líneas

- Una nota de crédito **hereda la letra** de la factura que acredita: A, B o C.
- ARCA la autoriza por el **WSFEv1**, el mismo `FECAESolicitar` de siempre, con
  otro `CbteTipo`: **3** (NC A), **8** (NC B) y **13** (NC C), contra 1/6/11 de
  las facturas.
- Cada `(punto de venta, CbteTipo)` tiene **su propia numeración**: la Factura B
  0001-00000015 y la Nota de crédito B 0001-00000015 son documentos distintos.
- Los importes viajan **en positivo**: el signo lo da el tipo de comprobante.
- Viaja `CbtesAsoc` con el `(Tipo, PtoVta, Nro)` de la factura: es lo que ARCA
  cruza para saber qué se está acreditando.

Único requisito de trámite: que el punto de venta esté habilitado en ARCA para
notas de crédito (normalmente el mismo de factura electrónica ya las cubre).

## 2. Cómo se usa

Siempre se arranca **desde una factura**, nunca en blanco — como en cualquier
sistema serio, y porque la nota necesita saber a qué comprobante se cuelga:

- En la lista de `/facturacion`, el ícono ✂ de la fila de una factura.
- O adentro del detalle de la factura, botón **«Nota de crédito»** (aparece solo
  si queda saldo por acreditar).

El modal ofrece dos caminos, en un paso:

| | Qué hace |
|---|---|
| **Toda la factura** | Acredita todos los renglones. Un clic. Si la factura ya tenía notas, la opción pasa a ser **«Todo el saldo»** y manda un único renglón por lo que queda. |
| **Una parte** | Se destildan renglones y se ajustan cantidades/importes; el total se recalcula solo. |

Además: **motivo** (con atajos: devolución, error, anulación, descuento),
**fecha** (hoy por defecto, nunca anterior a la factura) y **con qué se devuelve
la plata** (por defecto, el mismo medio con el que se cobró la factura).

Lo que la nota **no** hace por su cuenta, y el modal lo dice antes de emitir: no
mueve stock ni borra la factura, que sigue existiendo en ARCA.

## 2 bis. Y después: «¿volvió la mercadería?»

Apenas la nota sale con su CAE, aparece un **segundo modal que pregunta** si el
producto volvió al local. Decide la persona, siempre:

- **«No volvió nada»** → no pasa nada más. Es lo correcto cuando se acreditó por
  un error de facturación, un descuento acordado, o una devolución que todavía
  no llegó.
- **«Sumar al stock»** → las unidades vuelven al inventario.

Son dos cosas distintas a propósito: acreditar es fiscal, recibir mercadería es
físico, y pasan en momentos distintos (o no pasan). Por eso el sistema no lo
asume: pregunta.

Qué producto vuelve tampoco se puede adivinar — los renglones del comprobante son
texto libre, y con concepto genérico son UNO solo que dice «Servicio técnico».
Así que el modal los **propone ya emparejados por nombre** con el catálogo (sin
tildes ni mayúsculas de por medio); lo que no empareja arranca destildado y pide
elegir el producto a mano. La sucursal viene puesta en la del empleado logueado.

Detalles: la cantidad es editable, el movimiento queda firmado en Inventario como
«Nota de crédito B 0001-00000003», y **se puede una sola vez** (el backend
responde 409 si ya se hizo, así un doble clic no duplica unidades). Si la cuenta
no tiene acceso a Inventario, el modal lo dice y no ofrece nada.

## 3. El signo: dónde resta

Una nota de crédito devuelve plata, así que **resta** en todos los números del
sistema. Con cero notas emitidas, todo da exactamente lo mismo que antes.

| Dónde | Qué cambia |
|---|---|
| Resumen mensual (planilla exportada) | El día, el medio de cobro, la cuenta y el total van **netos**. La nota cuenta como un comprobante más en `cantidad`, y en la hoja de comprobantes su tipo dice `NC B` con el importe en negativo. |
| Límite de facturación mensual | `facturado_del_mes` va neto: acreditar libera lugar en el tope del mes. |
| Historial del cliente | La nota aparece como una fila propia con su importe en negativo; el total gastado va neto. |
| Panel | La facturación real del mes (RI y Mono) va neta. |
| Stats de la cuenta | Facturado / Cobrado / Pendiente van netos; debajo del total se aclara cuánto se acreditó. |

La nota **hereda el estado de cobro y el medio de pago** de la factura, para que
la plata se devuelva del mismo balde del que entró (una factura cobrada en
efectivo, acreditada, baja el efectivo del día). El medio se puede cambiar al
emitir.

## 4. Backend

### `models.py` — dos campos y una constraint
- `Comprobante.clase`: `factura` | `nota_credito` (default `factura`, así todo
  lo ya emitido sigue igual). La **letra** sigue en `tipo`.
- `Comprobante.comprobante_asociado`: FK a la factura acreditada (`PROTECT`).
- La unicidad del número pasa a ser `(emisor, clase, tipo, punto_venta, numero)`.
- Propiedades: `es_nota_credito`, `signo`, `total_firmado`, `nombre_comprobante`,
  `acreditado` y `saldo_acreditable`. Y `total_firmado()` (función de módulo) es
  la expresión SQL que usan el resumen, el tope y el historial para sumar con signo.

`acreditado` cuenta también las notas **ocultas** de la lista: el borrado en la
app es lógico y su CAE existe igual, así que esa plata sigue acreditada.

### `arca/servicio.py` — `emitir_nota_credito(origen, datos, usuario)`
Mismo esqueleto que `emitir`: valida, calcula, autentica, pide el número, pide
el CAE y recién ahí guarda. Diferencias: el código 3/8/13, `CbtesAsoc` en el
detalle, y que el receptor / la letra / la alícuota / el concepto **salen de la
factura** (no se eligen).

El chequeo del saldo corre **dentro del lock del emisor**: si dos cajas acreditan
la misma factura al mismo tiempo, la segunda espera y recién ahí lee cuánto
quedó. Chequearlo antes dejaría pasar las dos (ARCA no valida eso).

### `views.py` — dos endpoints
`POST /api/facturacion/comprobantes/<pk>/nota-credito/`
Permiso `PuedeFacturar`, el mismo que emitir: acreditar es operación de
mostrador. El límite mensual **no** se chequea (una nota resta, nunca hace pasar
el tope). Errores: **400** con motivo claro y sin hablar con ARCA (ya acreditada,
se pasa del saldo, fecha anterior, es una nota, factura sin CAE), **502** si ARCA
rechaza o no responde.

`POST /api/facturacion/comprobantes/<pk>/devolver-stock/` con
`{sucursal, items:[{producto, cantidad}]}` suma las unidades al inventario y
firma cada movimiento con el número de la nota. Mismo permiso que emitir (igual
que el descuento de stock al facturar: son las dos caras de la misma operación de
mostrador). Devuelve `409` si el stock de esa nota ya se devolvió, y los
problemas por producto salen como `avisos` sin voltear nada — la nota ya está
emitida.

`GET /api/facturacion/comprobantes/` acepta `?clase=factura|nota_credito`.

### Lo demás
- El detalle de una factura trae `notas_credito`, `acreditado` y
  `saldo_acreditable`; el de una nota, `asociado`.
- El email nombra bien el documento (asunto, cuerpo, HTML y nombre del adjunto) y
  la nota dice qué factura acredita.

## 5. Frontend

- **`components/facturacion/NotaCreditoModal.tsx`**: el modal de emisión.
- **`components/facturacion/DevolverStockModal.tsx`**: el que pregunta por la
  mercadería después de emitir.
- **`FacturacionPage`**: ícono en la fila, botón en el detalle, filtro
  Todos/Facturas/Notas, fila con cuadro «NC» e importe en negativo, y stats netas.
  La fila pasó a `flex-wrap`: en el celular el importe baja al bloque del cliente
  y el estado + acciones se van a una segunda línea, en vez de estrangular el nombre.
- **`documentos/FacturaPdf.tsx`**: título `NOTA DE CRÉDITO`, código 03/08/13 y el
  renglón «Comprobante asociado».
- **`lib/afip.ts`**: `nombreComprobante()` y `signoComprobante()`.
- **`lib/mensajeFactura.ts`**: variable nueva `{documento}` («Factura» / «Nota de
  crédito») y el default la usa. ⚠️ Si alguien ya personalizó la plantilla de
  WhatsApp, va a decir «Factura» también en las notas: se arregla editándola con
  el lápiz y poniendo `{documento}` donde dice «Factura».

## 6. Tests

`facturacion/tests.py`:
- `NotaCreditoARCATests`: mockea solo la capa SOAP, así prueba de verdad el
  código 3/8/13, la numeración propia, `CbtesAsoc`, los importes en positivo, el
  QR con el código de la nota, la herencia del receptor y el caso Monotributo.
- `NotaCreditoEndpointTests`: permisos, validaciones (400 sin hablar con ARCA),
  502 de ARCA, parcial + saldo, nota oculta, detalle y filtro por clase.
- `NotaCreditoRestaTests`: que reste en el mes, en el tope y en el cliente.
- `NotaCreditoGuardasDelServicioTests`: las guardas del servicio (las del lock).
- `DevolverStockNotaCreditoTests`: que sume donde va, que quede firmado con el
  número de la nota, que no se pueda repetir, que una factura no devuelva stock y
  que devolver no toque el comprobante.

`facturacion/test_nota_credito_flujo.py`: los recorridos completos de punta a
punta — el de los números (facturar → acreditar parcial → intentar de más →
acreditar el saldo → intentar otra vez → lista, filtro, resumen y tope) y el de
la mercadería (el stock baja al facturar, **no** se mueve al acreditar, y vuelve
solo cuando la persona contesta que sí).

> Nota de infraestructura: los tests corren **sin el límite de peticiones** de
> DRF (`celtuc/settings.py`). Su contador vive en la cache, que no se limpia
> entre tests, así que con la suite completa se acumulaban pedidos del mismo id
> de usuario y empezaban a fallar con 429 pruebas que no tenían nada que ver.

## 7. Deploy

`deploy/entrypoint.sh` corre `migrate --noinput` en cada arranque, así que el
redeploy normal aplica `facturacion/0010_nota_credito`. Sin variables de entorno
nuevas y sin trámites en ARCA.
