import { NATURAL_H, NATURAL_W } from './layout'
import { RecepcionPaper } from './RecepcionPaper'
import { recepcionVacia, type DocModule, type RecepcionData } from './types'
import { ReparacionPaper } from './ReparacionPaper'
import { REP_H, REP_W, reparacionVacia, type ReparacionData } from './reparacionContent'
import { CompraPaper } from './CompraPaper'
import { COMPRA_H, COMPRA_W, compraVacia, type CompraData } from './compraContent'
import { MayoristaPaper } from './MayoristaPaper'
import { MAY_H, MAY_W, mayoristaVacia, type MayoristaData } from './mayoristaContent'
import { ExtensionPaper } from './ExtensionPaper'
import { EXT_H, EXT_W, extensionVacia, type ExtensionData } from './extensionContent'
import { SenaPaper } from './SenaPaper'
import { SENA_H, SENA_W, senaVacia, type SenaData } from './senaContent'
import { CompraventaPaper } from './CompraventaPaper'
import { CV_H, CV_W, compraventaVacia, type CompraventaData } from './compraventaContent'
import { GarantiaAccPaper } from './GarantiaAccPaper'
import { GACC_H, GACC_W, gAccVacia, type GAccData } from './garantiaAccContent'

/* ============================================================================
 * Catálogo de documentos. Cada entrada es un `DocModule`: su preview HTML
 * (liviano, va en el bundle principal) y la carga diferida de sus exportadores.
 *
 * "Recepción" conserva el formato original; el resto sigue el formato del
 * Excel nuevo ("DOCUMENTOS SISTEMA NUEVO.xlsx").
 * ========================================================================== */

export const recepcionModule: DocModule<RecepcionData> = {
  id: 'recepcion',
  nombre: 'Recepción de equipo/s',
  descripcion: 'Orden de ingreso: cliente, equipo, falla, presupuesto y garantía.',
  naturalW: NATURAL_W,
  naturalH: NATURAL_H,
  crearVacio: recepcionVacia,
  nombreArchivo: (d) => (d.cupon.trim() ? `recepcion-${d.cupon.trim()}` : 'recepcion'),
  Paper: RecepcionPaper,
  loadPdf: async () => (await import('./RecepcionPdf')).RecepcionPdf,
  loadXlsx: async () => (await import('./recepcionXlsx')).construirRecepcionXlsx,
}

export const reparacionModule: DocModule<ReparacionData> = {
  id: 'reparacion',
  nombre: 'Garantía / Reparación',
  descripcion: 'Ingreso a service con condiciones de servicio y garantía.',
  naturalW: REP_W,
  naturalH: REP_H,
  crearVacio: reparacionVacia,
  nombreArchivo: (d) => (d.cupon.trim() ? `reparacion-${d.cupon.trim()}` : 'reparacion'),
  Paper: ReparacionPaper,
  loadPdf: async () => (await import('./ReparacionPdf')).ReparacionPdf,
  loadXlsx: async () => (await import('./reparacionXlsx')).construirReparacionXlsx,
}

export const compraModule: DocModule<CompraData> = {
  id: 'compra',
  nombre: 'Compra',
  descripcion: 'Recibo de compra de equipo: datos, condición, IMEI y total.',
  naturalW: COMPRA_W,
  naturalH: COMPRA_H,
  crearVacio: compraVacia,
  nombreArchivo: (d) => (d.cupon.trim() ? `compra-${d.cupon.trim()}` : 'compra'),
  Paper: CompraPaper,
  loadPdf: async () => (await import('./CompraPdf')).CompraPdf,
  loadXlsx: async () => (await import('./compraXlsx')).construirCompraXlsx,
}

export const mayoristaModule: DocModule<MayoristaData> = {
  id: 'compra-mayorista',
  nombre: 'Compra mayorista',
  descripcion: 'Recibo de compra mayorista con hasta diez IMEI.',
  naturalW: MAY_W,
  naturalH: MAY_H,
  crearVacio: mayoristaVacia,
  nombreArchivo: (d) => (d.cupon.trim() ? `compra-mayorista-${d.cupon.trim()}` : 'compra-mayorista'),
  Paper: MayoristaPaper,
  loadPdf: async () => (await import('./MayoristaPdf')).MayoristaPdf,
  loadXlsx: async () => (await import('./mayoristaXlsx')).construirMayoristaXlsx,
}

export const extensionModule: DocModule<ExtensionData> = {
  id: 'extension-garantia',
  nombre: 'Extensión de garantía',
  descripcion: 'Ampliación del plazo de garantía por una cantidad de meses.',
  naturalW: EXT_W,
  naturalH: EXT_H,
  crearVacio: extensionVacia,
  nombreArchivo: (d) => (d.cupon.trim() ? `extension-garantia-${d.cupon.trim()}` : 'extension-garantia'),
  Paper: ExtensionPaper,
  loadPdf: async () => (await import('./ExtensionPdf')).ExtensionPdf,
  loadXlsx: async () => (await import('./extensionXlsx')).construirExtensionXlsx,
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
  loadPos80: async () => (await import('./GarantiaAccPos80Pdf')).GarantiaAccPos80Pdf,
}

/** Documentos operativos (en orden de aparición en el selector).
 *  `any` permite la colección heterogénea (cada módulo tiene su propio tipo de datos);
 *  la página los usa de forma genérica. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const DOC_MODULES: DocModule<any>[] = [
  recepcionModule,
  reparacionModule,
  compraModule,
  mayoristaModule,
  extensionModule,
  senaModule,
  compraventaModule,
  garantiaAccModule,
]

/** Próximos documentos (aún sin construir). */
export const PROXIMOS_DOCS: Array<{ id: string; nombre: string; descripcion: string }> = []
