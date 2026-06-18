import type { CSSProperties, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatCardProps {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: LucideIcon
  footer?: ReactNode
  className?: string
  style?: CSSProperties
}

/**
 * Tarjeta de métrica (KPI). El valor es el protagonista: tipografía mono
 * tabular grande. Entra con un micro-flip (`ct-count`) y eleva al hover.
 */
export function StatCard({ label, value, hint, icon: Icon, footer, className, style }: StatCardProps) {
  return (
    <div
      className={cn(
        // `container-type: inline-size` -> el valor puede dimensionarse con `cqi`
        // (relativo al ancho de ESTA tarjeta), así nunca se desborda.
        '[container-type:inline-size] group rounded-2xl border border-line bg-surface p-4 shadow-[0_1px_2px_rgba(10,10,11,0.04)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(10,10,11,0.08)] motion-reduce:hover:translate-y-0 sm:p-5',
        className,
      )}
      style={style}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 truncate text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-400">
          {label}
        </p>
        {Icon && (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-ink-50 text-ink-500 ring-1 ring-line transition-colors group-hover:bg-ink-900 group-hover:text-white">
            <Icon className="h-4 w-4" strokeWidth={1.75} />
          </span>
        )}
      </div>

      {/* Tamaño fluido: el valor escala con el ancho de la tarjeta (cqi) y se
          acota entre 0.8rem y 1.7rem. Números tabulares sans (más angostos que
          el mono) + overflow-hidden para que jamás se salga de la tarjeta. */}
      <p className="ct-count mt-2 block overflow-hidden whitespace-nowrap text-[clamp(0.8rem,11.5cqi,1.7rem)] font-bold leading-none tracking-tight tabular-nums text-ink-950">
        {value}
      </p>

      {hint && <p className="mt-1.5 text-xs text-ink-500">{hint}</p>}
      {footer && <div className="mt-3">{footer}</div>}
    </div>
  )
}
