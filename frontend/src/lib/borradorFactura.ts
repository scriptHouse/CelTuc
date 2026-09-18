import type { CondicionEmisor, CondicionFiscal, DocTipo, MedioPagoComprobante } from '@/types'
import { IVA_RATE } from '@/lib/afip'

/**
 * Puente entre Caja y Facturación: una venta de mostrador marcada como
 * facturable se convierte en la precarga del modal de emisión de siempre
 * (`prefillDesdeVenta`). Caja abre ese modal ahí mismo; el borrador guardado
 * acá es el camino alternativo (se deja y se navega a /facturacion, que lo
 * toma UNA vez). La emisión en sí es 100 % el flujo existente (mismo modal,
 * mismas validaciones, mismo backend ARCA): acá solo viajan datos.
 */

const CLAVE = 'celtuc-borrador-factura-venta'

export interface BorradorFacturaVenta {
  ventaId: number
  /** Cuenta que corresponde: RI para Factura A/B, Monotributo para Factura C. */
  emisorCondicion: CondicionEmisor
  /** Cuenta puntual elegida en el mostrador (si no está, se usa la primera). */
  emisorId?: number
  /** Ítems con el precio FINAL cobrado en el mostrador (IVA incluido si aplica). */
  items: Array<{
    descripcion: string
    cantidad: number
    precioFinal: number
    /** Origen del ítem: dice si en la factura lleva concepto genérico. NO
     *  descuenta stock (esta venta ya lo descontó en el mostrador). */
    productoId?: number
    itemServiceId?: number
    conceptoGenerico?: boolean
  }>
  observaciones: string
  /**
   * Con qué se cobró la parte que se factura (el medio de mayor monto). Precarga
   * el campo «Cobrado con» de la factura: dato interno, no viaja a ARCA.
   */
  medioPago?: MedioPagoComprobante
  /** Cliente elegido en el mostrador: precarga los datos del receptor. */
  cliente?: {
    nombre: string
    telefono?: string
    email?: string
    docTipo?: DocTipo
    docNumero?: string
    condicion?: CondicionFiscal
  }
}

/** Lo que el modal de emisión recibe precargado cuando nace de una venta. */
export interface PrefillFacturaVenta {
  /** Venta de mostrador que se está facturando (se liga al emitir). */
  ventaId: number
  items: Array<{
    descripcion: string
    cantidad: number
    precioUnitario: number
    /** Origen del ítem: solo para el concepto genérico (el stock ya se movió). */
    productoId?: number
    itemServiceId?: number
  }>
  observaciones: string
  pagada: boolean
  /** Con qué se cobró en el mostrador (precarga el medio de la factura). */
  medioPago?: MedioPagoComprobante
  /** Cliente cargado en el mostrador (si la venta lo tenía). */
  cliente?: BorradorFacturaVenta['cliente']
}

/**
 * Convierte la venta de mostrador en la precarga del modal de emisión.
 *
 * El precio de la venta es lo que pagó el cliente (final). En A/B el ítem viaja
 * NETO y el modal le suma el 21 %: se divide acá para que el total de la
 * factura coincida con lo cobrado en el mostrador.
 */
export function prefillDesdeVenta(
  borrador: BorradorFacturaVenta,
  condicion: CondicionEmisor,
): PrefillFacturaVenta {
  const esRI = condicion === 'responsable_inscripto'
  return {
    ventaId: borrador.ventaId,
    items: borrador.items.map((i) => ({
      descripcion: i.descripcion,
      cantidad: i.cantidad,
      precioUnitario: esRI
        ? Math.round((i.precioFinal / (1 + IVA_RATE)) * 100) / 100
        : i.precioFinal,
      productoId: i.productoId,
      itemServiceId: i.itemServiceId,
    })),
    observaciones: borrador.observaciones,
    pagada: true, // la venta de mostrador ya se cobró
    medioPago: borrador.medioPago,
    cliente: borrador.cliente,
  }
}

export function guardarBorradorFacturaVenta(borrador: BorradorFacturaVenta): void {
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify(borrador))
  } catch {
    /* sin sessionStorage no hay precarga; la factura se puede hacer a mano */
  }
}

/** Devuelve el borrador pendiente y lo borra (se consume una sola vez). */
export function tomarBorradorFacturaVenta(): BorradorFacturaVenta | null {
  try {
    const crudo = sessionStorage.getItem(CLAVE)
    if (!crudo) return null
    sessionStorage.removeItem(CLAVE)
    const borrador = JSON.parse(crudo) as BorradorFacturaVenta
    if (!borrador || !Array.isArray(borrador.items) || borrador.items.length === 0) return null
    return borrador
  } catch {
    return null
  }
}
