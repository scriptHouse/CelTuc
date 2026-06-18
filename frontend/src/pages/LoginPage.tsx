import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Loader2 } from 'lucide-react'
import { useAuth } from '@/store/auth'
import { Button } from '@/components/ui/Button'
import { BrandMark, BrandWordmark } from '@/components/Brand'

/**
 * Login minimalista. Por diseño NO pide credenciales: alcanza con tocar
 * "Ingresar". Pensado para una demo local; cuando exista backend, acá se
 * conecta el formulario real sin tocar el resto de la app.
 */
export function LoginPage() {
  const usuario = useAuth((s) => s.usuario)
  const login = useAuth((s) => s.login)
  const navigate = useNavigate()
  const location = useLocation()
  const [loading, setLoading] = useState(false)

  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/'

  // Si ya hay sesión, no mostramos el login.
  if (usuario) return <Navigate to={from} replace />

  function handleLogin() {
    setLoading(true)
    // Pequeña transición para que el ingreso se sienta fluido.
    window.setTimeout(() => {
      login()
      navigate(from, { replace: true })
    }, 480)
  }

  return (
    <div className="relative grid min-h-[100dvh] place-items-center overflow-hidden bg-canvas px-6">
      {/* Fondo decorativo, sutil y no invasivo (monocromático). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(80% 60% at 50% 0%, rgba(10,10,11,0.05), transparent 70%), radial-gradient(circle at 1px 1px, rgba(10,10,11,0.05) 1px, transparent 0)',
          backgroundSize: 'auto, 28px 28px',
        }}
      />

      <div className="relative w-full max-w-sm animate-fade-in text-center">
        <div className="mb-6 flex justify-center">
          <BrandMark className="h-16 w-16 rounded-[1.25rem] shadow-[0_18px_45px_rgba(10,10,11,0.25)]" />
        </div>

        <BrandWordmark showApple={false} className="text-[2.6rem] leading-none" />
        <p className="mt-3 text-sm text-ink-500">
          Software de gestión · inventario, facturación y equipo.
        </p>

        <div className="mt-9">
          <Button size="lg" className="w-full" onClick={handleLogin} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Ingresando…
              </>
            ) : (
              <>
                Ingresar
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>

          <p className="mt-4 text-xs text-ink-400">
            Acceso de demostración — no requiere credenciales.
          </p>
        </div>
      </div>

      <p className="absolute bottom-6 left-0 right-0 text-center text-xs text-ink-300">
        CelTuc · Tucumán, Argentina
      </p>
    </div>
  )
}
