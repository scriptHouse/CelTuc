import type {
  ConfiguracionPreciosService,
  DolarAjusteTipo,
  DolarReferencia,
} from '@/types'
import type { ConfiguracionInput, DolarBlue } from '@/services/preciosService'

/**
 * La regla del dólar automático, en el front: ESPEJO de
 * `precios_service.models.calcular_dolar_automatico` / `describir_regla`.
 *
 * Sirve para la vista previa en vivo («quedaría en $1.580») mientras se edita;
 * el número que manda es siempre el que devuelve el backend al guardar.
 */

export interface ReglaDolar {
  referencia: DolarReferencia
  ajusteTipo: DolarAjusteTipo
  /** Con signo: 25 suma, -10 resta. */
  ajusteValor: number
  /** Múltiplo de redondeo; 0 = sin redondear. */
  redondeo: number
  /** No actualizar si el cambio es menor a esto (0 = siempre). */
  cambioMinimo: number
}

export const REFERENCIAS: Array<{ value: DolarReferencia; label: string; ayuda: string }> = [
  { value: 'venta', label: 'Blue venta', ayuda: 'Lo que cuesta comprar dólares: la base habitual para una lista.' },
  { value: 'compra', label: 'Blue compra', ayuda: 'Lo que pagan por tus dólares. Un poco más bajo que la venta.' },
  { value: 'promedio', label: 'Promedio', ayuda: 'El punto medio entre compra y venta.' },
]

export const TIPOS_AJUSTE: Array<{ value: DolarAjusteTipo; label: string; ayuda: string }> = [
  { value: 'monto', label: '$', ayuda: 'Pesos fijos: blue + $25.' },
  { value: 'porcentaje', label: '%', ayuda: 'Un porcentaje del blue: blue + 2 %.' },
]

export const REDONDEOS: Array<{ value: string; label: string }> = [
  { value: '0', label: 'Sin redondear' },
  { value: '1', label: 'A $1' },
  { value: '5', label: 'A $5' },
  { value: '10', label: 'A $10' },
  { value: '50', label: 'A $50' },
  { value: '100', label: 'A $100' },
]

export function reglaDeConfig(config: ConfiguracionPreciosService): ReglaDolar {
  return {
    referencia: config.dolar_referencia ?? 'venta',
    ajusteTipo: config.dolar_ajuste_tipo ?? 'monto',
    ajusteValor: Number(config.dolar_ajuste_valor ?? 0),
    redondeo: Number(config.dolar_redondeo ?? 1),
    cambioMinimo: Number(config.dolar_cambio_minimo ?? 0),
  }
}

export function reglaAInput(regla: ReglaDolar): Partial<ConfiguracionInput> {
  return {
    dolar_referencia: regla.referencia,
    dolar_ajuste_tipo: regla.ajusteTipo,
    dolar_ajuste_valor: regla.ajusteValor,
    dolar_redondeo: regla.redondeo,
    dolar_cambio_minimo: regla.cambioMinimo,
  }
}

export function mismaRegla(a: ReglaDolar, b: ReglaDolar): boolean {
  return (
    a.referencia === b.referencia &&
    a.ajusteTipo === b.ajusteTipo &&
    a.ajusteValor === b.ajusteValor &&
    a.redondeo === b.redondeo &&
    a.cambioMinimo === b.cambioMinimo
  )
}

/** La cotización base según la referencia (null si falta el dato). */
export function referenciaDelBlue(
  referencia: DolarReferencia,
  blue: Pick<DolarBlue, 'compra' | 'venta'> | null | undefined,
): number | null {
  if (!blue) return null
  const compra = blue.compra == null ? null : Number(blue.compra)
  const venta = blue.venta == null ? null : Number(blue.venta)
  if (referencia === 'compra') return compra
  if (referencia === 'promedio') {
    if (compra === null || venta === null) return compra ?? venta
    return (compra + venta) / 2
  }
  return venta
}

/** El dólar que daría la regla con ese blue (null si no hay con qué calcular). */
export function calcularDolar(
  regla: ReglaDolar,
  blue: Pick<DolarBlue, 'compra' | 'venta'> | null | undefined,
): number | null {
  const base = referenciaDelBlue(regla.referencia, blue)
  if (base === null || !(base > 0)) return null
  let resultado =
    regla.ajusteTipo === 'porcentaje'
      ? base * (1 + regla.ajusteValor / 100)
      : base + regla.ajusteValor
  if (regla.redondeo > 0) resultado = Math.round(resultado / regla.redondeo) * regla.redondeo
  resultado = Math.round(resultado * 100) / 100
  return resultado > 0 ? resultado : null
}

function plata(valor: number): string {
  const fijo = Math.abs(valor).toFixed(2)
  const [entero, decimales] = fijo.split('.')
  const conPuntos = entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return decimales === '00' ? conPuntos : `${conPuntos},${decimales}`
}

/** La regla en una frase: «blue venta + $25, redondeado a $5». */
export function describirRegla(regla: ReglaDolar): string {
  const base =
    regla.referencia === 'compra'
      ? 'blue compra'
      : regla.referencia === 'promedio'
        ? 'promedio del blue'
        : 'blue venta'
  let frase: string
  if (regla.ajusteValor === 0) {
    frase = `${base} tal cual`
  } else {
    const signo = regla.ajusteValor > 0 ? '+' : '−'
    frase =
      regla.ajusteTipo === 'porcentaje'
        ? `${base} ${signo} ${plata(regla.ajusteValor)} %`
        : `${base} ${signo} $${plata(regla.ajusteValor)}`
  }
  if (regla.redondeo > 0 && regla.redondeo !== 1) frase += `, redondeado a $${plata(regla.redondeo)}`
  return frase
}

/** «2 días 3 h», «45 min», «menos de un minuto». */
export function duracionLegible(desdeIso: string, hastaIso: string | null): string {
  const desde = new Date(desdeIso).getTime()
  const hasta = hastaIso ? new Date(hastaIso).getTime() : Date.now()
  if (Number.isNaN(desde) || Number.isNaN(hasta)) return '—'
  const min = Math.max(0, Math.floor((hasta - desde) / 60_000))
  if (min < 1) return 'menos de un minuto'
  if (min < 60) return `${min} min`
  const horas = Math.floor(min / 60)
  if (horas < 24) {
    const resto = min % 60
    return resto ? `${horas} h ${resto} min` : `${horas} h`
  }
  const dias = Math.floor(horas / 24)
  const restoHoras = horas % 24
  return restoHoras ? `${dias} ${dias === 1 ? 'día' : 'días'} ${restoHoras} h` : `${dias} ${dias === 1 ? 'día' : 'días'}`
}
