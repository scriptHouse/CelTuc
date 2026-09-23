import type { Empleado, RolBreve, SucursalBreve, UsuarioAdmin } from '@/types'

/**
 * Una persona del equipo y/o su cuenta, sin importar desde qué pantalla se la
 * abrió: Empleados trae personas (con su cuenta, si tienen) y Usuarios trae
 * cuentas (con su persona, si son de alguien). La ficha trabaja con esto.
 */
export interface Integrante {
  /** Clave estable para la lista: `e-12` (persona) o `u-4` (cuenta suelta). */
  clave: string
  empleado: {
    id: number
    nombre: string
    apellido: string
    nombre_completo: string
    sucursal: SucursalBreve | null
    creado?: string
  } | null
  cuenta: {
    id: number
    username: string
    email: string
    is_active: boolean
    rol: RolBreve | null
    es_administrador: boolean
    is_staff: boolean
    is_superuser: boolean
    last_login: string | null
    ultima_actividad: string | null
    en_linea: boolean
  } | null
}

export function desdeEmpleado(e: Empleado): Integrante {
  const u = e.usuario
  return {
    clave: `e-${e.id}`,
    empleado: {
      id: e.id,
      nombre: e.nombre,
      apellido: e.apellido,
      nombre_completo: e.nombre_completo,
      sucursal: e.sucursal,
      creado: e.creado,
    },
    cuenta: u
      ? {
          id: u.id,
          username: u.username,
          email: u.email,
          is_active: u.is_active,
          rol: u.rol ?? null,
          es_administrador: Boolean(u.es_administrador ?? (u.is_superuser || u.is_staff || u.rol?.es_admin)),
          is_staff: Boolean(u.is_staff),
          is_superuser: Boolean(u.is_superuser),
          last_login: u.last_login ?? null,
          ultima_actividad: u.ultima_actividad ?? null,
          en_linea: Boolean(u.en_linea),
        }
      : null,
  }
}

export function desdeCuenta(u: UsuarioAdmin): Integrante {
  const e = u.empleado
  return {
    clave: e ? `e-${e.id}` : `u-${u.id}`,
    empleado: e
      ? {
          id: e.id,
          nombre: e.nombre,
          apellido: e.apellido,
          nombre_completo: e.nombre_completo,
          sucursal: e.sucursal ?? null,
          creado: e.creado,
        }
      : null,
    cuenta: {
      id: u.id,
      username: u.username,
      email: u.email,
      is_active: u.is_active,
      rol: u.rol,
      es_administrador: Boolean(u.es_administrador ?? (u.is_superuser || u.is_staff || u.rol?.es_admin)),
      is_staff: u.is_staff,
      is_superuser: u.is_superuser,
      last_login: u.last_login,
      ultima_actividad: u.ultima_actividad,
      en_linea: u.en_linea,
    },
  }
}

/** Cómo se llama en pantalla: su nombre, o el usuario si es una cuenta suelta. */
export function nombreDe(i: Integrante): string {
  return i.empleado?.nombre_completo ?? (i.cuenta ? `@${i.cuenta.username}` : 'Sin nombre')
}

export type EstadoAcceso = 'sin_acceso' | 'pausado' | 'activo'

export function estadoAcceso(i: Integrante): EstadoAcceso {
  if (!i.cuenta) return 'sin_acceso'
  return i.cuenta.is_active ? 'activo' : 'pausado'
}
