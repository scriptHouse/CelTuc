/**
 * Concepto de factura: emitir sin detallar lo que se vendió.
 *
 * Una factura se puede emitir «con concepto»: en vez de decir qué producto se
 * vendió, los renglones dicen un texto del banco de conceptos. Quien factura
 * toma DOS decisiones en el modal de emisión:
 *
 *  1. Si usa concepto (o factura con el detalle real).
 *  2. Cómo sale: **todo junto en un renglón** por el total (lo de siempre), o
 *     **un renglón por ítem**, cada uno con su cantidad y su precio y el texto
 *     del concepto. Dos ítems de $700.000 salen como un renglón de $1.400.000 o
 *     como dos de $700.000, según lo que se elija. El total es el mismo.
 *
 * Quién hace qué:
 *  - El BACKEND es el que manda: al emitir arma los renglones con el texto del
 *    concepto elegido (`facturacion/concepto.py`).
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

/** Un renglón tal como va a quedar impreso en la factura. */
export interface RenglonFactura {
  descripcion: string
  cantidad: number
  precioUnitario: number
}

/**
 * Los renglones que va a tener la factura, para mostrarlos ANTES de emitir.
 *
 * Espeja `facturacion/concepto.py` del backend, que es el que manda: acá se
 * calcula lo mismo solo para que quien factura vea de antemano cómo va a salir
 * el comprobante (fue justo la sorpresa que motivó la opción: dos ítems de
 * $700.000 saliendo como uno de $1.400.000).
 */
export function renglonesDeFactura(
  items: RenglonFactura[],
  concepto: { texto: string; agrupar: boolean } | null,
): RenglonFactura[] {
  const texto = (concepto?.texto ?? '').trim().slice(0, MAX_LARGO_CONCEPTO)
  if (!concepto || !texto || items.length === 0) return items
  if (!concepto.agrupar) return items.map((i) => ({ ...i, descripcion: texto }))
  const total = items.reduce((a, i) => a + i.cantidad * i.precioUnitario, 0)
  return [{ descripcion: texto, cantidad: 1, precioUnitario: Math.round(total * 100) / 100 }]
}
