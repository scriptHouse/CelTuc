import { hoyDMY } from './types'
import {
  CV_CUARTA as T_CUARTA,
  CV_INTRO as T_INTRO,
  CV_PRIMERA as T_PRIMERA,
  CV_QUINTA as T_QUINTA,
  CV_SEGUNDA as T_SEGUNDA,
  CV_SEXTA as T_SEXTA,
  CV_TERCERA as T_TERCERA,
  L_CV_COLOR,
  L_CV_IMEI1,
  L_CV_IMEI2,
  L_CV_MARCA,
  L_CV_MODELO,
  L_CV_OBS,
} from './textosLegales'

/** Datos del contrato de compraventa (usados). El comprador es fijo (CelTuc). */
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
  precioNum: string
  precioLetras: string
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
    precioNum: '',
    precioLetras: '',
  }
}

export const CV_W = 776
export const CV_H = 995

export const CV_TITULO = 'CONTRATO DE COMPRA VENTA DE EQUIPO/S (USADOS)'

/** Un segmento de una cláusula: texto fijo o un campo rellenable. */
export type Seg = { t: string } | { f: keyof CompraventaData; w: number; aria: string }

export interface Clausula {
  /** Encabezado en negrita (p. ej. "PRIMERA – Identificación del equipo"). */
  prefix: string
  segs: Seg[]
}

/**
 * Arma una cláusula a partir del texto literal del Excel: separa el encabezado
 * en negrita y reemplaza cada serie de guiones bajos por un campo rellenable.
 */
function clausula(texto: string, prefix: string, campos: Seg[] = []): Clausula {
  const cuerpo = texto.slice(prefix.length)
  const partes = cuerpo.split(/_{3,}/)
  const segs: Seg[] = []
  partes.forEach((p, i) => {
    segs.push({ t: p })
    if (i < campos.length) segs.push(campos[i])
  })
  return { prefix, segs }
}

export const CV_INTRO = T_INTRO

export const CV_PRIMERA = clausula(T_PRIMERA, 'PRIMERA – Identificación del equipo', [
  { f: 'nombreVendedor', w: 260, aria: 'Nombre del vendedor' },
  { f: 'dniVendedor', w: 130, aria: 'DNI del vendedor' },
])
export const CV_SEGUNDA = clausula(T_SEGUNDA, 'SEGUNDA – Objeto')
export const CV_TERCERA = clausula(T_TERCERA, 'TERCERA – Precio', [
  { f: 'precioNum', w: 150, aria: 'Precio (números)' },
  { f: 'precioLetras', w: 250, aria: 'Precio (en letras)' },
])
export const CV_CUARTA = clausula(T_CUARTA, 'CUARTA – Estado del equipo')
export const CV_QUINTA = clausula(T_QUINTA, 'QUINTA – Responsabilidad por bloqueo')
export const CV_SEXTA = clausula(T_SEXTA, 'SEXTA – Declaraciones del vendedor')

export const CV_CLAUSULAS_FIJAS = [CV_SEGUNDA, CV_CUARTA, CV_QUINTA, CV_SEXTA]

/** Etiqueta de cada característica (lo que va antes de los guiones del Excel). */
function etiqueta(linea: string): string {
  return linea.split(/_{3,}/)[0]
}

export const CV_CARACTERISTICAS = [
  { label: etiqueta(L_CV_MARCA), f: 'marca' as const },
  { label: etiqueta(L_CV_MODELO), f: 'modelo' as const },
  { label: etiqueta(L_CV_COLOR), f: 'color' as const },
  { label: etiqueta(L_CV_IMEI1), f: 'imei1' as const },
  { label: etiqueta(L_CV_IMEI2), f: 'imei2' as const },
  { label: etiqueta(L_CV_OBS), f: 'obs' as const },
]

/** Pie de firmas tal cual el Excel nuevo. */
export const CV_FIRMAS = {
  firmaIzq: 'FIRMA COMPRADOR',
  firmaDer: 'FIRMA VENDEDOR',
  aclaracionIzq: 'ACLARACION COMPRADOR',
  aclaracionDer: 'ACLARACION VENDEDOR',
  /** Aclaración preimpresa en el Excel nuevo. */
  aclaracionDerValor: 'ESTEBAN NICOLAS PADROS',
} as const

/** Texto plano de una cláusula con los valores incrustados (para PDF/XLSX). */
export function clausulaPlana(c: Clausula, d: CompraventaData): string {
  return c.prefix + c.segs.map((s) => ('t' in s ? s.t : d[s.f] || '______')).join('')
}
