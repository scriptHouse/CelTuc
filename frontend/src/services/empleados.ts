import type { Empleado } from '@/types'
import { api } from '@/lib/api'
import { useAuth } from '@/store/auth'

/**
 * Servicio de Empleados contra el backend (Django REST). El token JWT de la
 * sesión se lee del store en cada llamada.
 */

const token = () => useAuth.getState().access

export interface EmpleadoInput {
  nombre: string
  apellido?: string
}

/** Datos para crear/actualizar la cuenta de login de un empleado. */
export interface AccesoInput {
  username: string
  email: string
  /** Vacío al editar = no cambia la contraseña. Requerido al crear el acceso. */
  password?: string
}

export function listarEmpleados(): Promise<Empleado[]> {
  return api.get<Empleado[]>('/empleados/', token())
}

export function crearEmpleado(input: EmpleadoInput): Promise<Empleado> {
  return api.post<Empleado>('/empleados/', input, token())
}

export function actualizarEmpleado(id: number, input: EmpleadoInput): Promise<Empleado> {
  return api.patch<Empleado>(`/empleados/${id}/`, input, token())
}

export function eliminarEmpleado(id: number): Promise<void> {
  return api.del<void>(`/empleados/${id}/`, token())
}

/** Crea o actualiza el acceso (login) del empleado. */
export function definirAcceso(id: number, input: AccesoInput): Promise<Empleado> {
  return api.put<Empleado>(`/empleados/${id}/acceso/`, input, token())
}

/** Quita el acceso del empleado (elimina su cuenta de login). */
export function quitarAcceso(id: number): Promise<Empleado> {
  return api.del<Empleado>(`/empleados/${id}/acceso/`, token())
}
