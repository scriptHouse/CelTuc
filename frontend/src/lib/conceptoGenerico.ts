/**
 * Concepto de factura: emitir sin detallar lo que se vendió.
 *
 * Una factura se puede emitir «con concepto»: en vez de un renglón por
 * producto, sale UN solo renglón con un texto del banco de conceptos, por el
 * total. Quien factura lo decide en el modal de emisión.
 *
 * Quién hace qué:
 *  - El BACKEND es el que manda: al emitir agrupa los renglones y escribe el
 *    texto del concepto elegido (`facturacion/concepto.py`).
 *  - Los administradores arman el banco (crear, editar, desactivar) y marcan
 *    uno como predeterminado; quien factura elige entre los ACTIVOS.
 *
 * No tiene efecto fiscal: ARCA solo recibe importes, nunca el detalle de los
 * renglones, así que esto no toca el CAE ni los totales.
 */
import type { CondicionEmisor } from '@/types'

/** Largo máximo del renglón en la base (`ItemComprobante.descripcion`). */
export const MAX_LARGO_CONCEPTO = 200

/**
 * ¿El check de concepto arranca tildado para este emisor?
 *
 * Monotributista sí (es lo habitual en el mostrador); Responsable Inscripto no,
 * porque sus facturas suelen ir con el detalle real. Siempre se puede cambiar.
 */
export function conceptoPorDefecto(condicion: CondicionEmisor): boolean {
  return condicion === 'monotributista'
}
