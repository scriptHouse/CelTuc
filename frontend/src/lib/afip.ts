import type {
  CondicionEmisor,
  CondicionFiscal,
  EstadoEfectivo,
  Factura,
  ItemFactura,
  TipoComprobante,
} from '@/types'
import { pad } from '@/lib/format'

/**
 * Lógica fiscal (Argentina) simplificada pero fiel a las reglas de AFIP/ARCA:
 *
 *  - Un emisor MONOTRIBUTISTA siempre emite Factura C (sin IVA discriminado).
 *  - Un emisor RESPONSABLE INSCRIPTO emite:
 *      · Factura A  -> a otro Responsable Inscripto (IVA discriminado).
 *      · Factura B  -> a Consumidor Final, Monotributo o Exento (IVA incluido).
 */

export const IVA_RATE = 0.21

export const CONDICION_LABEL: Record<CondicionFiscal, string> = {
  responsable_inscripto: 'Responsable Inscripto',
  monotributista: 'Monotributista',
  consumidor_final: 'Consumidor Final',
  exento: 'Exento',
}

export const CONDICION_CORTA: Record<CondicionFiscal, string> = {
  responsable_inscripto: 'Resp. Inscripto',
  monotributista: 'Monotributo',
  consumidor_final: 'Consumidor Final',
  exento: 'Exento',
}

/** Determina el tipo de comprobante según emisor y receptor. */
export function tipoComprobante(
  emisor: CondicionEmisor,
  receptor: CondicionFiscal,
): TipoComprobante {
  if (emisor === 'monotributista') return 'C'
  return receptor === 'responsable_inscripto' ? 'A' : 'B'
}

/** Condiciones de cliente válidas según el emisor (las que el emisor puede facturar). */
export function condicionesClientePara(emisor: CondicionEmisor): CondicionFiscal[] {
  // Ambos pueden facturar a cualquiera; el tipo de comprobante se ajusta solo.
  return emisor === 'responsable_inscripto'
    ? ['responsable_inscripto', 'monotributista', 'consumidor_final', 'exento']
    : ['consumidor_final', 'responsable_inscripto', 'monotributista', 'exento']
}

export interface Totales {
  neto: number
  iva: number
  total: number
}

/** Calcula neto, IVA y total a partir de los ítems y el tipo de comprobante. */
export function calcularTotales(items: ItemFactura[], tipo: TipoComprobante): Totales {
  const neto = items.reduce(
    (acc, item) => acc + (Number(item.cantidad) || 0) * (Number(item.precioUnitario) || 0),
    0,
  )
  const iva = tipo === 'C' ? 0 : neto * IVA_RATE
  return { neto, iva, total: neto + iva }
}

/** Número de comprobante con formato AFIP: 0001-00000007 */
export function numeroComprobante(puntoVenta: number, numero: number): string {
  return `${pad(puntoVenta, 4)}-${pad(numero, 8)}`
}

/**
 * Estado "efectivo" de la factura: una factura pendiente cuya fecha de
 * vencimiento ya pasó se muestra como vencida (sin cambiar el dato persistido).
 */
export function estadoEfectivo(factura: Factura): EstadoEfectivo {
  if (factura.estado === 'pagada') return 'pagada'
  const venc = new Date(factura.vencimiento)
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  return venc.getTime() < hoy.getTime() ? 'vencida' : 'pendiente'
}

export const ESTADO_LABEL: Record<EstadoEfectivo, string> = {
  pagada: 'Pagada',
  pendiente: 'Pendiente',
  vencida: 'Vencida',
}
