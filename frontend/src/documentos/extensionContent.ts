import { partirGarantia } from './content'
import { hoyDMY } from './types'

/** Datos del documento "Extensión de garantía". */
export interface ExtensionData {
  cupon: string
  fechaDia: string
  fechaMes: string
  fechaAnio: string
  nombre: string
  dni: string
  tel: string
  dias: string
  concepto: string
  conceptoExtra: string
  imei: string
  vendedor: string
  formaPago: string
  total: string
}

export function extensionVacia(): ExtensionData {
  const { dia, mes, anio } = hoyDMY()
  return {
    cupon: '',
    fechaDia: dia,
    fechaMes: mes,
    fechaAnio: anio,
    nombre: '',
    dni: '',
    tel: '',
    dias: '',
    concepto: '',
    conceptoExtra: '',
    imei: '',
    vendedor: '',
    formaPago: '',
    total: '',
  }
}

export const EXT_W = 598
export const EXT_H = 596

export const EXT_TITULO = 'EXTENCION GARANTIA'

export const EXT_LABELS = {
  nombre: 'NOMBRE',
  dni: 'DNI',
  tel: 'N° TEL',
  extiende1: 'SE EXTIENDE LA GARANTIA POR UN PLAZO DE',
  extiende2: 'DIAS EN',
  concepto: 'COCEPTO DE COMPRA DEL EQUIPO',
  imei: 'IMEI:',
  vendedor: 'VENDEDOR:',
  formaPago: 'FORMA DE PAGO',
  total: 'TOTAL $',
  firma: 'Firma',
} as const

const EXT_GARANTIA_TEXTO =
  'Documento valido como extensión de garantía. La misma empieza a correr el día que culmina la garantía de compra (3 meses), extendiéndose por 45 o 90 días según lo indica este documento. ' +
  'Esta garantía sólo podrá ser reclamada por la persona que aparece en la orden, presentando una identificación oficial. El tiempo para validar si procede o no con la garantía es de hasta tres (3) días. Si la garantía aplica, la reparación de ésta puede demorar hasta 10 días hábiles dependiendo de la disponibilidad de equipos.\n' +
  'Esta garantía NO cubre:\n' +
  'Reembolsos/devoluciones; si el equipo supera el plazo de garantía; daños, roturas, golpes, irregularidades y/o vicios aparentes de fácil e inmediata observación que no fueron verificados dentro del plazo de satisfacción de compra; productos con la faja de seguridad dañada, sin número de serial, serial adulterado o ilegible; daños por fluidos; si fue utilizado con algún accesorio que no pertenece al celular, por ejemplo un cargador de otra marca; si se utilizó algún software no autorizado por el fabricante; defectos o daños ocasionados por testeos, instalaciones, alteraciones y/o modificación de cualquier tipo realizado por otro servicio técnico; robo o hurto del equipo. Cabe destacar que si se pierde la garantía de compra (3 meses) por alguna de las circunstancias mencionadas anteriormente, la extensión de garantía también queda anulada.\n'

export const EXT_GARANTIA = partirGarantia(EXT_GARANTIA_TEXTO)
