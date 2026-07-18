import type { Sucursal } from '@/types'
import { api } from '@/lib/api'
import { useAuth } from '@/store/auth'

/**
 * Servicio de Sucursales contra el backend (Django REST). Una sucursal es un
 * local del negocio: nombre, código postal y estado (activa/inactiva). Se usa
 * para vincular empleados y para preseleccionar la dirección de los documentos.
 * Lectura: quien tenga el módulo Empleados. Escritura: solo administradores.
 */

const token = () => useAuth.getState().access

export interface SucursalInput {
  nombre: string
  codigo_postal?: string
  activa?: boolean
}

export function listarSucursales(): Promise<Sucursal[]> {
  return api.get<Sucursal[]>('/empleados/sucursales/', token())
}

export function crearSucursal(input: SucursalInput): Promise<Sucursal> {
  return api.post<Sucursal>('/empleados/sucursales/', input, token())
}

export function actualizarSucursal(id: number, input: Partial<SucursalInput>): Promise<Sucursal> {
  return api.patch<Sucursal>(`/empleados/sucursales/${id}/`, input, token())
}

export function eliminarSucursal(id: number): Promise<void> {
  return api.del<void>(`/empleados/sucursales/${id}/`, token())
}
