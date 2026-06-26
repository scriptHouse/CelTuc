import { partirGarantia } from './content'
import { hoyDMY } from './types'

/** Datos del documento "Recibo de compra de equipo/s". */
export interface CompraData {
  cupon: string
  fechaDia: string
  fechaMes: string
  fechaAnio: string
  recibiDe: string
  dni: string
  tel: string
  laSuma: string
  concepto: string
  conceptoExtra: string
  conceptoExtra2: string
  condicion: string
  imei: string
  garantia: string
  formaPago: string
  total: string
  obs: string
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
    tel: '',
    laSuma: '',
    concepto: '',
    conceptoExtra: '',
    conceptoExtra2: '',
    condicion: '',
    imei: '',
    garantia: '',
    formaPago: '',
    total: '',
    obs: '',
  }
}

/** Dimensiones naturales del papel (px), basadas en la grilla del Excel. */
export const COMPRA_W = 598
export const COMPRA_H = 596

export const COMPRA_TITULO = 'RECIBO DE COMPRA DE EQUIPO/S'

export const COMPRA_LABELS = {
  recibiDe: 'RECIBI DE',
  dni: 'DNI',
  tel: 'N° TEL',
  laSuma: 'LA SUMA DE',
  concepto: 'EN CONCEPTO DE LA COMPRA DE EQUIPO/S',
  condicion: 'CONDICION:',
  imei: 'IMEI:',
  garantia: 'GARANTIA:',
  formaPago: 'FORMA DE PAGO',
  total: 'TOTAL $',
  firma: 'Firma',
  obs: 'OBS:',
} as const

const COMPRA_GARANTIA_TEXTO =
  'La garantía sólo podrá ser reclamada por la persona que aparece en la orden, presentando una identificación oficial. \n' +
  'Los equipos nuevos cuentan con un (1) año de garantía internacional de Apple, el plazo de la misma comienza a contar desde el día que se hace entrega del equipo. Si la garantía aplica CelTuc se encargara de la logística del equipo, siendo de Apple la decisión si el equipo se repara o se sustituye.\n' +
  'Los equipos usados cuentan con tres (3) meses de garantía, el plazo de la misma comienza a contar desde el día que se hace entrega del equipo. El tiempo para validar si procede o no con la garantía es de hasta tres (3) días. Si la garantía aplica, la reparación de ésta puede demorar hasta 10 días hábiles dependiendo de la disponibilidad de equipos.\n' +
  'Esta garantía NO cubre:\n' +
  'Reembolsos/devoluciones; si el equipo supera el plazo de garantía; daños, roturas, golpes, irregularidades y/o vicios aparentes de fácil e inmediata observación que no fueron verificados dentro del plazo de satisfacción de compra; productos con la faja de seguridad dañada, sin número de serial, serial adulterado o ilegible; daños por fluidos; si fue utilizado con algún accesorio que no pertenece al celular, por ejemplo un cargador de otra marca; si se utilizó algún software no autorizado por el fabricante; defectos o daños ocasionados por testeos, instalaciones, alteraciones y/o modificación de cualquier tipo realizado por otro servicio técnico; robo o hurto del equipo.\n'

export const COMPRA_GARANTIA = partirGarantia(COMPRA_GARANTIA_TEXTO)
export const COMPRA_GARANTIA_TEXTO_PLANO = COMPRA_GARANTIA_TEXTO
