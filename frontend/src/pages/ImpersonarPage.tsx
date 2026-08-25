import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, ShieldAlert, UserRoundCog } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { useAuth, type CanjeImpersonacion } from '@/store/auth'
import { BrandMark } from '@/components/Brand'
import { Button } from '@/components/ui/Button'

/**
 * Aterrizaje de la impersonación: acá vuelve el navegador desde el admin de
 * Django con un pase de un solo uso.
 *
 * El pase viaja en el FRAGMENTO de la URL (`#ticket=…`) porque el navegador
 * nunca lo manda al servidor: no queda en los logs de nginx ni del proxy. Se lee,
 * se borra de la barra de direcciones y se canjea por la sesión de esa cuenta.
 */
export function ImpersonarPage() {
  const entrarComo = useAuth((s) => s.entrarComo)
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  // El pase es de un solo uso: en desarrollo React monta dos veces (StrictMode)
  // y sin esto el segundo intento lo encontraría ya quemado.
  const yaCanjeado = useRef(false)

  useEffect(() => {
    if (yaCanjeado.current) return
    yaCanjeado.current = true

    const ticket = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('ticket')
    // La barra de direcciones se limpia YA: el pase no queda en el historial ni
    // se filtra por el `Referer` de la próxima navegación.
    window.history.replaceState(null, '', '/impersonar')

    if (!ticket) {
      setError('El enlace no trae ningún pase de impersonación.')
      return
    }

    api
      .post<CanjeImpersonacion>('/auth/impersonar/canjear/', { ticket })
      .then((datos) => {
        entrarComo(datos)
        navigate('/', { replace: true })
      })
      .catch((err) => {
        setError(
          err instanceof ApiError
            ? err.message
            : 'No se pudo iniciar la sesión. Probá de nuevo desde el panel de administración.',
        )
      })
  }, [entrarComo, navigate])

  return (
    <div className="grid min-h-[100dvh] place-items-center bg-canvas px-5">
      <div className="w-full max-w-sm text-center">
        <BrandMark className="mx-auto h-11 w-11" />

        {error ? (
          <>
            <span className="mx-auto mt-6 grid h-12 w-12 place-items-center rounded-2xl bg-ink-950 text-on-ink">
              <ShieldAlert className="h-5 w-5" />
            </span>
            <h1 className="mt-4 text-lg font-semibold text-ink-950">No se pudo impersonar</h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">{error}</p>
            <p className="mt-1 text-xs text-ink-400">
              Los pases duran un minuto y sirven una sola vez: volvé al panel y apretá «Impersonar»
              de nuevo.
            </p>
            <Button className="mt-6 w-full" onClick={() => navigate('/', { replace: true })}>
              Ir al inicio
            </Button>
          </>
        ) : (
          <>
            <span className="mx-auto mt-6 grid h-12 w-12 place-items-center rounded-2xl bg-ink-100 text-ink-900">
              <UserRoundCog className="h-5 w-5" />
            </span>
            <h1 className="mt-4 flex items-center justify-center gap-2 text-lg font-semibold text-ink-950">
              <Loader2 className="h-4 w-4 animate-spin" />
              Preparando la sesión
            </h1>
            <p className="mt-2 text-sm text-ink-500">Entrando como la cuenta elegida…</p>
          </>
        )}
      </div>
    </div>
  )
}
