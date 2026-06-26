import type { Run } from './kit'

/** "Garantía de accesorios" no tiene campos: es un comprobante de texto fijo. */
export type GAccData = Record<string, never>

export function gAccVacia(): GAccData {
  return {}
}

export const GACC_W = 470
export const GACC_H = 322

export const GACC_TITULO = 'GARANTIA DE ACCESORIOS'

export const GACC_RUNS: Run[] = [
  { t: 'Documento válido como garantía. ', bold: true },
  {
    t:
      '\nLa garantía sólo podrá ser reclamada por la persona que aparece en la orden, presentando una identificación oficial. El tiempo para validar si procede o no con la garantía es de hasta tres (3) días. Si la garantía aplica, el cambio del accesorio puede demorar hasta 10 días hábiles dependiendo de la disponibilidad del mismo. \n' +
      'Todos accesorios (auriculares-cables-fuentes-periféricos-etc.)cuentan con sesenta (30) días de garantía, el plazo de la misma comienza a contar desde el día que se hace entrega del accesorio/s.\n',
  },
  { t: 'Esta garantía NO cubre:', bold: true },
  {
    t:
      '\nReembolsos/devoluciones; si el accesorio/s supera el plazo de garantía; daños, roturas, golpes, irregularidades y/o vicios aparentes de fácil e inmediata observación que no fueron verificados dentro del plazo de satisfacción de compra; daños por fluidos; daños derivados del uso anormal, o uso contrario al indicado en el manual de uso que incluye el kit de venta. robo o hurto del equipo.',
  },
]
