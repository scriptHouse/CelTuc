/**
 * Cómo se resume cada documento para el historial.
 *
 * El archivo guarda el formulario completo en `datos`, pero el renglón del
 * historial necesita cuatro cosas legibles de un vistazo: a quién, con qué
 * referencia, de qué equipo y por cuánto. Cada tipo de documento nombra esos
 * campos distinto, así que acá vive el traductor (uno por plantilla) y el
 * `registry` los engancha.
 */
import type { RecepcionData } from './types'
import type { ReparacionData } from './reparacionContent'
import type { CompraData } from './compraContent'
import type { MayoristaData } from './mayoristaContent'
import type { ExtensionData } from './extensionContent'
import type { SenaData } from './senaContent'
import type { CompraventaData } from './compraventaContent'

/** Los campos con los que se archiva e indexa un documento generado. */
export interface ResumenDocumento {
  /** Cupón, N° de recibo… lo que identifica al papel. */
  referencia?: string
  cliente?: string
  clienteDocumento?: string
  /** Equipo, concepto, IMEI: el "de qué se trata". */
  detalle?: string
  /** Importe normalizado (`"1500000.00"`), o undefined si no se puede leer. */
  total?: string
}

/** Une las partes no vacías con separador, recortando espacios sobrantes. */
function juntar(...partes: (string | undefined | null)[]): string {
  return partes
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(' · ')
}

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

/** Une las partes no vacías con un espacio: una frase corta, no una lista. */
function frase(...partes: (string | undefined | null)[]): string {
  return partes
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(' ')
}

/** IMEI de un equipo, listo para el detalle. */
function imei(...valores: (string | undefined)[]): string {
  const cargados = valores.map((v) => (v ?? '').trim()).filter(Boolean)
  return cargados.length ? `IMEI ${cargados.join(' / ')}` : ''
}

export function resumenRecepcion(d: RecepcionData): ResumenDocumento {
  return {
    referencia: d.cupon,
    cliente: d.recibiDe,
    detalle: juntar(d.equipos, d.falla),
    total: montoDe(d.presupuesto),
  }
}

export function resumenReparacion(d: ReparacionData): ResumenDocumento {
  return {
    referencia: d.cupon,
    cliente: d.recibiDe,
    detalle: juntar(d.equipos, d.falla, imei(d.imei)),
    total: montoDe(d.presupuesto),
  }
}

export function resumenCompra(d: CompraData): ResumenDocumento {
  return {
    referencia: d.cupon,
    cliente: d.recibiDe,
    clienteDocumento: d.dni,
    detalle: juntar(d.concepto, d.conceptoExtra, d.condicion, imei(d.imei)),
    total: montoDe(d.total) ?? montoDe(d.laSuma),
  }
}

export function resumenMayorista(d: MayoristaData): ResumenDocumento {
  const cargados = d.imeis.filter((i) => i.trim())
  return {
    referencia: d.cupon,
    cliente: d.recibiDe,
    clienteDocumento: d.dni,
    detalle: juntar(d.concepto, cargados.length ? `${cargados.length} IMEI` : ''),
    total: montoDe(d.total) ?? montoDe(d.laSuma),
  }
}

export function resumenExtension(d: ExtensionData): ResumenDocumento {
  return {
    referencia: d.cupon,
    cliente: d.recibiDe,
    clienteDocumento: d.dni,
    detalle: juntar(
      d.concepto,
      d.conceptoExtra,
      d.meses.trim() ? `${d.meses.trim()} meses` : '',
      imei(d.imei),
    ),
    total: montoDe(d.total) ?? montoDe(d.laSuma),
  }
}

export function resumenSena(d: SenaData): ResumenDocumento {
  return {
    referencia: d.numeroRecibo,
    cliente: d.recibiDe,
    detalle: d.concepto,
    // `total` es lo señado; `valorTotal` es el precio del equipo.
    total: montoDe(d.total) ?? montoDe(d.laSuma),
  }
}

export function resumenCompraventa(d: CompraventaData): ResumenDocumento {
  return {
    referencia: d.cupon,
    cliente: d.nombreVendedor,
    clienteDocumento: d.dniVendedor,
    detalle: juntar(
      frase(d.marca, d.modelo, d.color),
      imei(d.imei1, d.imei2),
      d.bateria.trim() ? `Batería ${d.bateria.trim()}%` : '',
    ),
    total: montoDe(d.precioNum),
  }
}

/** La garantía de accesorios es texto fijo: no hay nada que resumir. */
export function resumenVacio(): ResumenDocumento {
  return {}
}
