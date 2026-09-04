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
  /** Codigo de desbloqueo del equipo: sin el, el service no puede probarlo. */
  pin: string
  presupuesto: string
  /* `sena` y `pendiente` conservan su nombre historico: en el papel son las
     etiquetas EFECTIVO y LISTA. No se renombran porque el historial guarda el
     formulario con estas claves y los documentos ya archivados las usan. */
  sena: string
  pendiente: string
  observaciones: string
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
    pin: '',
    presupuesto: '',
    sena: '',
    pendiente: '',
    observaciones: '',
  }
}

export const REP_W = 776
/* El alto crece 30px respecto del formato original (989): es exactamente lo
   que ocupan el renglon de OBSERVACIONES y su separacion. Se agranda el papel
   en vez de robarle espacio a la caja de condiciones, que ya venia justa. La
   hoja del PDF no cambia (paginaISO ya la dimensiona con margen de sobra). */
export const REP_H = 1019

export const REP_TITULO = 'GARANTIA REPARACION'

export const REP_LABELS = {
  recibiDe: 'RECIBI DE',
  equipos: 'EL EQUIPO/S',
  falla: 'CON LA SIGUIENTE FALLA/S',
  cel: 'CEL:',
  mail: 'MAIL:',
  imei: 'IMEI:',
  pin: 'PIN:',
  presupuesto: 'PRESUPUESTO:',
  sena: 'EFECTIVO:',
  pendiente: 'LISTA:',
  observaciones: 'OBSERVACIONES:',
} as const

export const REP_LINEAS = {
  recibiDe: L_REP_RECIBI,
  equipos: L_REP_EQUIPO,
  falla: L_REP_FALLA,
}

/** Condiciones de servicio y garantía, con su formato original (títulos y
 *  encabezados de sección en negrita). */
export const REP_GARANTIA = RUNS_REPARACION
