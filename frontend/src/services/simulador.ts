import type { Tarjeta } from '@/types'
import { api } from '@/lib/api'
import { useAuth } from '@/store/auth'

/**
 * Simulador de tarjetas: tabla configurable de medios de pago y sus recargos por
 * plan de cuotas. Leer (usar el simulador) requiere el permiso `ver_simulador`;
 * escribir (editar los porcentajes) es solo para administradores.
 */

const token = () => useAuth.getState().access

/** Plan de cuotas para crear/editar. La tabla completa se reemplaza al guardar. */
export interface PlanInput {
  etiqueta: string
  cuotas: number
  /** Porcentaje de recargo (35 = 35 %). */
  interes: number
  orden?: number
  activo?: boolean
}

export interface TarjetaInput {
  nombre: string
  categoria: Tarjeta['categoria']
  descripcion?: string
  orden?: number
  activa?: boolean
  planes: PlanInput[]
}

export function listarTarjetas(): Promise<Tarjeta[]> {
  return api.get<Tarjeta[]>('/simulador/tarjetas/', token())
}

export function crearTarjeta(input: TarjetaInput): Promise<Tarjeta> {
  return api.post<Tarjeta>('/simulador/tarjetas/', input, token())
}

export function actualizarTarjeta(id: number, input: Partial<TarjetaInput>): Promise<Tarjeta> {
  return api.patch<Tarjeta>(`/simulador/tarjetas/${id}/`, input, token())
}

export function eliminarTarjeta(id: number): Promise<void> {
  return api.del<void>(`/simulador/tarjetas/${id}/`, token())
}
