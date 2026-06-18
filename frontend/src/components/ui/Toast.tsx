import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ToastTone = 'success' | 'error' | 'info'

export interface ToastItem {
  id: number
  tone: ToastTone
  title: string
  description?: string
  duration: number
  leaving?: boolean
}

const ICONS: Record<ToastTone, LucideIcon> = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const [entered, setEntered] = useState(false)
  const Icon = ICONS[toast.tone]

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  const visible = entered && !toast.leaving

  return (
    <div
      role="status"
      className={cn(
        'pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-2xl border border-line bg-surface/95 shadow-[0_18px_45px_rgba(10,10,11,0.16)] backdrop-blur-xl',
        'transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform motion-reduce:transition-none',
        visible ? 'translate-y-0 scale-100 opacity-100' : '-translate-y-3 scale-[0.97] opacity-0',
      )}
    >
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 overflow-hidden">
        <span
          className="ct-toast-progress block h-full bg-gradient-to-r from-ink-300 via-ink-600 to-ink-900"
          style={{ '--ct-toast-duration': `${toast.duration}ms` } as CSSProperties}
        />
      </span>

      <div className="flex items-start gap-3 p-3.5 pr-10">
        <span className="relative mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink-100">
          <Icon className="relative h-5 w-5 text-ink-900" strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1 pt-1">
          <p className="text-sm font-semibold leading-snug text-ink-900">{toast.title}</p>
          {toast.description && (
            <p className="mt-0.5 text-[0.8rem] leading-snug text-ink-500">{toast.description}</p>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Cerrar notificación"
        className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

export function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[]
  onDismiss: (id: number) => void
}) {
  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      aria-live="polite"
      aria-atomic="false"
      className={cn(
        'pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2.5 px-3',
        'pt-[calc(env(safe-area-inset-top,0px)+4rem)] lg:items-end lg:px-8 lg:pt-[calc(env(safe-area-inset-top,0px)+1.5rem)]',
      )}
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </div>,
    document.body,
  )
}
