/**
 * Helpers de autorización en el frontend.
 *
 * La fuente de verdad es el backend: el usuario llega con `es_administrador` y la
 * lista de `permisos` (códigos de módulo). Acá sólo decidimos qué mostrar. El
 * backend igual valida cada endpoint, así que esto es UX, no seguridad.
 */
import type { Usuario } from '@/types'
import { navItems } from '@/components/navItems'

/** ¿La cuenta administra el sistema? (superusuario, staff o rol admin). */
export function esAdmin(usuario?: Usuario | null): boolean {
  if (!usuario) return false
  // `es_administrador` lo calcula el backend; el resto son respaldos por si la
  // sesión guardada es vieja y todavía no tiene el campo.
  return Boolean(usuario.es_administrador || usuario.is_superuser || usuario.is_staff)
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
  const item = navItems.find((it) =>
    it.soloAdmin ? esAdmin(usuario) : puedeVer(usuario, it.permiso),
  )
  return item?.to ?? null
}
