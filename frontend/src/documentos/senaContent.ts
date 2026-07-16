import { hoyDMY } from './types'

/** Datos del comprobante de seña. */
export interface SenaData {
  numeroRecibo: string
  fecha: string
  recibiDe: string
  tel: string
  laSuma: string
  concepto: string
  valorTotal: string
  total: string
}

export function senaVacia(): SenaData {
  const { dia, mes, anio } = hoyDMY()
  return {
    numeroRecibo: '',
    fecha: `${dia}/${mes}/${anio}`,
    recibiDe: '',
    tel: '',
    laSuma: '',
    concepto: '',
    valorTotal: '',
    total: '',
  }
}

export const SENA_W = 518
export const SENA_H = 251

export const SENA = {
  numeroRecibo: 'N° RECIBO',
  fecha: 'FECHA',
  direccion: '(4107) Yerba Buena- Tucumán',
  noFactura: 'DOCUMENTO NO VALIDO COMO FACTURA',
  recibiDe: 'RECIBI DE:',
  tel: 'TEL:',
  laSuma: 'LA SUMA DE:',
  concepto: 'EN CONCEPTO DE:',
  valorTotal: 'VALOR TOTAL:',
  total: 'TOTAL',
  firma: 'FIRMA',
  /** Línea de firma del formato nuevo (guiones bajos, ya no puntos). */
  lineaFirma: '__________________',
  disclaimer:
    'El cliente entiende y acepta que una seña menor al 50% no congela no asegura el precio del equipo, solo asegura el stock del mismo',
} as const
