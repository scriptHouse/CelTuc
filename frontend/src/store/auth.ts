import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api } from '@/lib/api'
import type { Usuario } from '@/types'

interface LoginResponse {
  access: string
  refresh: string
  user: Usuario
}

interface AuthState {
  usuario: Usuario | null
  access: string | null
  refresh: string | null
  /** Login real contra el backend: identificador (email O usuario) + contraseña. */
  login: (identifier: string, password: string) => Promise<void>
  /** Refresca los datos del usuario (rol/permisos) desde `/api/auth/me/`. */
  refrescarUsuario: () => Promise<void>
  logout: () => void
}

/**
 * Sesión basada en JWT. `persist` guarda usuario + tokens en localStorage para
 * que sobreviva al refresco. El login llama a `POST /api/auth/login/`, que acepta
 * el email o el nombre de usuario indistintamente.
 */
export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      usuario: null,
      access: null,
      refresh: null,
      login: async (identifier, password) => {
        const data = await api.post<LoginResponse>('/auth/login/', { identifier, password })
        set({ usuario: data.user, access: data.access, refresh: data.refresh })
      },
      refrescarUsuario: async () => {
        const access = get().access
        if (!access) return
        try {
          const usuario = await api.get<Usuario>('/auth/me/', access)
          set({ usuario })
        } catch {
          // Token vencido/invalidado: la próxima llamada protegida ya redirige al
          // login; no rompemos la sesión actual de forma agresiva acá.
        }
      },
      logout: () => set({ usuario: null, access: null, refresh: null }),
    }),
    {
      name: 'celtuc-auth',
      // v3: el usuario ahora trae rol/permisos. Las sesiones viejas no los tienen,
      // así que al subir de versión descartamos la sesión y obligamos a re-loguear.
      version: 3,
      migrate: () => ({ usuario: null, access: null, refresh: null }),
      partialize: (s) => ({ usuario: s.usuario, access: s.access, refresh: s.refresh }),
    },
  ),
)
