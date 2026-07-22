import {
  ArrowDownToLine,
  ArrowRightLeft,
  ArrowUpFromLine,
  Banknote,
  CircleDollarSign,
  CreditCard,
  FileCheck2,
  FileText,
  Landmark,
  Receipt,
  ReceiptText,
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
  tarjeta: CreditCard,
  otro: CircleDollarSign,
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
