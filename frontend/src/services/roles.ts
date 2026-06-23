import type { Permiso, Rol } from '@/types'
import { api } from '@/lib/api'
import { useAuth } from '@/store/auth'

/** Gestión de roles y catálogo de permisos (solo administradores). */

const token = () => useAuth.getState().access

export interface RolInput {
  nombre: string
  descripcion?: string
  /** Códigos de permiso que concede el rol (p. ej. `['ver_panel', 'ver_inventario']`). */
  permisos: string[]
}

export function listarRoles(): Promise<Rol[]> {
  return api.get<Rol[]>('/roles/', token())
}

export function crearRol(input: RolInput): Promise<Rol> {
  return api.post<Rol>('/roles/', input, token())
}

export function actualizarRol(id: number, input: Partial<RolInput>): Promise<Rol> {
  return api.patch<Rol>(`/roles/${id}/`, input, token())
}

export function eliminarRol(id: number): Promise<void> {
  return api.del<void>(`/roles/${id}/`, token())
}

export function listarPermisos(): Promise<Permiso[]> {
  return api.get<Permiso[]>('/permisos/', token())
}
