import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Lock, LogOut } from 'lucide-react'
import { useAuth } from '@/store/auth'
import { esAdmin, primeraRutaPermitida, puedeVer } from '@/lib/permisos'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'

/**
 * Protege una ruta según el sistema de roles:
 *  - `soloAdmin`: sólo administradores.
 *  - `permiso`: requiere ese código de módulo (los admin pasan siempre).
 *
 * Si la cuenta no tiene acceso, la mandamos a su primer módulo permitido; si no
 * tiene ninguno, mostramos una pantalla amable. Es UX: el backend igual valida.
 */
export function RequirePermiso({
  children,
  permiso,
  soloAdmin = false,
}: {
  children: ReactNode
  permiso?: string
  soloAdmin?: boolean
}) {
  const usuario = useAuth((s) => s.usuario)
  const location = useLocation()

  const autorizado = soloAdmin ? esAdmin(usuario) : puedeVer(usuario, permiso)
  if (autorizado) return <>{children}</>

  const destino = primeraRutaPermitida(usuario)
  // Redirigimos a un módulo permitido distinto del actual (evita bucles).
  if (destino && destino !== location.pathname) {
    return <Navigate to={destino} replace />
  }
  return <SinAcceso />
}

/** La cuenta no tiene acceso a ningún módulo: sólo le queda salir. */
function SinAcceso() {
  const logout = useAuth((s) => s.logout)
  return (
    <div className="grid min-h-[60dvh] place-items-center px-4">
      <EmptyState
        icon={Lock}
        title="Sin acceso asignado"
        description="Tu cuenta todavía no tiene permisos para ver módulos. Pedile a un administrador que te asigne un rol."
        action={
          <Button variant="outline" onClick={logout}>
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </Button>
        }
      />
    </div>
  )
}
