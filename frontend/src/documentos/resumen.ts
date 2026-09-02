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
import {
  totalesEquipo,
  totalesService,
  type PresupuestoEquipoData,
  type PresupuestoServiceData,
} from './presupuestoComun'
import { montoDe } from './montos'

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

// El lector de importes vive en `montos.ts` (lo comparten el historial y los
// presupuestos); se reexporta acá porque este módulo era su lugar original.
export { montoDe }

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
    // El importe del historial es LO SEÑADO (el campo "VALOR DE SEÑA"), no el
    // campo `total`, que en el papel es el "SALDO A PAGAR": archivar el saldo
    // mostraria en el historial lo que el cliente NO pagó.
    total: montoDe(d.valorTotal) ?? montoDe(d.laSuma),
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

/**
 * Presupuesto de equipo. El importe que se archiva es el TOTAL EN PESOS (lo que
 * el cliente termina pagando), no el precio de lista en dólares: es el número
 * con el que después se busca el presupuesto en el historial.
 */
export function resumenPresupuestoEquipo(d: PresupuestoEquipoData): ResumenDocumento {
  const { totalUsd, totalPesos } = totalesEquipo(d)
  return {
    referencia: d.numero,
    cliente: d.cliente,
    detalle: juntar(
      frase(d.equipo, d.condicion ? `(${d.condicion})` : ''),
      d.entrega.trim() ? `entrega ${d.entrega.trim()}` : '',
      totalUsd ? `US$ ${totalUsd}` : '',
    ),
    total: totalPesos ? totalPesos.toFixed(2) : undefined,
  }
}

/** Presupuesto de service: se archiva por el precio de LISTA. */
export function resumenPresupuestoService(d: PresupuestoServiceData): ResumenDocumento {
  const { lista } = totalesService(d)
  return {
    referencia: d.numero,
    cliente: d.cliente,
    detalle: juntar(d.equipo, d.reparacion),
    total: lista ? lista.toFixed(2) : montoDe(d.precioContado),
  }
}

/** La garantía de accesorios es texto fijo: no hay nada que resumir. */
export function resumenVacio(): ResumenDocumento {
  return {}
}
