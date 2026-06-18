import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/store/auth'

/** Protege rutas: sin sesión, redirige al login conservando el origen. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const usuario = useAuth((s) => s.usuario)
  const location = useLocation()

  if (!usuario) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }
  return <>{children}</>
}
