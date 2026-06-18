import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Usuario } from '@/types'

interface AuthState {
  usuario: Usuario | null
  /** Login sin credenciales: alcanza con entrar (demo). */
  login: () => void
  logout: () => void
}

const DEMO_USER: Usuario = {
  id: 'u-celtuc',
  nombre: 'Equipo CelTuc',
  rol: 'Administrador',
}

/**
 * Sesión mínima. `persist` la guarda en localStorage para que sobreviva al
 * refresco. Por ahora el login no pide credenciales: solo marca la sesión.
 */
export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      usuario: null,
      login: () => set({ usuario: DEMO_USER }),
      logout: () => set({ usuario: null }),
    }),
    { name: 'celtuc-auth' },
  ),
)
