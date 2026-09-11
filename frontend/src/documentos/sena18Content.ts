import { hoyDMY } from './types'
import type { Run } from './kit'

/**
 * Contenido fijo del documento "Recibo de seña iPhone 18", extraído
 * literalmente de la planilla `Seña 18.xlsx`.
 *
 * Los textos viven acá y no en `textosLegales.ts` porque aquel archivo se
 * generó desde OTRO libro ("DOCUMENTOS SISTEMA NUEVO.xlsx") y avisa que no se
 * edita a mano: si algún día se regenera, lo de este papel no se pierde.
 */

/** Datos que el usuario carga en el recibo de seña de iPhone 18. */
export interface Sena18Data {
  cupon: string
  fechaDia: string
  fechaMes: string
  fechaAnio: string
  recibiDe: string
  dni: string
  laSuma: string
  concepto: string
  conceptoExtra: string
  /** Importe señado (lo que el cliente YA pagó). */
  sena: string
  tipoCambio: string
  /** Lo que queda por pagar al retirar el equipo. */
  saldo: string
  /** Equipo que el cliente entrega en parte de pago (lista del Excel). */
  entrega: string
  entregaPrecio: string
  /** Los cuatro colores, por orden de preferencia (lista del Excel). */
  color1: string
  color2: string
  color3: string
  color4: string
}

export function sena18Vacia(): Sena18Data {
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
    sena: '',
    tipoCambio: '',
    saldo: '',
    entrega: '',
    entregaPrecio: '',
    color1: '',
    color2: '',
    color3: '',
    color4: '',
  }
}

/** Ancho natural del papel (px): la grilla estándar del Excel nuevo. */
export const SENA18_W = 776
/* El Excel mide 42 filas (836 px), pero sus notas están tipeadas en Aptos
   Narrow —una tipografía condensada— y las nuestras (Inter en pantalla,
   Helvetica en el PDF) piden un renglón más cada una. Se agranda el papel en
   vez de recortar el texto: la hoja del PDF no cambia, `paginaISO` la
   dimensiona sola. Las cuatro notas crecen con su contenido, así que el sobrante
   queda en la caja del pie. */
export const SENA18_H = 920

export const SENA18_TITULO = 'RECIBO DE SEÑA IPHONE 18'

export const SENA18_LABELS = {
  recibiDe: 'RECIBI DE',
  dni: 'DNI',
  laSuma: 'LA SUMA DE',
  concepto: 'EN CONCEPTO DE LA SEÑA DE EQUIPO/S',
  sena: 'SEÑA',
  tipoCambio: 'TIPO DE CAMBIO',
  saldo: 'SALDO',
  entrega: 'ENTREGA COMO  FORMA DE PAGO:',
  precio: 'Precio',
  color1: 'COLOR 1',
  color2: 'COLOR 2',
  color3: 'COLOR 3',
  color4: 'COLOR 4',
} as const

/** Renglones en blanco tal cual el Excel (para el XLSX sin completar). */
export const SENA18_LINEAS = {
  recibiDe:
    'RECIBI DE __________________________________________________DNI________________________________________________________________',
  laSuma:
    'LA SUMA DE  ___________________________________________________________________________________________________________________',
  concepto:
    'EN CONCEPTO DE LA SEÑA DE EQUIPO/S________________________________________________________________________________________________________',
  cont:
    '________________________________________________________________________________________________________________________________________________________________________________',
}

/**
 * Las cuatro notas del papel, en el orden en que aparecen. La del comprobante
 * (la última, antes de las firmas) trae un salto de párrafo donde el Excel
 * tenía un hueco de espacios: en el papel se leen como dos párrafos.
 */
export const SENA18_NOTAS = {
  cotizacion:
    'LA PRESENTE COTIZACIÓN ES APROXIMADA Y DE CARÁCTER ORIENTATIVO. LA COTIZACIÓN FINAL SERÁ REALIZADA AL MOMENTO DE LA ENTREGA DEL EQUIPO, PUDIENDO EXISTIR VARIACIONES RESPECTO DEL IMPORTE INICIALMENTE INFORMADO.',
  colores:
    'EL CLIENTE DEBERA SELECCIONAR 3 COLORES, INDICANDO EL ORDEN DE PRIORIDAD DE SU PREFERENCIA, EN CASO DE QUERER UN COLOR ESPECIFICO EL CLIENTE ENTIENDE Y ACEPTA QUE DICHA SOLICITUD PUEDE AFECTAR EL PLAZO DE ENTREGA DEL EQUIPO. EN CASO DE SOLICITAR UN COLOR ESPECÍFICO QUE NO SE ENCUENTRE DISPONIBLE, EL CLIENTE ACEPTA Y COMPRENDE QUE DICHA SOLICITUD PUEDE AFECTAR EL PLAZO DE ENTREGA DEL PRODUCTO.',
  plazo:
    'EL PLAZO DE ENTREGA DE LOS EQUIPOS PODRÁ VARIAR ENTRE 7 Y 10 DÍAS, DEPENDIENDO DE LA DISPONIBILIDAD DE LOS COLORES SELECCIONADOS; PUDIENDO EXTENDESE LA MISMA EN CASO DE ELEGIR UN COLOR ESPECIFICO.',
  comprobante:
    'LA PRESENTE RECIBO DE SEÑA CONSTITUYE EL COMPROBANTE VÁLIDO PARA SOLICITAR EL EQUIPO Y DEBERÁ SER PRESENTADO JUNTO CON UN DOCUMENTO DE IDENTIDAD DEL TITULAR. EL EQUIPO PODRÁ SER RETIRADO ÚNICAMENTE POR LA PERSONA QUE FIGURE COMO TITULAR EN LA DOCUMENTACIÓN DE SEÑA DEL EQUIPO.\n\nESTE COMPROBANTE ES VÁLIDO COMO CONSTANCIA DE LA SEÑA ABONADA Y REPRESENTA UN COMPROMISO DE COMPRA POR PARTE DEL CLIENTE. LA SEÑA NO SERÁ REEMBOLSABLE EN CASO DE CANCELACIÓN, RENUNCIA O DESISTIMIENTO DE LA COMPRA POR PARTE DEL CLIENTE.',
} as const

