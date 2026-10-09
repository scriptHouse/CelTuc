import { money, money0, num, usd } from '@/lib/format'

/**
 * Cómo se llega de un precio en dólares a uno en pesos, contado paso a paso.
 *
 * El catálogo (Productos) y la lista de Service convierten con el dólar del
 * negocio y después REDONDEAN PARA ARRIBA al múltiplo configurado (en el
 * negocio: la lista a $100 y el contado a $1.000). En los productos baratos
 * ese redondeo pesa más que el dólar: USD 2 × $1.565 = $3.130 → $3.200, que
 * «parece» dólar 1.600. Estas funciones escriben esa cuenta tal cual, para
 * mostrarla al lado del precio y que nadie tenga que adivinarla.
 */

/** Los múltiplos de redondeo que se ofrecen como opciones (cualquier otro vale igual). */
export const PRESETS_REDONDEO = [1, 10, 50, 100, 500, 1000, 5000]

export function etiquetaRedondeo(multiplo: number): string {
  if (multiplo <= 1) return 'Exacto (sin redondear)'
  return `Para arriba a $${num(multiplo)}`
}

/** Opciones para un Select: los presets más el valor actual si es otro. */
export function opcionesRedondeo(actual: number): Array<{ value: string; label: string }> {
  const valores = PRESETS_REDONDEO.includes(actual) ? PRESETS_REDONDEO : [...PRESETS_REDONDEO, actual].sort((a, b) => a - b)
  return valores.map((v) => ({ value: String(v), label: etiquetaRedondeo(v) }))
}

/** Redondeo PARA ARRIBA al múltiplo (igual que el backend). */
export function ceilMultiplo(valor: number, multiplo: number): number {
  const m = Math.max(1, Math.trunc(multiplo) || 1)
  return Math.ceil(valor / m) * m
}

/**
 * Los pasos de «USD × dólar → redondeo → precio» para un valor en dólares.
 * Si el precio en pesos está fijado a mano (`fijado`), lo dice y no inventa
 * una cuenta que no se usó.
 */
export function explicarConversion({
  etiqueta,
  valorUsd,
  dolar,
  redondeo,
  fijado,
}: {
  etiqueta: string
  valorUsd: number | null | undefined
  dolar: number | null | undefined
  redondeo: number
  fijado: boolean
}): string[] {
  if (fijado) {
    return [`${etiqueta} en pesos fijado a mano: no sigue al dólar ni al redondeo.`]
  }
  if (valorUsd == null || dolar == null || !(dolar > 0)) return []
  const exacto = Number(valorUsd) * Number(dolar)
  const final = ceilMultiplo(exacto, redondeo)
  const pasos = [`${usd(Number(valorUsd))} × ${money0(Number(dolar))} = ${money(exacto)}`]
  if (redondeo > 1) {
    pasos.push(
      final === Math.round(exacto)
        ? `ya es múltiplo de $${num(redondeo)}: ${money0(final)}`
        : `redondeado para arriba a $${num(redondeo)}: ${money0(final)}`,
    )
  } else {
    pasos.push(`sin redondeo: ${money0(Math.round(exacto))}`)
  }
  return pasos
}

/** Una frase corta con la regla vigente, para un chip. */
export function resumenRegla({
  dolar,
  redondeoLista,
  redondeoCash,
  descuento,
}: {
  dolar: number | null | undefined
  redondeoLista: number
  redondeoCash?: number
  descuento?: number | null
}): string {
  const partes: string[] = []
  if (dolar != null) partes.push(`USD × ${money0(Number(dolar))}`)
  partes.push(redondeoLista > 1 ? `lista ↑ a $${num(redondeoLista)}` : 'lista exacta')
  if (redondeoCash != null) {
    const desc = descuento != null ? `contado −${num(Number(descuento))} %` : 'contado'
    partes.push(redondeoCash > 1 ? `${desc} ↑ a $${num(redondeoCash)}` : `${desc} exacto`)
  }
  return partes.join(' · ')
}
