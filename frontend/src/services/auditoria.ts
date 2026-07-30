import type { PaginaAuditoria } from '@/types'
import { api } from '@/lib/api'
import { useAuth } from '@/store/auth'

/** Historial de auditoría (solo superadministrador). */

const token = () => useAuth.getState().access

export interface FiltrosAuditoria {
  /** Búsqueda libre sobre el objeto, el usuario o el tipo de cosa. */
  q?: string
  /** Username exacto (el filtro usa la foto, así incluye cuentas borradas). */
  usuario?: string
  accion?: string
  /** app_label del módulo (p. ej. `inventario`). */
  app?: string
  /** Fechas locales `aaaa-mm-dd`, inclusive. */
  desde?: string
  hasta?: string
  limit?: number
  offset?: number
}

export function listarAuditoria(filtros: FiltrosAuditoria = {}): Promise<PaginaAuditoria> {
  const params = new URLSearchParams()
  for (const [clave, valor] of Object.entries(filtros)) {
    if (valor !== undefined && valor !== null && valor !== '') params.set(clave, String(valor))
  }
  const query = params.toString()
  return api.get<PaginaAuditoria>(`/auditoria/${query ? `?${query}` : ''}`, token())
}
