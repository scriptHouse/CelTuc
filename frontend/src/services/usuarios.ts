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
  /** Rol que define qué módulos ve la cuenta (null/omitido = sin acceso). */
  rol?: number | null
  /** Si viene, crea también el empleado vinculado a esta cuenta. */
  empleado?: { nombre: string; apellido?: string } | null
}

export interface UsuarioUpdateInput {
  username?: string
  email?: string
  is_active?: boolean
  is_staff?: boolean
  /** Rol que define qué módulos ve la cuenta (null = quitárselo). Omitido = no cambia. */
  rol?: number | null
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

/** Resultado del chequeo de un dato (usuario o email) mientras se escribe. */
export interface ChequeoDato {
  valor: string
  ok: boolean
  /** Por qué no sirve, en palabras (o null si está bien). */
  mensaje: string | null
  /** La cuenta que ya lo tiene, si choca con otra. */
  usado_por: { id: number; username: string; empleado: string | null; activa: boolean } | null
  /** Solo en el usuario: otros libres para proponer cuando el escrito ya está tomado. */
  sugerencias?: string[]
}

export interface Disponibilidad {
  username?: ChequeoDato
  email?: ChequeoDato
  /** Usuarios libres propuestos a partir del nombre y apellido. */
  sugerencias?: string[]
}

/**
 * ¿Está libre este usuario / email? (`excluir`: la cuenta que se está editando.)
 * Con `nombre`/`apellido` además devuelve usuarios libres para proponer.
 */
export function consultarDisponibilidad(params: {
  username?: string
  email?: string
  excluir?: number | null
  nombre?: string
  apellido?: string
}): Promise<Disponibilidad> {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([clave, valor]) => {
    if (valor !== undefined && valor !== null) qs.set(clave, String(valor))
  })
  return api.get<Disponibilidad>(`/usuarios/disponibilidad/?${qs.toString()}`, token())
}
