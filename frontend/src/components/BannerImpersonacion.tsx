import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, UserRoundCog } from 'lucide-react'
import { useAuth } from '@/store/auth'

/** "1 h 58 min" / "9 min" / "menos de 1 min" — lo que queda de impersonación. */
function restante(expira: string): string {
  const ms = new Date(expira).getTime() - Date.now()
  if (!Number.isFinite(ms) || ms <= 0) return 'expirada'
  const minutos = Math.floor(ms / 60_000)
  if (minutos < 1) return 'menos de 1 min'
  const horas = Math.floor(minutos / 60)
  return horas > 0 ? `${horas} h ${minutos % 60} min` : `${minutos} min`
}

/**
 * Barra fija que avisa que la sesión NO es propia: el superadministrador entró
 * como otra cuenta desde el admin de Django.
 *
 * Es deliberadamente imposible de ignorar (color de alerta, siempre visible, en
 * todas las pantallas): nadie debería hacer nada creyendo que está en su cuenta.
 * Desde acá se vuelve a la propia de un clic, sin volver a iniciar sesión.
 */
export function BannerImpersonacion() {
  const impersonacion = useAuth((s) => s.impersonacion)
  const usuario = useAuth((s) => s.usuario)
  const volverAMiCuenta = useAuth((s) => s.volverAMiCuenta)
  const navigate = useNavigate()

  // El texto del tiempo restante se refresca solo (cada 30 s alcanza).
  const [, tick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 30_000)
    return () => window.clearInterval(id)
  }, [])

  if (!impersonacion) return null

  const salir = () => {
    const volvio = volverAMiCuenta()
    navigate(volvio ? '/' : '/login', { replace: true })
  }

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[60] flex h-11 items-center gap-3 bg-amber-400 px-3 text-amber-950 shadow-[0_2px_12px_rgba(10,10,11,0.18)] sm:px-4"
    >
      <UserRoundCog className="h-4 w-4 shrink-0" strokeWidth={2.2} />

      <p className="min-w-0 flex-1 truncate text-xs font-medium sm:text-sm">
        <span className="hidden sm:inline">Estás viendo el sistema como </span>
        <span className="sm:hidden">Viendo como </span>
        <span className="font-bold">{usuario?.username}</span>
        <span className="hidden text-amber-950/70 md:inline">
          {' '}
          · {impersonacion.actor.username} · quedan {restante(impersonacion.expira)}
        </span>
      </p>

      <button
        type="button"
        onClick={salir}
        className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg bg-amber-950 px-2.5 text-xs font-semibold text-amber-50 transition-colors hover:bg-amber-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-950 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-400 sm:px-3"
      >
        <LogOut className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Volver a mi cuenta</span>
        <span className="sm:hidden">Salir</span>
      </button>
    </div>
  )
}
