import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api, setUnauthorizedHandler } from '@/lib/api'
import type { Impersonacion, Usuario } from '@/types'

interface LoginResponse {
  access: string
  refresh: string
  user: Usuario
}

interface TokenPair {
  access: string
  refresh: string
}

/** Respuesta del canje del pase de impersonación (ver `ImpersonarPage`). */
export interface CanjeImpersonacion extends LoginResponse {
  impersonacion: { actor: { id: number; username: string }; expira: string }
}

interface AuthState {
  usuario: Usuario | null
  access: string | null
  refresh: string | null
  /** Marca de la última actividad real del usuario (ms). Para el corte por inactividad. */
  lastActivity: number
  /** Sesión prestada: quién impersona, hasta cuándo y a qué cuenta volver. */
  impersonacion: Impersonacion | null
  /** Login real contra el backend: identificador (email O usuario) + contraseña. */
  login: (identifier: string, password: string) => Promise<void>
  /** Refresca los datos del usuario (rol/permisos) desde `/api/auth/me/`. */
  refrescarUsuario: () => Promise<void>
  /** Renueva el par de tokens con el refresh token. true si lo logró. */
  refrescarTokens: () => Promise<boolean>
  /** Registra actividad del usuario (con throttle) para el corte por inactividad. */
  marcarActividad: () => void
  /** Entra como otra cuenta guardando la sesión propia para poder volver. */
  entrarComo: (datos: CanjeImpersonacion) => void
  /** Vuelve a la cuenta propia. `false` si ya no había sesión a la que volver. */
  volverAMiCuenta: () => boolean
  logout: () => void
}

/**
 * Sesión basada en JWT. `persist` guarda usuario + tokens en localStorage para
 * que sobreviva al refresco. El login llama a `POST /api/auth/login/`, que acepta
 * el email o el nombre de usuario indistintamente.
 */
/** Evita refrescos de token simultáneos: comparten la misma promesa en vuelo. */
let refrescoEnCurso: Promise<boolean> | null = null
/** Throttle de escritura de `lastActivity` (con 30 s alcanza para un corte de 6 h). */
let ultimaMarca = 0

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      usuario: null,
      access: null,
      refresh: null,
      lastActivity: Date.now(),
      impersonacion: null,
      login: async (identifier, password) => {
        const data = await api.post<LoginResponse>('/auth/login/', { identifier, password })
        set({
          usuario: data.user,
          access: data.access,
          refresh: data.refresh,
          lastActivity: Date.now(),
          impersonacion: null,
        })
      },
      refrescarUsuario: async () => {
        const access = get().access
        if (!access) return
        try {
          const usuario = await api.get<Usuario>('/auth/me/', access)
          set({ usuario })
        } catch {
          // Token vencido/invalidado: el manejo de 401 del cliente ya intentó
          // refrescar y, si no pudo, cerró la sesión. No hacemos nada agresivo acá.
        }
      },
      refrescarTokens: async () => {
        const refresh = get().refresh
        if (!refresh) return false
        if (!refrescoEnCurso) {
          refrescoEnCurso = (async () => {
            try {
              const data = await api.post<TokenPair>('/auth/refresh/', { refresh })
              set({ access: data.access, refresh: data.refresh })
              return true
            } catch {
              return false
            } finally {
              refrescoEnCurso = null
            }
          })()
        }
        return refrescoEnCurso
      },
      marcarActividad: () => {
        const ahora = Date.now()
        if (ahora - ultimaMarca < 30_000) return // throttle: a lo sumo 1 escritura/30 s
        ultimaMarca = ahora
        set({ lastActivity: ahora })
      },
      entrarComo: (datos) => {
        const { usuario, access, refresh, impersonacion } = get()
        // La sesión propia queda guardada tal cual para volver a ella sin tener
        // que iniciar sesión de nuevo. Si no había (se entró desde el admin en
        // una pestaña limpia), al salir se va al login. Si ya se estaba
        // impersonando, se conserva la ORIGINAL: encadenar impersonaciones no
        // debe perder la cuenta propia.
        const sesionPrevia =
          impersonacion?.sesionPrevia ??
          (usuario && access && refresh ? { usuario, access, refresh } : null)
        set({
          usuario: datos.user,
          access: datos.access,
          refresh: datos.refresh,
          lastActivity: Date.now(),
          impersonacion: {
            actor: datos.impersonacion.actor,
            expira: datos.impersonacion.expira,
            sesionPrevia,
          },
        })
      },
      volverAMiCuenta: () => {
        const previa = get().impersonacion?.sesionPrevia ?? null
        if (!previa) {
          set({ usuario: null, access: null, refresh: null, impersonacion: null })
          return false
        }
        set({
          usuario: previa.usuario,
          access: previa.access,
          refresh: previa.refresh,
          lastActivity: Date.now(),
          impersonacion: null,
        })
        return true
      },
      logout: () => set({ usuario: null, access: null, refresh: null, impersonacion: null }),
    }),
    {
      name: 'celtuc-auth',
      // v3: el usuario ahora trae rol/permisos. Las sesiones viejas no los tienen,
      // así que al subir de versión descartamos la sesión y obligamos a re-loguear.
      version: 3,
      migrate: () => ({
        usuario: null,
        access: null,
        refresh: null,
        lastActivity: Date.now(),
        impersonacion: null,
      }),
      partialize: (s) => ({
        usuario: s.usuario,
        access: s.access,
        refresh: s.refresh,
        lastActivity: s.lastActivity,
        impersonacion: s.impersonacion,
      }),
    },
  ),
)

// Manejo central de 401: intenta refrescar el token; si no se puede (refresh
// vencido tras la inactividad), cierra la sesión y deja que RequireAuth redirija.
setUnauthorizedHandler(async () => {
  const ok = await useAuth.getState().refrescarTokens()
  if (ok) return useAuth.getState().access
  // Si era una sesión prestada (venció el límite de 2 h, o al superadmin le
  // sacaron el poder), no se pierde la sesión propia: se vuelve a ella.
  if (useAuth.getState().impersonacion) {
    useAuth.getState().volverAMiCuenta()
    return null
  }
  useAuth.getState().logout()
  return null
})
