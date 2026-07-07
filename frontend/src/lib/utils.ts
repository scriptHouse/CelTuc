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

/** Palabras normalizadas de un t\u00e9rmino. "L\u00ednea 13" \u2192 ['linea', '13']. */
function palabrasBusqueda(termino: string): string[] {
  return normalizarBusqueda(termino).split(/\s+/).filter(Boolean)
}

/**
 * Coincidencia tolerante para buscadores: todas las palabras del t\u00e9rmino
 * deben aparecer en el texto, en cualquier orden y posici\u00f3n ("pro 13"
 * encuentra "iPhone 13 Pro Max"). Tolerante a acentos y may\u00fasculas v\u00eda
 * `normalizarBusqueda`. Con t\u00e9rmino vac\u00edo devuelve true.
 */
export function coincideBusqueda(texto: string, termino: string): boolean {
  const palabras = palabrasBusqueda(termino)
  if (!palabras.length) return true
  const objetivo = normalizarBusqueda(texto)
  return palabras.every((palabra) => objetivo.includes(palabra))
}

/**
 * Rangos [inicio, fin) del texto ORIGINAL donde coinciden las palabras del
 * t\u00e9rmino, para resaltar coincidencias. Se normaliza car\u00e1cter por car\u00e1cter
 * guardando el \u00edndice de origen, as\u00ed "L\u00ednea" se resalta completo aunque se
 * busque "linea" (la normalizaci\u00f3n puede cambiar el largo del texto).
 * Los rangos que se tocan o solapan se devuelven unidos y ordenados.
 */
export function rangosBusqueda(texto: string, termino: string): Array<[number, number]> {
  const palabras = palabrasBusqueda(termino)
  if (!palabras.length) return []

  let norm = ''
  const origen: number[] = []
  for (let i = 0; i < texto.length; i++) {
    for (const ch of normalizarBusqueda(texto[i])) {
      norm += ch
      origen.push(i)
    }
  }

  const rangos: Array<[number, number]> = []
  for (const palabra of palabras) {
    let idx = norm.indexOf(palabra)
    while (idx !== -1) {
      rangos.push([origen[idx], origen[idx + palabra.length - 1] + 1])
      idx = norm.indexOf(palabra, idx + palabra.length)
    }
  }

  rangos.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const unidos: Array<[number, number]> = []
  for (const [inicio, fin] of rangos) {
    const ultimo = unidos[unidos.length - 1]
    if (ultimo && inicio <= ultimo[1]) ultimo[1] = Math.max(ultimo[1], fin)
    else unidos.push([inicio, fin])
  }
  return unidos
}
