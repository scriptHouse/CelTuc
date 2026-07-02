import type { ModeloEquipo, TipoServicio } from '@/types'
import { api } from '@/lib/api'
import { useAuth } from '@/store/auth'

/**
 * Cotizaciones: cuánto se toma cada equipo usado (rango MIN-MAX en USD por
 * capacidad) y cuánto cuesta cada service por modelo. Leer requiere el permiso
 * `ver_cotizaciones`; escribir (editar precios) es solo para administradores.
 */

const token = () => useAuth.getState().access

/** Rango de toma por capacidad. La tabla completa se reemplaza al guardar. */
export interface CotizacionInput {
  capacidad_gb: number
  precio_min: number
  precio_max: number
}

/** Precio de un tipo de service (`tipo` = id del TipoServicio). */
export interface PrecioServicioInput {
  tipo: number
  precio: number
}

export interface ModeloEquipoInput {
  marca?: string
  nombre: string
  orden?: number
  activo?: boolean
  cotizaciones?: CotizacionInput[]
  servicios?: PrecioServicioInput[]
}

export interface TipoServicioInput {
  nombre: string
  orden?: number
  activo?: boolean
}

export function listarModelos(): Promise<ModeloEquipo[]> {
  return api.get<ModeloEquipo[]>('/cotizaciones/modelos/', token())
}

export function crearModelo(input: ModeloEquipoInput): Promise<ModeloEquipo> {
  return api.post<ModeloEquipo>('/cotizaciones/modelos/', input, token())
}

export function actualizarModelo(id: number, input: Partial<ModeloEquipoInput>): Promise<ModeloEquipo> {
  return api.patch<ModeloEquipo>(`/cotizaciones/modelos/${id}/`, input, token())
}

export function eliminarModelo(id: number): Promise<void> {
  return api.del<void>(`/cotizaciones/modelos/${id}/`, token())
}

export function listarTiposServicio(): Promise<TipoServicio[]> {
  return api.get<TipoServicio[]>('/cotizaciones/tipos-servicio/', token())
}

export function crearTipoServicio(input: TipoServicioInput): Promise<TipoServicio> {
  return api.post<TipoServicio>('/cotizaciones/tipos-servicio/', input, token())
}

export function actualizarTipoServicio(id: number, input: Partial<TipoServicioInput>): Promise<TipoServicio> {
  return api.patch<TipoServicio>(`/cotizaciones/tipos-servicio/${id}/`, input, token())
}

export function eliminarTipoServicio(id: number): Promise<void> {
  return api.del<void>(`/cotizaciones/tipos-servicio/${id}/`, token())
}
