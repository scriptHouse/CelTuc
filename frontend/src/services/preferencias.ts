import { api } from '@/lib/api'
import { useAuth } from '@/store/auth'

/**
 * Preferencias globales de la app (backend `comun`): un valor compartido por
 * todos los usuarios y dispositivos, por clave. Las claves válidas las declara
 * el backend (`CLAVES_PREFERENCIAS`); un valor vacío significa «sin
 * personalizar» y cada pantalla usa su texto por defecto.
 */

const token = () => useAuth.getState().access

export interface Preferencia {
  clave: string
  valor: string
}

export function obtenerPreferencia(clave: string): Promise<Preferencia> {
  return api.get<Preferencia>(`/preferencias/${clave}/`, token())
}

export function guardarPreferencia(clave: string, valor: string): Promise<Preferencia> {
  return api.put<Preferencia>(`/preferencias/${clave}/`, { valor }, token())
}
