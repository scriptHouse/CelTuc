import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

/**
 * Modal / diálogo base, reutilizable.
 *  - Portal sobre `document.body` (por encima de todo, sin pelear z-index).
 *  - 100% responsive: bottom-sheet en móvil, tarjeta centrada en escritorio.
 *  - Accesible: role="dialog", aria-modal, foco atrapado, Escape, clic en fondo.
 *  - Respeta `prefers-reduced-motion`.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

const sizes = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-2xl',
} as const

interface ModalProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  size?: keyof typeof sizes
  dismissable?: boolean
  labelledBy?: string
  describedBy?: string
  className?: string
}

export function Modal({
  open,
  onClose,
  children,
  size = 'md',
  dismissable = true,
  labelledBy,
  describedBy,
  className,
}: ModalProps) {
  const [mounted, setMounted] = useState(open)
  const [entered, setEntered] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const lastFocused = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (open) {
      setMounted(true)
      return
    }
    setEntered(false)
    const t = setTimeout(() => setMounted(false), 200)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (mounted && open) {
      const raf = requestAnimationFrame(() => setEntered(true))
      return () => cancelAnimationFrame(raf)
    }
  }, [mounted, open])

  useEffect(() => {
    if (!mounted) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [mounted])

  useEffect(() => {
    if (open) {
      lastFocused.current = (document.activeElement as HTMLElement | null) ?? null
    } else {
      lastFocused.current?.focus?.()
    }
  }, [open])

  useEffect(() => {
    if (!entered) return
    const panel = panelRef.current
    if (!panel) return
    const target =
      panel.querySelector<HTMLElement>('[data-autofocus]') ??
      panel.querySelector<HTMLElement>(FOCUSABLE) ??
      panel
    target.focus()
  }, [entered])

  if (!mounted) return null

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    const panel = panelRef.current
    if (!panel) return
    const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null,
    )
    if (focusables.length === 0) {
      event.preventDefault()
      return
    }
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    const active = document.activeElement
    if (event.shiftKey && (active === first || !panel.contains(active))) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      onKeyDown={handleKeyDown}
    >
      <div
        aria-hidden="true"
        onClick={dismissable ? onClose : undefined}
        className={cn(
          'absolute inset-0 bg-overlay backdrop-blur-[3px] transition-opacity duration-200 motion-reduce:transition-none',
          entered ? 'opacity-100' : 'opacity-0',
        )}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[92dvh] w-full origin-bottom flex-col overflow-hidden border border-line bg-surface shadow-2xl outline-none',
          'rounded-t-3xl sm:origin-center sm:rounded-3xl',
          'transition duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform motion-reduce:transition-none',
          sizes[size],
          entered
            ? 'translate-y-0 opacity-100 sm:scale-100'
            : 'translate-y-full opacity-0 sm:translate-y-3 sm:scale-95',
          className,
        )}
      >
        <span
          aria-hidden="true"
          className="mx-auto mt-2.5 block h-1.5 w-10 shrink-0 rounded-full bg-ink-200 sm:hidden"
        />
        {children}
      </div>
    </div>,
    document.body,
  )
}
