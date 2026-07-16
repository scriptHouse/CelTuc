import { hoyDMY } from './types'
import { L_REP_EQUIPO, L_REP_FALLA, L_REP_RECIBI, RUNS_REPARACION } from './textosLegales'

/** Datos del documento "Garantía / Reparación" (formato nuevo). */
export interface ReparacionData {
  cupon: string
  fechaDia: string
  fechaMes: string
  fechaAnio: string
  recibiDe: string
  equipos: string
  falla: string
  cel: string
  mail: string
  imei: string
  presupuesto: string
  sena: string
  pendiente: string
}

export function reparacionVacia(): ReparacionData {
  const { dia, mes, anio } = hoyDMY()
  return {
    cupon: '',
    fechaDia: dia,
    fechaMes: mes,
    fechaAnio: anio,
    recibiDe: '',
    equipos: '',
    falla: '',
    cel: '',
    mail: '',
    imei: '',
    presupuesto: '',
    sena: '',
    pendiente: '',
  }
}

export const REP_W = 776
export const REP_H = 989

export const REP_TITULO = 'GARANTIA REPARACION'

export const REP_LABELS = {
  recibiDe: 'RECIBI DE',
  equipos: 'EL EQUIPO/S',
  falla: 'CON LA SIGUIENTE FALLA/S',
  cel: 'CEL:',
  mail: 'MAIL:',
  imei: 'IMEI:',
  presupuesto: 'PRESUPUESTO:',
  sena: 'SEÑA:',
  pendiente: 'PENDIENTE:',
} as const

export const REP_LINEAS = {
  recibiDe: L_REP_RECIBI,
  equipos: L_REP_EQUIPO,
  falla: L_REP_FALLA,
}

/** Condiciones de servicio y garantía, con su formato original (títulos y
 *  encabezados de sección en negrita). */
export const REP_GARANTIA = RUNS_REPARACION
