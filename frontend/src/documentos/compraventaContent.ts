import { hoyDMY } from './types'

/** Datos del contrato de compraventa (usados). */
export interface CompraventaData {
  cupon: string
  fechaDia: string
  fechaMes: string
  fechaAnio: string
  nombreVendedor: string
  dniVendedor: string
  marca: string
  modelo: string
  color: string
  imei1: string
  imei2: string
  obs: string
  nombreComprador: string
  dniComprador: string
  precio: string
}

export function compraventaVacia(): CompraventaData {
  const { dia, mes, anio } = hoyDMY()
  return {
    cupon: '',
    fechaDia: dia,
    fechaMes: mes,
    fechaAnio: anio,
    nombreVendedor: '',
    dniVendedor: '',
    marca: '',
    modelo: '',
    color: '',
    imei1: '',
    imei2: '',
    obs: '',
    nombreComprador: '',
    dniComprador: '',
    precio: '',
  }
}

export const CV_W = 740
export const CV_H = 786

export const CV_TITULO = 'CONTRATO DE COMPRA VENTA DE EQUIPO/S (USADOS)'

/** Un segmento de una cláusula: texto fijo o un campo rellenable. */
export type Seg = { t: string } | { f: keyof CompraventaData; w: number; aria: string }

export interface Clausula {
  prefix?: string
  segs: Seg[]
}

export const CV_INTRO =
  'Por el presente documento, celebramos entre los suscriptos un contrato de Compraventa de un teléfono celular, en base a los siguientes términos:'

export const CV_PRIMERA: Clausula = {
  prefix: 'PRIMERA:',
  segs: [
    { t: ' El señor/a ' },
    { f: 'nombreVendedor', w: 220, aria: 'Nombre del vendedor' },
    { t: ' mayor de edad, identificado con el DNI ' },
    { f: 'dniVendedor', w: 110, aria: 'DNI del vendedor' },
    { t: ' es propietario de un teléfono celular, con las siguientes: características:' },
  ],
}

export const CV_SEGUNDA: Clausula = {
  prefix: 'SEGUNDA:',
  segs: [
    { t: ' Ya realizada la descripción del equipo, el vendedor le vende al comprador ' },
    { f: 'nombreComprador', w: 220, aria: 'Nombre del comprador' },
    { t: ' identificado con el DNI ' },
    { f: 'dniComprador', w: 110, aria: 'DNI del comprador' },
    { t: ' , el teléfono celular que se ha descrito anteriormente.' },
  ],
}

export const CV_TERCERA: Clausula = {
  prefix: 'TERCERA:',
  segs: [
    { t: ' El precio de venta pactado por ambas partes es por la cantidad de $' },
    { f: 'precio', w: 120, aria: 'Precio' },
    { t: ' pagados en forma de efectivo, entregándole el derecho de dominio del teléfono celular descripto anteriormente, respetando los términos de este contrato.' },
  ],
}

export const CV_CUARTA: Clausula = {
  prefix: 'CUARTA:',
  segs: [
    {
      t: ' El vendedor, declara que el teléfono celular, no tiene problemas de ninguna naturaleza, ni ningún inconveniente para su posterior uso. Dejando en claro que el equipo telefónico no fue utilizado para ningún tipo de delito, eximiendo al comprador de cualquier costo adicional (aduana - impuestos). El comprador, declara saber el estado en el que se encuentra el equipo que adquiere, por lo que una vez finalizada la venta, este no podrá reclamar por su mal funcionamiento.',
    },
  ],
}

export const CV_QUINTA: Clausula = {
  prefix: 'QUINTA: ',
  segs: [
    {
      t: 'El vendedor, asume responsabilidad ante cualquier bloqueo del equipo por parte de ENACOM, asumiendo el compromiso del mismo. Ya que dicho bloqueo, estaría asociado a la línea que anteriormente operaba en el equipo.',
    },
  ],
}

export const CV_CARACTERISTICAS = [
  { label: 'MARCA:', f: 'marca' as const },
  { label: 'MODELO:', f: 'modelo' as const },
  { label: 'COLOR:', f: 'color' as const },
  { label: 'IMEI 1:', f: 'imei1' as const },
  { label: 'IMEI 2:', f: 'imei2' as const },
  { label: 'OBS:', f: 'obs' as const },
]

/** Texto plano de una cláusula con los valores incrustados (para PDF/XLSX). */
export function clausulaPlana(c: Clausula, d: CompraventaData): string {
  const cuerpo = c.segs
    .map((s) => ('t' in s ? s.t : (d[s.f] || '______')))
    .join('')
  return (c.prefix ?? '') + cuerpo
}
