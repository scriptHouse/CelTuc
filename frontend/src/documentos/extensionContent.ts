import { hoyDMY } from './types'
import { L_EXT_CONCEPTO, L_EXT_RECIBI, L_EXT_SUMA, RUNS_EXTENSION } from './textosLegales'

/** Datos del documento "Extensión de garantía" (formato nuevo). */
export interface ExtensionData {
  cupon: string
  fechaDia: string
  fechaMes: string
  fechaAnio: string
  recibiDe: string
  dni: string
  laSuma: string
  concepto: string
  conceptoExtra: string
  meses: string
  cel: string
  mail: string
  condicion: string
  imei: string
  total: string
}

export function extensionVacia(): ExtensionData {
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
    meses: '',
    cel: '',
    mail: '',
    condicion: '',
    imei: '',
    total: '',
  }
}

export const EXT_W = 776
export const EXT_H = 921

export const EXT_TITULO = 'EXTENCION DE GARANTIA'

export const EXT_LABELS = {
  recibiDe: 'RECIBI DE',
  dni: 'DNI',
  laSuma: 'LA SUMA DE',
  concepto: 'EN CONCEPTO DE EXTENCION DE GARANTIA DEL EQUIPO',
  porN: 'POR Nº',
  meses: 'MESES A PARTIR DE LA FECHA QUE SE MUESTA EN ESTE RECIBO.',
  cel: 'CEL:',
  mail: 'MAIL:',
  condicion: 'CONDICION:',
  imei: 'IMEI:',
  total: 'TOTAL',
} as const

export const EXT_LINEAS = {
  recibiDe: L_EXT_RECIBI,
  laSuma: L_EXT_SUMA,
  concepto: L_EXT_CONCEPTO,
}

/** Texto de la extensión con su formato original (título en negrita). */
export const EXT_GARANTIA = RUNS_EXTENSION
