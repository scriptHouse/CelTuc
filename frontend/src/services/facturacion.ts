import type { Comprobante, Emisor, EstadoCobro, ItemComprobante } from '@/types'
import { api } from '@/lib/api'
import { useAuth } from '@/store/auth'

/**
 * Facturación electrónica real contra ARCA (backend Django).
 *
 * - Emisores (cuentas): leer requiere el permiso `ver_facturacion`; crear/editar
 *   (con credenciales) es solo para administradores.
 * - Comprobantes: listar y emitir requieren `ver_facturacion`. La emisión llama a
 *   ARCA y devuelve el comprobante con su CAE.
 */

const token = () => useAuth.getState().access

// ===== Emisores =====

export interface EmisorInput {
  nombre: string
  condicion: Emisor['condicion']
  cuit: string
  punto_venta: number
  produccion: boolean
  activo?: boolean
  /** Contenido PEM del certificado (.crt). Vacío = no cambiar (en edición). */
  certificado?: string
  /** Contenido PEM de la clave privada (.key). Vacío = no cambiar (en edición). */
  clave_privada?: string
}

export function listarEmisores(): Promise<Emisor[]> {
  return api.get<Emisor[]>('/facturacion/emisores/', token())
}

export function crearEmisor(input: EmisorInput): Promise<Emisor> {
  return api.post<Emisor>('/facturacion/emisores/', input, token())
}

export function actualizarEmisor(id: number, input: Partial<EmisorInput>): Promise<Emisor> {
  return api.patch<Emisor>(`/facturacion/emisores/${id}/`, input, token())
}

export function eliminarEmisor(id: number): Promise<void> {
  return api.del<void>(`/facturacion/emisores/${id}/`, token())
}

/** Resultado de probar la conexión y credenciales del emisor contra ARCA. */
export interface ResultadoConexion {
  servidor: { app: string | null; base: string | null; auth: string | null } | null
  autenticacion: string | null
  ultimo_numero: number | null
  ok: boolean
  mensaje: string
}

export function probarConexion(id: number): Promise<ResultadoConexion> {
  return api.post<ResultadoConexion>(`/facturacion/emisores/${id}/probar/`, undefined, token())
}

// ===== Comprobantes =====

export function listarComprobantes(emisorId?: number): Promise<Comprobante[]> {
  const query = emisorId ? `?emisor=${emisorId}` : ''
  return api.get<Comprobante[]>(`/facturacion/comprobantes/${query}`, token())
}

export function obtenerComprobante(id: number): Promise<Comprobante> {
  return api.get<Comprobante>(`/facturacion/comprobantes/${id}/`, token())
}

export interface NuevoComprobante {
  emisor: number
  concepto?: number
  cliente_nombre: string
  cliente_doc_tipo: string
  cliente_doc_numero?: string
  cliente_condicion: string
  fecha?: string
  vencimiento?: string | null
  alicuota_iva?: number
  observaciones?: string
  estado_cobro?: EstadoCobro
  items: Array<
    Pick<ItemComprobante, 'descripcion' | 'cantidad' | 'precio_unitario'> & {
      /** Producto del catálogo: junto con `sucursal_stock`, descuenta stock. */
      producto?: number
    }
  >
  /** Sucursal de la que descontar el stock de los ítems con `producto`. */
  sucursal_stock?: number
}

/** Emite el comprobante: el backend pide el CAE a ARCA y lo guarda. */
export function emitirComprobante(input: NuevoComprobante): Promise<Comprobante> {
  return api.post<Comprobante>('/facturacion/comprobantes/', input, token())
}

export function cambiarEstadoCobro(id: number, estado: EstadoCobro): Promise<Comprobante> {
  return api.patch<Comprobante>(`/facturacion/comprobantes/${id}/`, { estado_cobro: estado }, token())
}

export function eliminarComprobante(id: number): Promise<void> {
  return api.del<void>(`/facturacion/comprobantes/${id}/`, token())
}

/** Envía por email el PDF (ya generado en el front, en base64) de un comprobante. */
export function enviarComprobanteEmail(
  id: number,
  email: string,
  pdfBase64: string,
  mensaje?: string,
): Promise<{ detail: string }> {
  return api.post<{ detail: string }>(
    `/facturacion/comprobantes/${id}/enviar-email/`,
    { email, pdf_base64: pdfBase64, mensaje },
    token(),
  )
}
