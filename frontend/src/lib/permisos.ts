/**
 * Helpers de autorización en el frontend.
 *
 * La fuente de verdad es el backend: el usuario llega con `es_administrador` y la
 * lista de `permisos` (códigos de módulo). Acá sólo decidimos qué mostrar. El
 * backend igual valida cada endpoint, así que esto es UX, no seguridad.
 */
import type { Usuario } from '@/types'
import { navItems } from '@/components/navItems'
import type { NavItem } from '@/components/navItems'

/** ¿La cuenta administra el sistema? (superusuario, staff o rol admin). */
export function esAdmin(usuario?: Usuario | null): boolean {
  if (!usuario) return false
  // `es_administrador` lo calcula el backend; el resto son respaldos por si la
  // sesión guardada es vieja y todavía no tiene el campo.
  return Boolean(usuario.es_administrador || usuario.is_superuser || usuario.is_staff)
}

/** ¿Es el superadministrador (dueño)? Habilita lo reservado, como la auditoría. */
export function esSuperAdmin(usuario?: Usuario | null): boolean {
  return Boolean(usuario?.is_superuser)
}

/** ¿La cuenta puede ver este ítem del menú? (aplica soloSuper / soloAdmin / permiso). */
export function puedeVerItem(usuario: Usuario | null | undefined, item: NavItem): boolean {
  if (item.soloSuper) return esSuperAdmin(usuario)
  if (item.soloAdmin) return esAdmin(usuario)
  return puedeVer(usuario, item.permiso)
}

/** ¿La cuenta puede ver el módulo identificado por `permiso`? */
export function puedeVer(usuario: Usuario | null | undefined, permiso?: string): boolean {
  if (!usuario) return false
  if (esAdmin(usuario)) return true
  if (!permiso) return true
  return (usuario.permisos ?? []).includes(permiso)
}

/** Primera ruta del sidebar a la que la cuenta tiene acceso (o null si ninguna). */
export function primeraRutaPermitida(usuario: Usuario | null | undefined): string | null {
  const item = navItems.find((it) => puedeVerItem(usuario, it))
  return item?.to ?? null
}
