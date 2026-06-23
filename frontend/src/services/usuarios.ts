import type { UsuarioAdmin } from '@/types'
import { api } from '@/lib/api'
import { useAuth } from '@/store/auth'

/** Gestión de cuentas de usuario (solo administradores). */

const token = () => useAuth.getState().access

export interface UsuarioCreateInput {
  username: string
  email: string
  password: string
  is_staff: boolean
  /** Si viene, crea también el empleado vinculado a esta cuenta. */
  empleado?: { nombre: string; apellido?: string } | null
}

export interface UsuarioUpdateInput {
  username?: string
  email?: string
  is_active?: boolean
  is_staff?: boolean
  /** Vacío/omitido = no cambia la contraseña. */
  password?: string
}

export function listarUsuarios(): Promise<UsuarioAdmin[]> {
  return api.get<UsuarioAdmin[]>('/usuarios/', token())
}

export function crearUsuario(input: UsuarioCreateInput): Promise<UsuarioAdmin> {
  return api.post<UsuarioAdmin>('/usuarios/', input, token())
}

export function actualizarUsuario(id: number, input: UsuarioUpdateInput): Promise<UsuarioAdmin> {
  return api.patch<UsuarioAdmin>(`/usuarios/${id}/`, input, token())
}

export function eliminarUsuario(id: number): Promise<void> {
  return api.del<void>(`/usuarios/${id}/`, token())
}
