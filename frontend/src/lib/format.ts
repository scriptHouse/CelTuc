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

const USD0 = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
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

/** Dólares sin decimales: US$ 310 — las cotizaciones se manejan en USD. */
export function usd0(value: number): string {
  return USD0.format(value || 0)
}

/** Número con separadores de miles. */
export function num(value: number): string {
  return NUM.format(value || 0)
}

/** dd/mm/aaaa */
export function fecha(iso: string): string {
  // Una fecha "solo día" (yyyy-mm-dd) se interpreta como LOCAL para que no se
  // corra un día por zona horaria; un timestamp completo (ISO con hora) va directo.
  const soloDia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  const d = soloDia
    ? new Date(Number(soloDia[1]), Number(soloDia[2]) - 1, Number(soloDia[3]))
    : new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** 18 jun 2026 */
export function fechaLarga(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** dd/mm/aaaa HH:MM (fecha y hora, para auditoría). */
export function fechaHora(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Tiempo relativo en español: "recién", "hace 5 min", "hace 2 h", "ayer", o la
 * fecha absoluta si es más vieja que una semana. Ideal para "última vez activo".
 */
export function tiempoRelativo(iso?: string | null): string {
  if (!iso) return 'nunca'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const seg = Math.floor((Date.now() - d.getTime()) / 1000)
  if (seg < 0) return 'recién'
  if (seg < 60) return 'recién'
  const min = Math.floor(seg / 60)
  if (min < 60) return `hace ${min} min`
  const horas = Math.floor(min / 60)
  if (horas < 24) return `hace ${horas} h`
  const dias = Math.floor(horas / 24)
  if (dias === 1) return 'ayer'
  if (dias < 7) return `hace ${dias} días`
  return fecha(iso)
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
