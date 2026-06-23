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
  logout: () => void
}

/**
 * Sesión basada en JWT. `persist` guarda usuario + tokens en localStorage para
 * que sobreviva al refresco. El login llama a `POST /api/auth/login/`, que acepta
 * el email o el nombre de usuario indistintamente.
 */
export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      usuario: null,
      access: null,
      refresh: null,
      login: async (identifier, password) => {
        const data = await api.post<LoginResponse>('/auth/login/', { identifier, password })
        set({ usuario: data.user, access: data.access, refresh: data.refresh })
      },
      logout: () => set({ usuario: null, access: null, refresh: null }),
    }),
    {
      name: 'celtuc-auth',
      // v2: el modelo de sesión cambió (antes era demo sin credenciales). Al subir
      // de versión, descartamos cualquier sesión vieja y obligamos a re-loguear.
      version: 2,
      migrate: () => ({ usuario: null, access: null, refresh: null }),
      partialize: (s) => ({ usuario: s.usuario, access: s.access, refresh: s.refresh }),
    },
  ),
)
