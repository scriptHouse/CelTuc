import { useId } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'
import { Check, Lightbulb, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { plata } from '@/lib/format'
import { cn, ctStagger } from '@/lib/utils'
import { hayMonto, leerMonto } from '@/components/caja/cierre/pasos'

/**
 * Piezas del cierre de caja. Todas pensadas para el dedo: áreas de toque
 * grandes, una sola idea por pieza y el estado dicho con palabras (nunca solo
 * con color).
 */

/** «¿Qué hago acá?»: la ayuda de cada paso, que se puede esconder. */
export function AyudaPaso({ texto, onOcultar }: { texto: string; onOcultar: () => void }) {
  return (
    <div className="ct-rise flex items-start gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5">
      <span
        aria-hidden
        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink-100 text-ink-700"
      >
        <Lightbulb className="h-4.5 w-4.5" strokeWidth={1.85} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-ink-400">
          ¿Qué hago acá?
        </p>
        <p className="mt-0.5 text-pretty text-sm leading-relaxed text-ink-700">{texto}</p>
      </div>
      <button
        type="button"
        onClick={onOcultar}
        aria-label="Ocultar las ayudas"
        title="Ocultar las ayudas (se vuelven a mostrar con el botón «Ayuda»)"
        className="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-300 transition-colors hover:bg-ink-100 hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

/**
 * Campo para escribir plata. Es texto (no `type=number`) a propósito: así
 * «10.000» se entiende como diez mil —como lo escribe cualquiera en Argentina—
 * y no como diez. Con `eco`, abajo repite cómo se leyó el número.
 */
export function CampoPlata({
  valor,
  onValor,
  grande,
  eco,
  className,
  ...props
}: {
  valor: string
  onValor: (texto: string) => void
  grande?: boolean
  eco?: boolean
  className?: string
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'className'>) {
  const legible = hayMonto(valor)
  return (
    <div className={className}>
      <div className="relative">
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute top-1/2 -translate-y-1/2 font-semibold text-ink-400',
            grande ? 'left-5 text-2xl' : 'left-3.5 text-base',
          )}
        >
          $
        </span>
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          value={valor}
          onChange={(e) => onValor(e.target.value)}
          onFocus={(e) => e.target.select()}
          className={cn(
            'tnum w-full rounded-xl border border-line-strong bg-surface text-ink-950',
            'placeholder:text-ink-300',
            'transition-[border-color,box-shadow] duration-150',
            'focus:border-ink-900 focus:outline-none focus:ring-2 focus:ring-ink-900/12',
            grande
              ? 'h-16 pl-11 pr-5 text-center text-3xl font-bold tracking-tight sm:h-[4.5rem] sm:text-4xl'
              : 'h-11 pl-8 pr-3.5 text-right text-base font-semibold',
          )}
          {...props}
        />
      </div>
      {eco && legible && (
        <p className={cn('mt-1.5 text-xs text-ink-500', grande ? 'text-center' : 'text-right')}>
          Se lee: <b className="tnum text-ink-800">{plata(leerMonto(valor))}</b>
        </p>
      )}
    </div>
  )
}

/** Una opción grande para elegir (se marca oscura al elegirla). */
export function BotonOpcion({
  activo,
  onClick,
  icono: Icono,
  titulo,
  descripcion,
  className,
}: {
  activo: boolean
  onClick: () => void
  icono?: LucideIcon
  titulo: ReactNode
  descripcion?: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={cn(
        'flex min-h-12 w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all duration-150 active:scale-[0.99] motion-reduce:active:scale-100',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
        activo
          ? 'border-ink-950 bg-ink-950 text-on-ink shadow-[0_10px_24px_rgba(10,10,11,0.18)]'
          : 'border-line-strong bg-surface text-ink-800 hover:border-ink-300 hover:bg-ink-50',
        className,
      )}
    >
      {Icono && <Icono className="h-5 w-5 shrink-0" strokeWidth={1.85} aria-hidden />}
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{titulo}</span>
        {descripcion && (
          <span className={cn('mt-0.5 block text-xs leading-relaxed', activo ? 'text-on-ink/70' : 'text-ink-500')}>
            {descripcion}
          </span>
        )}
      </span>
    </button>
  )
}

/** Una tarea que se tilda tocándola entera (no solo el cuadradito). */
export function Tildable({
  hecho,
  onToggle,
  titulo,
  detalle,
  indice = 0,
}: {
  hecho: boolean
  onToggle: () => void
  titulo: string
  detalle?: string
  indice?: number
}) {
  const idDetalle = useId()
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={hecho}
      aria-describedby={detalle ? idDetalle : undefined}
      onClick={onToggle}
      style={ctStagger(indice)}
      className={cn(
        'ct-stagger-item flex w-full items-start gap-3.5 rounded-2xl border bg-surface px-4 py-4 text-left transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
        hecho
          ? 'border-ink-950 shadow-[0_8px_22px_rgba(10,10,11,0.08)]'
          : 'border-line hover:border-line-strong hover:shadow-[0_6px_16px_rgba(10,10,11,0.05)]',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full transition-all duration-200',
          hecho
            ? 'bg-ink-950 text-on-ink'
            : 'border-2 border-dashed border-line-strong text-transparent',
        )}
      >
        <Check className="h-4 w-4" strokeWidth={2.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block text-[0.95rem] font-semibold leading-snug transition-colors',
            hecho ? 'text-ink-950' : 'text-ink-900',
          )}
        >
          {titulo}
        </span>
        {detalle && (
          <span id={idDetalle} className="mt-1 block text-sm leading-relaxed text-ink-500">
            {detalle}
          </span>
        )}
      </span>
      <Estado hecho={hecho} />
    </button>
  )
}

/** «Hecho» / «Falta», dicho con palabras además del color. */
export function Estado({ hecho, si = 'Hecho', no = 'Falta' }: { hecho: boolean; si?: string; no?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[0.64rem] font-semibold uppercase tracking-wide transition-colors',
        hecho
          ? 'bg-emerald-600/10 text-emerald-700 ring-1 ring-emerald-600/25 dark:text-emerald-400'
          : 'bg-ink-100 text-ink-400',
      )}
    >
      {hecho && <Check className="h-3 w-3" strokeWidth={3} aria-hidden />}
      {hecho ? si : no}
    </span>
  )
}

/** Ícono en un recuadro redondeado (encabezados de tarjetas). */
export function IconoCaja({
  icono: Icono,
  oscuro,
  className,
}: {
  icono: LucideIcon
  oscuro?: boolean
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid h-10 w-10 shrink-0 place-items-center rounded-xl',
        oscuro ? 'bg-ink-950 text-on-ink' : 'bg-ink-50 text-ink-500 ring-1 ring-line',
        className,
      )}
    >
      <Icono className="h-5 w-5" strokeWidth={1.75} />
    </span>
  )
}

/** Un renglón «etiqueta ........ valor» de los resúmenes. */
export function Renglon({
  l,
  r,
  fuerte,
  suave,
}: {
  l: ReactNode
  r: ReactNode
  fuerte?: boolean
  suave?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className={cn('min-w-0 text-sm', suave ? 'text-ink-400' : 'text-ink-600')}>{l}</span>
      <span
        className={cn(
          'tnum shrink-0 text-right text-sm',
          fuerte ? 'text-base font-bold text-ink-950' : 'font-semibold text-ink-900',
        )}
      >
        {r}
      </span>
    </div>
  )
}
