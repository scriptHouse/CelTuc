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

/** Props comunes a todos los "papeles" (preview HTML rellenable). */
export interface PaperProps<T> {
  datos: T
  onChange: (patch: Partial<T>) => void
  readOnly?: boolean
  /** Dirección del encabezado (configurable desde la página). */
  direccion?: string
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
  Paper: ComponentType<PaperProps<T>>
  loadPdf: () => Promise<ComponentType<{ datos: T; direccion?: string }>>
  loadXlsx: () => Promise<(datos: T, direccion?: string) => Promise<Blob>>
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
