/**
 * Concepto genérico: productos que en la factura no dicen su nombre.
 *
 * Algunos artículos (parlantes, consolas, equipos Xiaomi/Samsung/Apple y los
 * repuestos del taller) no se detallan por su nombre en la factura: se agrupan
 * en UN renglón con un texto configurable. El corte lo marca el flag
 * `concepto_generico_factura` de cada producto / fila de service.
 *
 * Quién hace qué:
 *  - El BACKEND es el que manda: al emitir fusiona los renglones marcados y
 *    escribe este texto (`facturacion/concepto.py`). No se puede saltear.
 *  - El front usa esto solo para AVISAR antes de emitir, mostrando el mismo
 *    texto que va a quedar.
 *
 * No tiene efecto fiscal: ARCA solo recibe importes, nunca el detalle de los
 * renglones, así que cambiar el texto no toca el CAE ni los totales.
 */

/** Clave de la preferencia global (declarada en el backend). */
export const CLAVE_CONCEPTO_GENERICO = 'facturacion.concepto_generico'

/** Texto de fábrica, mientras nadie lo personalice. Igual al del backend. */
export const MENSAJE_CONCEPTO_POR_DEFECTO = 'Accesorios y repuestos para telefonía celular'

/** Largo máximo del renglón en la base (`ItemComprobante.descripcion`). */
export const MAX_LARGO_CONCEPTO = 200
