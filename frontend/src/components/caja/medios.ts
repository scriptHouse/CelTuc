import {
  ArrowDownToLine,
  ArrowRightLeft,
  ArrowUpFromLine,
  Banknote,
  CircleDollarSign,
  CreditCard,
  Landmark,
  Receipt,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ConteoBilletes, MedioPagoCaja, TipoMovimientoCaja } from '@/types'
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
