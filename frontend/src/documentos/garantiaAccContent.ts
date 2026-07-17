import { RUNS_ACCESORIOS } from './textosLegales'

/** "Garantía de accesorios" no tiene campos: es un comprobante de texto fijo. */
export type GAccData = Record<string, never>

export function gAccVacia(): GAccData {
  return {}
}

export const GACC_W = 470
export const GACC_H = 318

/** Título tal cual el Excel nuevo (con su doble espacio). */
export const GACC_TITULO = 'DOCUMENTO  VALIDO COMO GARANTIA'

export const GACC_RUNS = RUNS_ACCESORIOS
