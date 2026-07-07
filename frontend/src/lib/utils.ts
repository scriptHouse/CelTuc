import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { CSSProperties } from 'react'

/**
 * Une clases de Tailwind resolviendo conflictos. Patrón estándar de shadcn/ui.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Estilo para la entrada escalonada (`ct-stagger-item` / `ct-stagger-fade`).
 * Devuelve la variable CSS `--ct-index` que controla el retardo de cada item.
 * El índice se acota (`cap`) para que, con muchas filas, el efecto no se demore.
 *
 * Uso: <tr className="ct-stagger-fade" style={ctStagger(i)} />
 */
export function ctStagger(index: number, cap = 14): CSSProperties {
  return { '--ct-index': Math.min(index, cap) } as CSSProperties
}

/** Retardo de entrada para secciones con `ct-rise`. */
export function ctDelay(ms: number): CSSProperties {
  return { '--ct-delay': `${ms}ms` } as CSSProperties
}

/**
 * Normaliza texto para búsqueda: minúsculas y sin acentos/diacríticos.
 * Se aplica tanto al término buscado como al texto donde se busca, así
 * "Linea" encuentra "Línea" (y viceversa) en todos los buscadores.
 */
export function normalizarBusqueda(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}
