/**
 * Datos que el usuario carga en el documento de **Recepción de equipo/s**.
 * Cada campo se corresponde con un espacio rellenable de la hoja original de
 * Excel. El texto de garantía es fijo (no se edita), por eso no está acá.
 */
export interface RecepcionData {
  cupon: string
  fechaDia: string
  fechaMes: string
  fechaAnio: string
  recibiDe: string
  equipos: string
  falla: string
  fallaExtra: string
  obs: string
  recepciono: string
  codDesbloqueo: string
  tel: string
  presupuesto: string
  sena: string
  pendiente: string
  diagnostico: string
}

/** Documento en blanco. La fecha se completa con el día actual al abrir la página. */
export function recepcionVacia(): RecepcionData {
  const { dia, mes, anio } = hoyDMY()
  return {
    cupon: '',
    fechaDia: dia,
    fechaMes: mes,
    fechaAnio: anio,
    recibiDe: '',
    equipos: '',
    falla: '',
    fallaExtra: '',
    obs: '',
    recepciono: '',
    codDesbloqueo: '',
    tel: '',
    presupuesto: '',
    sena: '',
    pendiente: '',
    diagnostico: '',
  }
}

import type { ComponentType } from 'react'
import type { ResumenDocumento } from './resumen'

/** Props comunes a todos los "papeles" (preview HTML rellenable). */
export interface PaperProps<T> {
  datos: T
  onChange: (patch: Partial<T>) => void
  readOnly?: boolean
  /** Dirección del encabezado (configurable desde la página). */
  direccion?: string
}

/**
 * Qué campo del formulario lleva cada dato del cliente. Cada plantilla los
 * nombra distinto (`recibiDe` / `nombreVendedor`, `cel` / `tel` / `celular`),
 * así que el mapa vive en el módulo y lo usan las dos puntas: para traer un
 * cliente ya guardado y para registrarlo al exportar.
 */
export interface CamposCliente<T> {
  nombre: keyof T & string
  /** DNI / CUIT, si la plantilla lo pide. */
  documento?: keyof T & string
  telefono?: keyof T & string
  email?: keyof T & string
}

/**
 * Un documento del módulo: su preview HTML (`Paper`) y la carga diferida de sus
 * exportadores (PDF con @react-pdf, XLSX con exceljs). El Paper es liviano y va
 * en el bundle principal; los exportadores pesan, por eso se importan on-demand.
 *
 * Pensado para crecer: cada hoja del Excel (Recepción, Reparación, Compra, Seña,
 * Compraventa, etc.) se registra en `registry.tsx` con esta misma forma.
 */
export interface DocModule<T = unknown> {
  id: string
  nombre: string
  descripcion: string
  /** Dimensiones naturales del papel (px) para el escalador responsivo. */
  naturalW: number
  naturalH: number
  /** Estado inicial del formulario (con defaults, p. ej. la fecha de hoy). */
  crearVacio: () => T
  /** Nombre de archivo base para las exportaciones (sin extensión). */
  nombreArchivo: (datos: T) => string
  /**
   * Campos con los que se archiva la exportación en el historial (cliente,
   * cupón, equipo, importe). Ver `resumen.ts`.
   */
  resumen: (datos: T) => ResumenDocumento
  /**
   * Campos donde vive el cliente. Sin esto, la plantilla no ofrece traer datos
   * de la base (la garantía de accesorios, por ejemplo, no tiene cliente).
   */
  camposCliente?: CamposCliente<T>
  /**
   * Campo cuyo N° es correlativo y lo asigna el sistema: arranca en 0 y sube
   * con cada documento generado de este tipo (el próximo lo calcula el backend
   * mirando el historial). El campo queda editable por si hay que corregirlo.
   */
  cuponAuto?: keyof T & string
  Paper: ComponentType<PaperProps<T>>
  loadPdf: () => Promise<ComponentType<{ datos: T; direccion?: string }>>
  loadXlsx: () => Promise<(datos: T, direccion?: string) => Promise<Blob>>
  /**
   * Opcional: versión para ticketera térmica POS80 (80mm). Sólo la definen los
   * documentos que además pueden imprimirse como ticket. Recibe los mismos
   * `datos` que el PDF: aunque el texto sea fijo, el ticket lleva los campos
   * del pie (p. ej. la fecha y hora de la garantía de accesorios).
   */
  loadPos80?: () => Promise<ComponentType<{ datos: T; direccion?: string }>>
}

/** Fecha de hoy en partes (para prefijar el campo FECHA de los formularios). */
export function hoyDMY(): { dia: string; mes: string; anio: string } {
  const d = new Date()
  return {
    dia: String(d.getDate()).padStart(2, '0'),
    mes: String(d.getMonth() + 1).padStart(2, '0'),
    anio: String(d.getFullYear()).slice(-2),
  }
}

/**
 * Fecha y hora de ahora en `dd/mm/aaaa hh:mm` (24 h).
 *
 * Prefija el pie de la garantía de accesorios. Se calcula al crear el
 * documento en blanco, así que "Limpiar" la vuelve a poner en hora; el campo
 * queda editable para corregirla a mano.
 */
export function ahoraFechaHora(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}
