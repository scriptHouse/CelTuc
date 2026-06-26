import { RECEPCION_TITULO } from './content'
import { NATURAL_H, NATURAL_W } from './layout'
import { RecepcionPaper } from './RecepcionPaper'
import { CompraPaper } from './CompraPaper'
import { COMPRA_H, COMPRA_W, compraVacia, type CompraData } from './compraContent'
import { ExtensionPaper } from './ExtensionPaper'
import { EXT_H, EXT_W, extensionVacia, type ExtensionData } from './extensionContent'
import { GarantiaAccPaper } from './GarantiaAccPaper'
import { GACC_H, GACC_W, gAccVacia, type GAccData } from './garantiaAccContent'
import { SenaPaper } from './SenaPaper'
import { SENA_H, SENA_W, senaVacia, type SenaData } from './senaContent'
import { CompraventaPaper } from './CompraventaPaper'
import { CV_H, CV_W, compraventaVacia, type CompraventaData } from './compraventaContent'
import { recepcionVacia, type DocModule, type PaperProps, type RecepcionData } from './types'

/* ============================================================================
 * Catálogo de documentos del módulo. Cada entrada es un `DocModule`: su preview
 * HTML (Paper, liviano) y la carga diferida de sus exportadores (PDF/XLSX).
 *
 * Recepción y Reparación comparten el mismo formulario (mismos campos), sólo
 * cambia el título; por eso reutilizan los componentes de Recepción.
 * ========================================================================== */

const REPARACION_TITULO = 'GARANTIA REPARACION'

function recepcionLikeModule(opts: {
  id: string
  nombre: string
  descripcion: string
  titulo: string
  base: string
  hoja: string
}): DocModule<RecepcionData> {
  return {
    id: opts.id,
    nombre: opts.nombre,
    descripcion: opts.descripcion,
    naturalW: NATURAL_W,
    naturalH: NATURAL_H,
    crearVacio: recepcionVacia,
    nombreArchivo: (d) => (d.cupon.trim() ? `${opts.base}-${d.cupon.trim()}` : opts.base),
    Paper: (p: PaperProps<RecepcionData>) => <RecepcionPaper {...p} titulo={opts.titulo} />,
    loadPdf: async () => {
      const { RecepcionPdf } = await import('./RecepcionPdf')
      return ({ datos }) => <RecepcionPdf datos={datos} titulo={opts.titulo} />
    },
    loadXlsx: async () => {
      const { construirRecepcionXlsx } = await import('./recepcionXlsx')
      return (d) => construirRecepcionXlsx(d, opts.titulo, opts.hoja)
    },
  }
}

export const recepcionModule = recepcionLikeModule({
  id: 'recepcion',
  nombre: 'Recepción de equipo/s',
  descripcion: 'Orden de ingreso: cliente, equipo, falla, presupuesto y garantía.',
  titulo: RECEPCION_TITULO,
  base: 'recepcion',
  hoja: 'Recepcion',
})

export const reparacionModule = recepcionLikeModule({
  id: 'reparacion',
  nombre: 'Garantía / Reparación',
  descripcion: 'Orden de reparación con diagnóstico técnico y garantía del servicio.',
  titulo: REPARACION_TITULO,
  base: 'reparacion',
  hoja: 'Reparacion',
})

export const compraModule: DocModule<CompraData> = {
  id: 'compra',
  nombre: 'Compra',
  descripcion: 'Recibo de compra de equipo: datos, condición, garantía y total.',
  naturalW: COMPRA_W,
  naturalH: COMPRA_H,
  crearVacio: compraVacia,
  nombreArchivo: (d) => (d.cupon.trim() ? `compra-${d.cupon.trim()}` : 'compra'),
  Paper: CompraPaper,
  loadPdf: async () => (await import('./CompraPdf')).CompraPdf,
  loadXlsx: async () => (await import('./compraXlsx')).construirCompraXlsx,
}

export const extensionModule: DocModule<ExtensionData> = {
  id: 'extension-garantia',
  nombre: 'Extensión de garantía',
  descripcion: 'Ampliación del plazo de garantía de un equipo comprado.',
  naturalW: EXT_W,
  naturalH: EXT_H,
  crearVacio: extensionVacia,
  nombreArchivo: (d) => (d.cupon.trim() ? `extension-garantia-${d.cupon.trim()}` : 'extension-garantia'),
  Paper: ExtensionPaper,
  loadPdf: async () => (await import('./ExtensionPdf')).ExtensionPdf,
  loadXlsx: async () => (await import('./extensionXlsx')).construirExtensionXlsx,
}

export const garantiaAccModule: DocModule<GAccData> = {
  id: 'garantia-accesorios',
  nombre: 'Garantía de accesorios',
  descripcion: 'Comprobante de garantía para accesorios (cables, fuentes, auriculares, etc.).',
  naturalW: GACC_W,
  naturalH: GACC_H,
  crearVacio: gAccVacia,
  nombreArchivo: () => 'garantia-accesorios',
  Paper: GarantiaAccPaper,
  loadPdf: async () => (await import('./GarantiaAccPdf')).GarantiaAccPdf,
  loadXlsx: async () => (await import('./garantiaAccXlsx')).construirGarantiaAccXlsx,
}

export const senaModule: DocModule<SenaData> = {
  id: 'sena',
  nombre: 'Seña',
  descripcion: 'Comprobante de seña con N° de recibo, importe y total.',
  naturalW: SENA_W,
  naturalH: SENA_H,
  crearVacio: senaVacia,
  nombreArchivo: (d) => (d.numeroRecibo.trim() ? `sena-${d.numeroRecibo.trim()}` : 'sena'),
  Paper: SenaPaper,
  loadPdf: async () => (await import('./SenaPdf')).SenaPdf,
  loadXlsx: async () => (await import('./senaXlsx')).construirSenaXlsx,
}

export const compraventaModule: DocModule<CompraventaData> = {
  id: 'compraventa',
  nombre: 'Compra / Venta',
  descripcion: 'Contrato de compraventa de equipo usado, con cláusulas y firmas.',
  naturalW: CV_W,
  naturalH: CV_H,
  crearVacio: compraventaVacia,
  nombreArchivo: (d) => (d.cupon.trim() ? `compraventa-${d.cupon.trim()}` : 'compraventa'),
  Paper: CompraventaPaper,
  loadPdf: async () => (await import('./CompraventaPdf')).CompraventaPdf,
  loadXlsx: async () => (await import('./compraventaXlsx')).construirCompraventaXlsx,
}

/** Documentos operativos (en orden de aparición en el selector).
 *  `any` permite la colección heterogénea (cada módulo tiene su propio tipo de datos);
 *  la página los usa de forma genérica. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const DOC_MODULES: DocModule<any>[] = [
  recepcionModule,
  reparacionModule,
  compraModule,
  extensionModule,
  senaModule,
  compraventaModule,
  garantiaAccModule,
]

/** Próximos documentos (otras hojas del Excel, aún sin construir). */
export const PROXIMOS_DOCS: Array<{ id: string; nombre: string; descripcion: string }> = []
