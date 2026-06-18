import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ToastViewport } from '@/components/ui/Toast'
import type { ToastItem, ToastTone } from '@/components/ui/Toast'

/**
 * Notificaciones tipo "toast" para toda la app, de forma imperativa:
 *   const toast = useToast()
 *   toast.success('Producto guardado')
 *   toast.error('No se pudo guardar', 'Reintentá en un momento')
 */

interface ToastOptions {
  title: string
  description?: string
  tone?: ToastTone
  duration?: number
}

interface ToastApi {
  show: (options: ToastOptions) => number
  success: (title: string, description?: string) => number
  error: (title: string, description?: string) => number
  info: (title: string, description?: string) => number
  dismiss: (id: number) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const DEFAULT_DURATION = 3500
const EXIT_MS = 260
const MAX_VISIBLE = 4

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const clearTimer = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const dismiss = useCallback(
    (id: number) => {
      clearTimer(id)
      setToasts((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)))
      const exit = setTimeout(() => {
        setToasts((list) => list.filter((t) => t.id !== id))
        timers.current.delete(id)
      }, EXIT_MS)
      timers.current.set(id, exit)
    },
    [clearTimer],
  )

  const show = useCallback(
    (options: ToastOptions) => {
      const id = (idRef.current += 1)
      const duration = options.duration ?? DEFAULT_DURATION
      const item: ToastItem = {
        id,
        tone: options.tone ?? 'success',
        title: options.title,
        description: options.description,
        duration,
        leaving: false,
      }
      setToasts((list) => [...list, item].slice(-MAX_VISIBLE))
      if (duration > 0) {
        timers.current.set(id, setTimeout(() => dismiss(id), duration))
      }
      return id
    },
    [dismiss],
  )

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (title, description) => show({ title, description, tone: 'success' }),
      error: (title, description) => show({ title, description, tone: 'error' }),
      info: (title, description) => show({ title, description, tone: 'info' }),
      dismiss,
    }),
    [show, dismiss],
  )

  useEffect(() => {
    const map = timers.current
    return () => {
      map.forEach((timer) => clearTimeout(timer))
      map.clear()
    }
  }, [])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>.')
  return ctx
}
