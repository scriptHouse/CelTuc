import type { CondicionEmisor, CondicionFiscal, DocTipo } from '@/types'

/**
 * Puente entre Caja y Facturación: al registrar una venta de mostrador marcada
 * como facturable, se deja acá un borrador y se navega a /facturacion. La
 * página lo toma UNA vez (se borra al leer), elige la cuenta que corresponde
 * (RI o Monotributo) y abre el modal de emisión de siempre con todo
 * precargado. La emisión en sí es 100 % el flujo existente (mismo modal,
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
