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
import { PresupuestoEquipoPaper, PresupuestoServicePaper } from './PresupuestoPaper'
import {
  EQUIPO_H,
  EQUIPO_W,
  SERVICE_H,
  SERVICE_W,
  presupuestoEquipoVacio,
  presupuestoServiceVacio,
  type PresupuestoEquipoData,
  type PresupuestoServiceData,
} from './presupuestoComun'
import {
  resumenCompra,
  resumenCompraventa,
  resumenExtension,
  resumenMayorista,
  resumenPresupuestoEquipo,
  resumenPresupuestoService,
  resumenRecepcion,
  resumenReparacion,
  resumenSena,
  resumenVacio,
} from './resumen'

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
  resumen: resumenRecepcion,
  camposCliente: { nombre: 'recibiDe', telefono: 'tel' },
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
  resumen: resumenReparacion,
  camposCliente: { nombre: 'recibiDe', telefono: 'cel', email: 'mail' },
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
  resumen: resumenCompra,
  camposCliente: { nombre: 'recibiDe', documento: 'dni', telefono: 'cel', email: 'mail' },
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
  resumen: resumenMayorista,
  camposCliente: { nombre: 'recibiDe', documento: 'dni', telefono: 'celular' },
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
  resumen: resumenExtension,
  camposCliente: { nombre: 'recibiDe', documento: 'dni', telefono: 'cel', email: 'mail' },
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
  resumen: resumenSena,
  camposCliente: { nombre: 'recibiDe', telefono: 'tel' },
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
  resumen: resumenCompraventa,
  camposCliente: { nombre: 'nombreVendedor', documento: 'dniVendedor' },
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
  resumen: resumenVacio,
  Paper: GarantiaAccPaper,
  loadPdf: async () => (await import('./GarantiaAccPdf')).GarantiaAccPdf,
  loadXlsx: async () => (await import('./garantiaAccXlsx')).construirGarantiaAccXlsx,
  loadPos80: async () => (await import('./GarantiaAccPos80Pdf')).GarantiaAccPos80Pdf,
}

export const presupuestoEquipoModule: DocModule<PresupuestoEquipoData> = {
  id: 'presupuesto-equipo',
  nombre: 'Presupuesto de equipo',
  descripcion: 'Cotización de un equipo en dólares, con entrega en parte de pago y cuotas.',
  naturalW: EQUIPO_W,
  naturalH: EQUIPO_H,
  crearVacio: presupuestoEquipoVacio,
  nombreArchivo: (d) =>
    d.numero.trim() ? `presupuesto-equipo-${d.numero.trim()}` : 'presupuesto-equipo',
  resumen: resumenPresupuestoEquipo,
  camposCliente: { nombre: 'cliente', telefono: 'telefono' },
  Paper: PresupuestoEquipoPaper,
  loadPdf: async () => (await import('./PresupuestoPdf')).PresupuestoEquipoPdf,
  loadXlsx: async () => (await import('./presupuestoXlsx')).construirPresupuestoEquipoXlsx,
}

export const presupuestoServiceModule: DocModule<PresupuestoServiceData> = {
  id: 'presupuesto-service',
  nombre: 'Presupuesto de service',
  descripcion: 'Cotización de una reparación, con precio de lista, contado y cuotas.',
  naturalW: SERVICE_W,
  naturalH: SERVICE_H,
  crearVacio: presupuestoServiceVacio,
  nombreArchivo: (d) =>
    d.numero.trim() ? `presupuesto-service-${d.numero.trim()}` : 'presupuesto-service',
  resumen: resumenPresupuestoService,
  camposCliente: { nombre: 'cliente', telefono: 'telefono' },
  Paper: PresupuestoServicePaper,
  loadPdf: async () => (await import('./PresupuestoPdf')).PresupuestoServicePdf,
  loadXlsx: async () => (await import('./presupuestoXlsx')).construirPresupuestoServiceXlsx,
}

/** Documentos operativos (en orden de aparición en el selector).
 *  `any` permite la colección heterogénea (cada módulo tiene su propio tipo de datos);
 *  la página los usa de forma genérica. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const DOC_MODULES: DocModule<any>[] = [
  // Recepción queda oculto a pedido: el módulo y sus archivos siguen intactos
  // (arriba está `recepcionModule`); para volver a mostrarlo, descomentar esta línea.
  // recepcionModule,
  presupuestoEquipoModule,
  presupuestoServiceModule,
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
