/**
 * Helpers de formato (es-AR): dinero, números y fechas.
 * Centralizados para que toda la app muestre los valores igual.
 */

const ARS = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const ARS0 = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})

const ARS_COMPACT = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  notation: 'compact',
  maximumFractionDigits: 1,
})

const NUM = new Intl.NumberFormat('es-AR')

/** Dinero con dos decimales: $ 1.234,50 */
export function money(value: number): string {
  return ARS.format(value || 0)
}

/** Dinero redondeado (sin decimales), para KPIs y totales grandes. */
export function money0(value: number): string {
  return ARS0.format(value || 0)
}

/** Dinero compacto: $ 1,2 M — ideal para tarjetas de métricas. */
export function moneyCompact(value: number): string {
  return ARS_COMPACT.format(value || 0)
}

/** Número con separadores de miles. */
export function num(value: number): string {
  return NUM.format(value || 0)
}

/** dd/mm/aaaa */
export function fecha(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** 18 jun 2026 */
export function fechaLarga(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Rellena con ceros a la izquierda: pad(7, 8) -> "00000007" */
export function pad(value: number, length: number): string {
  return String(value).padStart(length, '0')
}

/** Período "aaaa-mm" de una fecha (por defecto, hoy). */
export function periodoDe(date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1, 2)}`
}

/** Nombre legible del período: "junio 2026". */
export function periodoLabel(periodo: string): string {
  const [y, m] = periodo.split('-').map(Number)
  if (!y || !m) return periodo
  const d = new Date(y, m - 1, 1)
  return d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
}
