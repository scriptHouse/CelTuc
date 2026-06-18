import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'

interface MiniBarsProps {
  data: Array<{ label: string; valor: number }>
  /** Altura del área de barras en px. */
  height?: number
  /** Formateador del valor para el tooltip nativo. */
  format?: (n: number) => string
  className?: string
}

/**
 * Mini gráfico de barras inline, monocromático. La última barra (período
 * actual) se resalta en negro; el resto en gris. Las barras crecen desde la
 * base con `ct-bar` (respeta reduced-motion). El valor exacto va en `title`.
 */
export function MiniBars({ data, height = 120, format, className }: MiniBarsProps) {
  const max = Math.max(1, ...data.map((d) => d.valor))

  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-end gap-2" style={{ height }}>
        {data.map((d, i) => {
          const isLast = i === data.length - 1
          const pct = Math.max(4, Math.round((d.valor / max) * 100))
          return (
            <div key={`${d.label}-${i}`} className="flex min-w-0 flex-1 flex-col items-center justify-end" style={{ height: '100%' }}>
              <div
                className={cn(
                  'ct-bar w-full rounded-t-md',
                  isLast ? 'bg-ink-900' : 'bg-ink-200 group-hover:bg-ink-300',
                )}
                style={{ height: `${pct}%`, '--ct-index': i } as CSSProperties}
                title={format ? format(d.valor) : String(d.valor)}
              />
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex gap-2">
        {data.map((d, i) => (
          <span
            key={`${d.label}-l-${i}`}
            className={cn(
              'min-w-0 flex-1 truncate text-center text-[10px] uppercase tracking-wide',
              i === data.length - 1 ? 'font-semibold text-ink-700' : 'text-ink-400',
            )}
          >
            {d.label}
          </span>
        ))}
      </div>
    </div>
  )
}
