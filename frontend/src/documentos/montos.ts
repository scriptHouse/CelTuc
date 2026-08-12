/**
 * Cómo se lee un importe escrito a mano.
 *
 * Vive aparte (y no dentro de `resumen.ts`) porque lo necesitan las dos puntas:
 * el historial, para archivar el importe del documento, y los presupuestos,
 * para calcular totales y cuotas. Tenerlo en un módulo propio evita que
 * `resumen.ts` y `presupuestoComun.ts` se importen en círculo.
 */

/**
 * Lee un importe escrito a mano y lo normaliza a `"1234.50"`.
 *
 * Los campos de plata son texto libre, así que llegan como `$ 1.500.000`,
 * `1500000`, `1.500,50` o incluso con una nota al lado. La regla: el último
 * separador cuenta como decimal solo si le siguen una o dos cifras; el resto
 * son separadores de miles. Si no hay un número legible, devuelve undefined y
 * el documento se archiva sin importe (nunca con uno inventado).
 */
export function montoDe(texto: string | undefined | null): string | undefined {
  if (!texto) return undefined
  const limpio = String(texto).replace(/[^\d.,]/g, '')
  if (!/\d/.test(limpio)) return undefined

  const corte = Math.max(limpio.lastIndexOf(','), limpio.lastIndexOf('.'))
  let parteEntera = limpio
  let decimales = ''
  if (corte >= 0) {
    const cola = limpio.slice(corte + 1)
    if (cola.length >= 1 && cola.length <= 2 && /^\d+$/.test(cola)) {
      parteEntera = limpio.slice(0, corte)
      decimales = cola
    }
  }

  const digitos = parteEntera.replace(/\D/g, '')
  // El backend guarda hasta 12 enteros + 2 decimales: más que eso no es un precio.
  if (!digitos || digitos.length > 12) return undefined
  const valor = Number(`${digitos}.${decimales || '0'}`)
  return Number.isFinite(valor) ? valor.toFixed(2) : undefined
}
