import { recepcionVacia, type DocumentoDef, type RecepcionData } from './types'

/**
 * Catálogo de documentos del módulo. Hoy sólo "Recepción" está operativo; el
 * resto de las hojas del Excel quedan listadas como "próximamente" para ir
 * sumándolas con la misma mecánica (preview + PDF + XLSX).
 */
export const RECEPCION_DEF: DocumentoDef<RecepcionData> = {
  id: 'recepcion',
  nombre: 'Recepción de equipo/s',
  descripcion: 'Orden de ingreso: cliente, equipo, falla, presupuesto y garantía.',
  habilitado: true,
  crearVacio: recepcionVacia,
  nombreArchivo: (d) => (d.cupon.trim() ? `recepcion-${d.cupon.trim()}` : 'recepcion'),
}

/** Próximos documentos (otras hojas del Excel). */
const PROXIMOS: Array<Pick<DocumentoDef, 'id' | 'nombre' | 'descripcion'>> = [
  { id: 'reparacion', nombre: 'Reparación', descripcion: 'Orden de reparación de equipo.' },
  { id: 'compra', nombre: 'Compra', descripcion: 'Comprobante de compra de equipo.' },
  { id: 'compraventa', nombre: 'Compra / Venta', descripcion: 'Contrato de compraventa.' },
  { id: 'sena', nombre: 'Seña', descripcion: 'Comprobante de seña.' },
  { id: 'garantia-accesorios', nombre: 'Garantía accesorios', descripcion: 'Garantía de accesorios.' },
  { id: 'extension-garantia', nombre: 'Extensión de garantía', descripcion: 'Ampliación del plazo de garantía.' },
]

export const PROXIMOS_DOCS = PROXIMOS
