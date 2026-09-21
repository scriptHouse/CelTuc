import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn, ctStagger } from '@/lib/utils'
import { Switch } from '@/components/ui/Switch'

/**
 * Piezas de la configuración de Caja. La regla: NINGUNA opción va sola. Cada
 * una dice qué es con palabras simples y qué cambia al tocarla, así el que
 * configura entiende lo que está haciendo sin preguntarle a nadie.
 */

/** Un bloque de la configuración (un paso del cierre, o un tema). */
export function Bloque({
  id,
  numero,
  icono: Icono,
  titulo,
  descripcion,
  estado,
  children,
  indice = 0,
}: {
  id?: string
  /** «Paso 2» (los pasos del cierre llevan número). */
  numero?: number
  icono: LucideIcon
  titulo: string
  descripcion: ReactNode
  /** Qué pasa hoy con este bloque, en una píldora («Siempre», «No aparece»…). */
  estado?: ReactNode
  children?: ReactNode
  indice?: number
}) {
  return (
    <section
      id={id}
      style={ctStagger(indice)}
      className="ct-stagger-item scroll-mt-4 overflow-hidden rounded-2xl border border-line bg-surface"
    >
      <div className="flex items-start gap-3 border-b border-line bg-canvas/50 px-4 py-3.5">
        <span
          aria-hidden
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink-950 text-on-ink"
        >
          <Icono className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {numero !== undefined && (
              <span className="text-[0.64rem] font-semibold uppercase tracking-[0.14em] text-ink-400">
                Paso {numero}
              </span>
            )}
            <h3 className="text-[0.95rem] font-semibold text-ink-950">{titulo}</h3>
            {estado}
          </div>
          <p className="mt-0.5 text-pretty text-xs leading-relaxed text-ink-500">{descripcion}</p>
        </div>
      </div>
      {children && <div className="divide-y divide-line">{children}</div>}
    </section>
  )
}

/** Una píldora de estado para el encabezado de un bloque. */
export function Pildora({ children, apagada }: { children: ReactNode; apagada?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide',
        apagada ? 'bg-ink-100 text-ink-400' : 'bg-emerald-600/10 text-emerald-700 ring-1 ring-emerald-600/25 dark:text-emerald-400',
      )}
    >
      {children}
    </span>
  )
}

/**
 * Una opción con su explicación. El control (un interruptor, un monto) va a
 * la derecha; lo que se despliega al elegir va abajo.
 */
export function Opcion({
  titulo,
  descripcion,
  control,
  children,
}: {
  titulo: string
  descripcion: ReactNode
  control?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="px-4 py-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-900">{titulo}</p>
          <div className="mt-1 text-pretty text-[0.8rem] leading-relaxed text-ink-500">{descripcion}</div>
        </div>
        {control && <div className="shrink-0 pt-0.5">{control}</div>}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  )
}

/** Un interruptor de la configuración (con el nombre de la opción para lectores de pantalla). */
export function Interruptor({
  activo,
  onChange,
  etiqueta,
  disabled,
}: {
  activo: boolean
  onChange: (v: boolean) => void
  etiqueta: string
  disabled?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn('hidden text-xs font-semibold sm:inline', activo ? 'text-ink-900' : 'text-ink-400')}>
        {activo ? 'Prendido' : 'Apagado'}
      </span>
      <Switch checked={activo} onChange={onChange} aria-label={etiqueta} disabled={disabled} />
    </div>
  )
}

export interface OpcionElegible<T extends string> {
  valor: T
  titulo: string
  descripcion: string
  recomendada?: boolean
}

/**
 * Elegir una entre varias, como tarjetas grandes: cada una explica qué pasa
 * si se la elige. La elegida se marca con el punto y el borde oscuro.
 */
export function Elegir<T extends string>({
  valor,
  onChange,
  opciones,
  etiqueta,
}: {
  valor: T
  onChange: (v: T) => void
  opciones: OpcionElegible<T>[]
  etiqueta: string
}) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className="grid gap-2">
      {opciones.map((o) => {
        const activa = o.valor === valor
        return (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={activa}
            onClick={() => onChange(o.valor)}
            className={cn(
              'flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition-all duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
              activa
                ? 'border-ink-950 bg-ink-50 shadow-[inset_0_0_0_1px_var(--color-ink-950)]'
                : 'border-line bg-surface hover:border-line-strong hover:bg-ink-50/60',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition-colors',
                activa ? 'border-ink-950' : 'border-line-strong',
              )}
            >
              <span
                className={cn(
                  'h-2.5 w-2.5 rounded-full bg-ink-950 transition-transform duration-200',
                  activa ? 'scale-100' : 'scale-0',
                )}
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-ink-950">
                {o.titulo}
                {o.recomendada && (
                  <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-ink-500">
                    Recomendado
                  </span>
                )}
              </span>
              <span className="mt-0.5 block text-pretty text-xs leading-relaxed text-ink-500">{o.descripcion}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** Un «Ejemplo:» chiquito debajo de una explicación. */
export function Ejemplo({ children }: { children: ReactNode }) {
  return (
    <span className="mt-1.5 block rounded-lg bg-canvas px-2.5 py-1.5 text-[0.75rem] leading-relaxed text-ink-500 ring-1 ring-line">
      <b className="font-semibold text-ink-700">Ejemplo:</b> {children}
    </span>
  )
}
