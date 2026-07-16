import { hoyDMY } from './types'
import { L_COMPRA_CONCEPTO, L_COMPRA_CONT, L_COMPRA_RECIBI, L_COMPRA_SUMA, RUNS_COMPRA } from './textosLegales'

/** Datos del documento "Recibo de compra de equipo/s". */
export interface CompraData {
  cupon: string
  fechaDia: string
  fechaMes: string
  fechaAnio: string
  recibiDe: string
  dni: string
  laSuma: string
  concepto: string
  conceptoExtra: string
  cel: string
  mail: string
  condicion: string
  imei: string
  total: string
}

export function compraVacia(): CompraData {
  const { dia, mes, anio } = hoyDMY()
  return {
    cupon: '',
    fechaDia: dia,
    fechaMes: mes,
    fechaAnio: anio,
    recibiDe: '',
    dni: '',
    laSuma: '',
    concepto: '',
    conceptoExtra: '',
    cel: '',
    mail: '',
    condicion: '',
    imei: '',
    total: '',
  }
}

/** Dimensiones naturales del papel (px), según la grilla del Excel nuevo. */
export const COMPRA_W = 776
export const COMPRA_H = 982

export const COMPRA_TITULO = 'RECIBO DE COMPRA DE EQUIPO/S'

export const COMPRA_LABELS = {
  recibiDe: 'RECIBI DE',
  dni: 'DNI',
  laSuma: 'LA SUMA DE',
  concepto: 'EN CONCEPTO DE LA COMPRA DE EQUIPO/S',
  cel: 'CEL:',
  mail: 'MAIL:',
  condicion: 'CONDICION:',
  imei: 'IMEI:',
  total: 'TOTAL',
} as const

/** Renglones en blanco tal cual el Excel (para el XLSX sin completar). */
export const COMPRA_LINEAS = {
  recibiDe: L_COMPRA_RECIBI,
  laSuma: L_COMPRA_SUMA,
  concepto: L_COMPRA_CONCEPTO,
  cont: L_COMPRA_CONT,
}

/** Texto de garantía con su formato original (títulos en negrita). */
export const COMPRA_GARANTIA = RUNS_COMPRA
