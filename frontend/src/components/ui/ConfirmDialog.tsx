import { useId } from 'react'
import type { ReactNode } from 'react'
import { AlertTriangle, ShieldCheck, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/utils'

export type ConfirmTone = 'brand' | 'danger' | 'warning'

export interface ConfirmOptions {
  title: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: ConfirmTone
  icon?: LucideIcon
}

const tones: Record<ConfirmTone, { chip: string; defaultIcon: LucideIcon }> = {
  // En monocromo, el chip OSCURO señala intención fuerte/destructiva.
  brand: { chip: 'bg-ink-100 text-ink-900', defaultIcon: ShieldCheck },
  danger: { chip: 'bg-ink-950 text-on-ink', defaultIcon: AlertTriangle },
  warning: { chip: 'bg-ink-100 text-ink-900', defaultIcon: AlertTriangle },
}

interface ConfirmDialogProps {
  open: boolean
  options?: ConfirmOptions
  onResolve: (result: boolean) => void
}

export function ConfirmDialog({ open, options, onResolve }: ConfirmDialogProps) {
  const titleId = useId()
  const descId = useId()

  const opts = options ?? { title: '' }
  const tone = opts.tone ?? 'brand'
  const style = tones[tone]
  const Icon = opts.icon ?? style.defaultIcon
  const confirmLabel = opts.confirmLabel ?? 'Confirmar'
  const cancelLabel = opts.cancelLabel ?? 'Cancelar'
  const autofocusConfirm = tone !== 'danger'

  return (
    <Modal
      open={open}
      onClose={() => onResolve(false)}
      size="sm"
      labelledBy={titleId}
      describedBy={opts.description ? descId : undefined}
    >
      <button
        type="button"
        onClick={() => onResolve(false)}
        aria-label="Cerrar"
        className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="overflow-y-auto px-5 pb-7 pt-6 sm:px-6 sm:pb-6">
        <div className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left">
          <span className="relative mb-3.5 grid h-14 w-14 shrink-0 place-items-center sm:mb-0 sm:mr-4">
            <span className={cn('ct-modal-halo absolute inset-0 rounded-2xl', style.chip)} />
            <span className={cn('relative grid h-14 w-14 place-items-center rounded-2xl', style.chip)}>
              <Icon className="h-7 w-7" strokeWidth={2} />
            </span>
          </span>

          <div className="min-w-0 sm:pt-0.5">
            <h2 id={titleId} className="text-lg font-semibold text-ink-950">
              {opts.title}
            </h2>
            {opts.description && (
              <div id={descId} className="mt-1.5 text-sm leading-relaxed text-ink-500">
                {opts.description}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <button
            type="button"
            data-autofocus={autofocusConfirm ? undefined : ''}
            onClick={() => onResolve(false)}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-line-strong px-5 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 sm:h-10"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            data-autofocus={autofocusConfirm ? '' : undefined}
            onClick={() => onResolve(true)}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-ink-950 px-5 text-sm font-semibold text-on-ink transition-colors hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 sm:h-10"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}