/**
 * La nota del comprobante como `Run[]`: es la que va en la caja del pie, y el
 * esqueleto de los documentos (`DocShell`) la pide en ese formato. Las otras
 * tres se pintan como texto plano, porque no llevan negritas.
 */
export const SENA18_RUNS_COMPROBANTE: Run[] = [{ t: SENA18_NOTAS.comprobante }]

/**
 * Equipos que se pueden entregar en parte de pago (lista desplegable del
 * Excel, hoja `Hoja1`, columna AI). Tal cual la planilla, en su mismo orden.
 */
export const SENA18_EQUIPOS = [
  'iPhone 11 128GB',
  'iPhone 11 Pro 64GB',
  'iPhone 11 Pro 256GB',
  'iPhone 11 Pro Max 64GB',
  'iPhone 11 Pro Max 256GB',
  'iPhone 12 mini',
  'iPhone 12 64GB',
  'iPhone 12 128GB',
  'iPhone 12 Pro 128GB',
  'iPhone 12 Pro 256GB',
  'iPhone 12 Pro 512GB',
  'iPhone 12 Pro Max 256GB',
  'iPhone 12 Pro Max 512GB',
  'iPhone 13 mini 128GB',
  'iPhone 13 mini 256GB',
  'iPhone 13 128GB',
  'iPhone 13 256GB',
  'iPhone 13 Pro 128GB',
  'iPhone 13 Pro 256GB',
  'iPhone Pro 512GB',
  'iPhone 13 Pro Max 128GB',
  'iPhone 13 Pro Max 256GB',
  'iPhone 13 Pro Max 512GB',
  'iPhone 14 128GB',
  'iPhone 14 256GB',
  'iPhone 14 Plus 128GB',
  'iPhone 14 Plus 256GB',
  'iPhone 14 Pro 128GB',
  'iPhone 14 Pro 256GB',
  'iPhone 14 Pro 512GB',
  'iPhone 14 Pro Max 128GB',
  'iPhone 14 Pro Max 256GB',
  'iPhone 14 Pro Max 512GB',
  'iPhone 15 128GB',
  'iPhone 15 256GB',
  'iPhone 15 Plus 128GB',
  'iPhone 15 Plus 256GB',
  'iPhone 15 Pro 128GB',
  'iPhone 15 Pro 256GB',
  'iPhone 15 Pro 512GB',
  'iPhone 15 Pro Max 256GB',
  'iPhone 15 Pro Max 512GB',
  'iPhone 16 128GB',
  'iPhone 16 256GB',
  'iPhone 16 Pro 128GB',
  'iPhone 16 Pro 256GB',
  'iPhone 16 Pro Max 256GB',
  'iPhone 16 Pro Max 512GB',
  'iPhone 17 256GB',
  'iPhone 17 512GB',
  'iPhone 17 Pro 256GB',
  'iPhone 17 Pro 512GB',
  'iPhone 17 Pro Max 256GB',
  'iPhone 17 Pro Max 512GB',
] as const

/** Colores elegibles (lista desplegable del Excel, columna AL). */
export const SENA18_COLORES = ['Black', 'Bunbundry (Bordo)', 'Glaciar', 'Silver'] as const

/** Los cuatro renglones de color: su etiqueta y el campo que completan. */
export const SENA18_CAMPOS_COLOR: ReadonlyArray<{ campo: keyof Sena18Data; label: string }> = [
  { campo: 'color1', label: SENA18_LABELS.color1 },
  { campo: 'color2', label: SENA18_LABELS.color2 },
  { campo: 'color3', label: SENA18_LABELS.color3 },
  { campo: 'color4', label: SENA18_LABELS.color4 },
]
