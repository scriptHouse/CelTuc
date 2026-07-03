import type {
  ConfiguracionPreciosService,
  DispositivoService,
  ItemPrecioService,
  SeccionPreciosService,
} from '@/types'
import { api } from '@/lib/api'
import { useAuth } from '@/store/auth'

/**
 * Precios de service: la lista de precios del taller (hoja "Precios Service").
 * Los precios en pesos se derivan del dólar configurado, salvo override manual.
 * Leer requiere el permiso `ver_precios_service`; escribir es solo para admins.
 */

const token = () => useAuth.getState().access

export interface ConfiguracionInput {
  dolar: number
  descuento_cash_pct: number
  redondeo_ars: number
}

/** Variante para crear/editar. Con `id` conserva la variante (y sus precios). */
export interface VarianteInput {
  id?: number
  nombre: string
  orden?: number
}

export interface SeccionInput {
  nombre: string
  nota?: string
  /** null = usa el descuento global. */
  descuento_cash_pct?: number | null
  orden?: number
  activo?: boolean
  variantes?: VarianteInput[]
}

/** Precio por variante: null en un campo = se deriva con la fórmula. */
export interface PrecioInput {
  variante: number
  precio_lista_usd?: number | null
  precio_cash_usd?: number | null
  precio_lista_ars?: number | null
  precio_cash_ars?: number | null
}

export interface ItemInput {
  seccion: number
  etiqueta: string
  nota?: string
  /** Ids de los equipos a los que aplica la fila (alimenta el selector). */
  dispositivos?: number[]
  orden?: number
  activo?: boolean
  precios?: PrecioInput[]
}

export interface DispositivoInput {
  nombre: string
  linea?: string
  orden?: number
  activo?: boolean
}

export function obtenerConfiguracion(): Promise<ConfiguracionPreciosService> {
  return api.get<ConfiguracionPreciosService>('/precios-service/configuracion/', token())
}

export function actualizarConfiguracion(
  input: Partial<ConfiguracionInput>,
): Promise<ConfiguracionPreciosService> {
  return api.patch<ConfiguracionPreciosService>('/precios-service/configuracion/', input, token())
}

export function listarSecciones(): Promise<SeccionPreciosService[]> {
  return api.get<SeccionPreciosService[]>('/precios-service/secciones/', token())
}

export function crearSeccion(input: SeccionInput): Promise<SeccionPreciosService> {
  return api.post<SeccionPreciosService>('/precios-service/secciones/', input, token())
}

export function actualizarSeccion(
  id: number,
  input: Partial<SeccionInput>,
): Promise<SeccionPreciosService> {
  return api.patch<SeccionPreciosService>(`/precios-service/secciones/${id}/`, input, token())
}

export function eliminarSeccion(id: number): Promise<void> {
  return api.del<void>(`/precios-service/secciones/${id}/`, token())
}

export function crearItem(input: ItemInput): Promise<ItemPrecioService> {
  return api.post<ItemPrecioService>('/precios-service/items/', input, token())
}

export function actualizarItem(id: number, input: Partial<ItemInput>): Promise<ItemPrecioService> {
  return api.patch<ItemPrecioService>(`/precios-service/items/${id}/`, input, token())
}

export function eliminarItem(id: number): Promise<void> {
  return api.del<void>(`/precios-service/items/${id}/`, token())
}

export function listarDispositivos(): Promise<DispositivoService[]> {
  return api.get<DispositivoService[]>('/precios-service/dispositivos/', token())
}

export function crearDispositivo(input: DispositivoInput): Promise<DispositivoService> {
  return api.post<DispositivoService>('/precios-service/dispositivos/', input, token())
}

export function actualizarDispositivo(
  id: number,
  input: Partial<DispositivoInput>,
): Promise<DispositivoService> {
  return api.patch<DispositivoService>(`/precios-service/dispositivos/${id}/`, input, token())
}

export function eliminarDispositivo(id: number): Promise<void> {
  return api.del<void>(`/precios-service/dispositivos/${id}/`, token())
}
