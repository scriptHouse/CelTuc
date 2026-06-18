import type { CSSProperties, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: ReactNode
  subtitle?: ReactNode
  icon?: LucideIcon
  eyebrow?: string
  actions?: ReactNode
  className?: string
  style?: CSSProperties
}

/**
 * Encabezado de pantalla estándar. Tratamiento tipográfico minimalista y
 * consistente en todas las páginas (inspirado en Linear / Vercel / Stripe).
 */
export function PageHeader({
  title,
  subtitle,
  icon: Icon,
  eyebrow,
  actions,
  className,
  style,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        'mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
      style={style}
    >
      <div className="flex min-w-0 items-start gap-3.5">
        {Icon && (
          <span
            aria-hidden
            className="mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-ink-950 text-white"
          >
            <Icon className="h-[1.3rem] w-[1.3rem]" strokeWidth={1.75} />
          </span>
        )}

        <div className="min-w-0">
          {eyebrow && (
            <span className="mb-1.5 flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-ink-400">
              <span aria-hidden className="h-px w-5 rounded-full bg-ink-300" />
              {eyebrow}
            </span>
          )}
          <h1 className="text-balance text-2xl font-bold tracking-[-0.02em] text-ink-950 sm:text-[1.75rem]">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1.5 max-w-xl text-pretty text-sm leading-relaxed text-ink-500">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {actions && <div className="flex shrink-0 items-center gap-2 sm:pt-0.5">{actions}</div>}
    </header>
  )
}
