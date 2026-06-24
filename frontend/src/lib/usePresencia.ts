import { useEffect, useRef } from 'react'
import { api } from '@/lib/api'
import { useAuth } from '@/store/auth'

/**
 * Presencia / "última vez activo".
 *
 * Mientras la sesión está abierta, manda un latido liviano al backend que
 * actualiza `ultima_actividad`. Buenas prácticas para no sobrecargar nada:
 *  - Sólo late si la pestaña está VISIBLE y hubo INTERACCIÓN reciente (no marca
 *    activo a una pestaña abierta y abandonada).
 *  - Intervalo de 2 min; el backend además throttlea la escritura a 1/min.
 *  - Un latido inmediato al entrar y al volver a la pestaña.
 *
 * El POST falla en silencio: la presencia nunca debe romper la experiencia.
 */

const INTERVALO_LATIDO_MS = 2 * 60 * 1000 // cada 2 minutos
const LIMITE_INACTIVIDAD_MS = 5 * 60 * 1000 // sin interacción 5 min => no late

export function usePresencia() {
  const access = useAuth((s) => s.access)
  const ultimaInteraccion = useRef(Date.now())

  useEffect(() => {
    if (!access) return

    const marcarInteraccion = () => {
      ultimaInteraccion.current = Date.now()
      // También alimenta el corte por inactividad (con su propio throttle interno).
      useAuth.getState().marcarActividad()
    }

    const latir = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - ultimaInteraccion.current > LIMITE_INACTIVIDAD_MS) return
      const token = useAuth.getState().access
      if (!token) return
      api.post('/auth/heartbeat/', undefined, token).catch(() => {})
    }

    const alVolver = () => {
      if (document.visibilityState === 'visible') {
        marcarInteraccion()
        latir()
      }
    }

    // Eventos baratos para detectar que la persona "está ahí".
    const eventos: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'scroll', 'touchstart']
    eventos.forEach((ev) => window.addEventListener(ev, marcarInteraccion, { passive: true }))
    document.addEventListener('visibilitychange', alVolver)

    latir() // inmediato al montar
    const id = window.setInterval(latir, INTERVALO_LATIDO_MS)

    return () => {
      window.clearInterval(id)
      eventos.forEach((ev) => window.removeEventListener(ev, marcarInteraccion))
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [access])
}
