import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/store/auth'

/**
 * Corte de sesión por inactividad.
 *
 * Si pasan más de 6 horas sin actividad REAL del usuario (mouse/teclado/scroll,
 * registrada en `lastActivity` desde `usePresencia`), cerramos la sesión y vamos
 * al login. `lastActivity` se persiste, así que también cubre el caso de volver a
 * abrir la pestaña después de mucho tiempo (chequeo inmediato al montar).
 *
 * Mientras el usuario está activo, el cliente API renueva el token solo; este
 * watchdog es lo único que lo desloguea, y recién a las 6 h.
 */
const LIMITE_INACTIVIDAD_MS = 6 * 60 * 60 * 1000 // 6 horas
const INTERVALO_CHEQUEO_MS = 60 * 1000 // revisamos cada minuto

export function useInactividad() {
  const access = useAuth((s) => s.access)
  const logout = useAuth((s) => s.logout)
  const navigate = useNavigate()

  useEffect(() => {
    if (!access) return

    const revisar = () => {
      const { lastActivity } = useAuth.getState()
      if (lastActivity && Date.now() - lastActivity > LIMITE_INACTIVIDAD_MS) {
        logout()
        navigate('/login', { replace: true })
      }
    }

    revisar() // chequeo inmediato (cubre reapertura tras inactividad)
    const id = window.setInterval(revisar, INTERVALO_CHEQUEO_MS)
    return () => window.clearInterval(id)
  }, [access, logout, navigate])
}
