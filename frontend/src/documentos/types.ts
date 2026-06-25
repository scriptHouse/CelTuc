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
  return {
    cupon: '',
    fechaDia: '',
    fechaMes: '',
    fechaAnio: '',
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

/**
 * Definición de un tipo de documento del módulo. Pensado para crecer: hoy sólo
 * está "Recepción", pero el registro (`registry.ts`) admite sumar las demás
 * hojas del Excel (Reparación, Compra, Seña, etc.) con la misma estructura.
 */
export interface DocumentoDef<T = unknown> {
  id: string
  nombre: string
  descripcion: string
  /** Si está disponible para usar. Los que faltan se muestran como "próximamente". */
  habilitado: boolean
  /** Estado inicial del formulario. */
  crearVacio: () => T
  /** Nombre de archivo base para las exportaciones (sin extensión). */
  nombreArchivo: (datos: T) => string
}
