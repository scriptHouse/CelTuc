import { ahoraFechaHora } from './types'
import { RUNS_ACCESORIOS } from './textosLegales'

/**
 * "Garantía de accesorios" es un comprobante de texto fijo: su único dato es
 * la fecha y hora de emisión, que va al pie. Se prefija con la de ahora y
 * queda editable (para reimprimir un comprobante de otro momento).
 */
export interface GAccData {
  fechaHora: string
}

export function gAccVacia(): GAccData {
  return { fechaHora: ahoraFechaHora() }
}

export const GACC_W = 470
export const GACC_H = 318

/** Título tal cual el Excel nuevo (con su doble espacio). */
export const GACC_TITULO = 'DOCUMENTO  VALIDO COMO GARANTIA'

/** Etiqueta del pie. Corta a propósito: el renglón tiene que ser discreto. */
export const GACC_FECHA_LABEL = 'FECHA Y HORA:'

export const GACC_RUNS = RUNS_ACCESORIOS
