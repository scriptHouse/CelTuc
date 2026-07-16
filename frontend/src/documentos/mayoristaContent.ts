import { hoyDMY } from './types'
import { L_MAY_CEL_SUMA, L_MAY_CONCEPTO, L_MAY_RECIBI, RUNS_MAYORISTA } from './textosLegales'

/** Datos del documento "Recibo de compra mayorista". */
export interface MayoristaData {
  cupon: string
  fechaDia: string
  fechaMes: string
  fechaAnio: string
  recibiDe: string
  dni: string
  celular: string
  laSuma: string
  concepto: string
  /** Diez IMEI: los seis primeros van en la caja izquierda y los cuatro últimos a la derecha. */
  imeis: string[]
  total: string
}

export function mayoristaVacia(): MayoristaData {
  const { dia, mes, anio } = hoyDMY()
  return {
    cupon: '',
    fechaDia: dia,
    fechaMes: mes,
    fechaAnio: anio,
    recibiDe: '',
    dni: '',
    celular: '',
    laSuma: '',
    concepto: '',
    imeis: Array(10).fill(''),
    total: '',
  }
}

export const MAY_W = 776
export const MAY_H = 964

export const MAY_TITULO = 'RECIBO DE COMPRA MAYORISTA'

export const MAY_LABELS = {
  recibiDe: 'RECIBI DE',
  dni: 'DNI',
  celular: 'CELULAR',
  laSuma: 'LA SUMA DE',
  concepto: 'EN CONCEPTO DE LA COMPRA DE EQUIPO/S',
  imei: 'IMEI:',
  total: 'TOTAL',
} as const

export const MAY_LINEAS = {
  recibiDe: L_MAY_RECIBI,
  celSuma: L_MAY_CEL_SUMA,
  concepto: L_MAY_CONCEPTO,
}

/** Texto de garantía mayorista con su formato original (títulos en negrita). */
export const MAY_GARANTIA = RUNS_MAYORISTA
