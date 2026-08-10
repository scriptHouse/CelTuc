import {
  ArrowDownToLine,
  ArrowRightLeft,
  ArrowUpFromLine,
  Banknote,
  Building2,
  CircleDollarSign,
  CreditCard,
  FileCheck2,
  FileText,
  Landmark,
  Receipt,
  ReceiptText,
  Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type {
  CajaRegistradora,
  CanalCaja,
  ConteoBilletes,
  FacturacionVenta,
  MedioPagoCaja,
  TipoMovimientoCaja,
} from '@/types'
import { MEDIOS_PAGO_CAJA } from '@/types'

/** Ícono de cada medio de pago (una sola fuente para página, cierre y ticket). */
export const MEDIO_ICONO: Record<MedioPagoCaja, LucideIcon> = {
  efectivo: Banknote,
  transferencia: ArrowRightLeft,
  transf_financiera: Building2,
  tarjeta: CreditCard,
  otro: CircleDollarSign,
}

/**
 * Qué transferencia se ofrece según cómo se factura esa parte de la venta.
 *
 * El monotributo NO usa la transferencia común: usa la financiera. Con Factura
 * A/B es al revés. En «Sin factura» quedan las dos, porque ahí la plata puede
 * haber entrado por cualquiera de los dos rieles y lo sabe quien cobra.
 */
export const FORMAS_POR_FACTURACION: Record<FacturacionVenta, MedioPagoCaja[]> = {
  factura_ri: ['efectivo', 'transferencia', 'tarjeta', 'otro'],
  factura_c: ['efectivo', 'transf_financiera', 'tarjeta', 'otro'],
  sin_factura: ['efectivo', 'transferencia', 'transf_financiera', 'tarjeta', 'otro'],
}

/** Las formas de pago elegibles para una facturación, con su etiqueta. */
export function formasPara(facturacion: FacturacionVenta) {
  const permitidos = FORMAS_POR_FACTURACION[facturacion]
  return MEDIOS_PAGO_CAJA.filter((m) => permitidos.includes(m.value))
}

/**
 * Cómo se factura habitualmente cada medio, para SUGERIRLO al elegirlo.
 *
 * Es solo una preselección: quien cobra puede cambiar el pill después y queda
 * lo que él eligió. `null` = ese medio no sugiere nada (deja lo que haya).
 *
 * El flujo del mostrador:
 *  - Efectivo → sin factura.
 *  - Transferencia (la del Responsable Inscripto) → Factura A/B.
 *  - Transferencia financiera (la del monotributo) → sin factura.
 *  - Tarjeta → Factura C. Es el ÚNICO medio que no dice con qué cuenta va
 *    (la usan las dos), así que se sugiere la más frecuente y se cambia a mano
 *    cuando esa venta va con el RI.
 *  - Otro → no sugiere: es el cajón de sastre.
 */
export const FACTURACION_SUGERIDA: Record<MedioPagoCaja, FacturacionVenta | null> = {
  efectivo: 'sin_factura',
  transferencia: 'factura_ri',
  transf_financiera: 'sin_factura',
  tarjeta: 'factura_c',
  otro: null,
}

/** La facturación que sugiere un medio, o la actual si ese medio no sugiere. */
export function facturacionSugerida(
  medio: MedioPagoCaja,
  actual: FacturacionVenta,
): FacturacionVenta {
  return FACTURACION_SUGERIDA[medio] ?? actual
}

/** Nombre visible de cada medio. */
export const MEDIO_LABEL: Record<MedioPagoCaja, string> = MEDIOS_PAGO_CAJA.reduce(
  (acc, m) => ({ ...acc, [m.value]: m.label }),
  {} as Record<MedioPagoCaja, string>,
)

/** Ícono de cada tipo de movimiento (feed del turno y snapshot del Z). */
export const TIPO_MOV_ICONO: Record<TipoMovimientoCaja, LucideIcon> = {
  venta: Receipt,
  ingreso: ArrowDownToLine,
  egreso: ArrowUpFromLine,
  retiro: Landmark,
}

/** Etiqueta corta de cada tipo de movimiento. */
export const TIPO_MOV_LABEL: Record<TipoMovimientoCaja, string> = {
  venta: 'Venta',
  ingreso: 'Ingreso',
  egreso: 'Egreso',
  retiro: 'Retiro',
}

/** ¿El movimiento suma o resta efectivo/plata? (para el signo del feed). */
export function signoMovimiento(tipo: TipoMovimientoCaja): 1 | -1 {
  return tipo === 'egreso' || tipo === 'retiro' ? -1 : 1
}

/** Total de un conteo por denominación: billetes + sueltos. */
export function totalConteo(conteo: ConteoBilletes, sueltos: number): number {
  const billetes = Object.entries(conteo).reduce((a, [den, cant]) => a + Number(den) * (cant || 0), 0)
  return billetes + (sueltos || 0)
}

/** "1 operación" / "12 operaciones". */
export function operacionesLabel(n: number): string {
  return n === 1 ? '1 operación' : `${n} operaciones`
}

// ===== Canal fiscal (dos cajas: lo del RI y lo demás) ========================

/** Etiqueta corta del canal de una caja (para chips y tabs). */
export const CANAL_LABEL: Record<Exclude<CanalCaja, ''>, string> = {
  factura_ri: 'Facturado RI',
  general: 'Monotributo y sin factura',
}

/** Qué entra sola a cada caja (se muestra bajo el selector de cajas). */
export const CANAL_DESCRIPCION: Record<Exclude<CanalCaja, ''>, string> = {
  factura_ri: 'Acá entra sola la plata facturada con Responsable Inscripto (Factura A/B).',
  general: 'Acá entra sola la plata de Factura C (monotributo) y la que va sin factura.',
}

/** Ícono de cada canal (tarjetas del selector de cajas). */
export const CANAL_ICONO: Record<CanalCaja, LucideIcon> = {
  factura_ri: FileCheck2,
  general: ReceiptText,
  '': Wallet,
}

/** Resumen corto de qué recibe cada caja (cabe en una línea de la tarjeta). */
export const CANAL_RESUMEN: Record<CanalCaja, string> = {
  factura_ri: 'Facturado con RI (Factura A/B)',
  general: 'Factura C y ventas sin factura',
  '': 'Caja común (se elige a mano)',
}

/** Las tres formas de facturar una venta de mostrador, en orden de uso. */
export const FACTURACIONES: Array<{
  value: FacturacionVenta
  label: string
  hint: string
  icono: LucideIcon
}> = [
  { value: 'sin_factura', label: 'Sin factura', hint: 'venta común', icono: ReceiptText },
  { value: 'factura_c', label: 'Factura C', hint: 'monotributo', icono: FileText },
  { value: 'factura_ri', label: 'Factura A/B', hint: 'Resp. Inscripto', icono: FileCheck2 },
]

/** Etiqueta corta de cada forma de facturar (feed de movimientos y ticket Z). */
export const FACTURACION_LABEL: Record<FacturacionVenta, string> = FACTURACIONES.reduce(
  (acc, f) => ({ ...acc, [f.value]: f.label }),
  {} as Record<FacturacionVenta, string>,
)

/** El canal de caja que recibe cada forma de facturar (espejo del backend). */
export const CANAL_POR_FACTURACION: Record<FacturacionVenta, Exclude<CanalCaja, ''>> = {
  factura_ri: 'factura_ri',
  factura_c: 'general',
  sin_factura: 'general',
}

/** La caja que recibiría una venta según cómo se factura (o null si no hay canales). */
export function cajaParaFacturacion(
  cajas: CajaRegistradora[],
  facturacion: FacturacionVenta,
): CajaRegistradora | null {
  const canal = CANAL_POR_FACTURACION[facturacion]
  return cajas.find((c) => c.activa && c.canal === canal) ?? null
}
