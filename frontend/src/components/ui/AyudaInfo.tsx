import { useState } from 'react'
import type { ReactNode } from 'react'
import { CircleHelp, Info, Lightbulb, X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/utils'

/**
 * Ayuda contextual estilo manual de usuario.
 *
 * `AyudaInfo` es el botón (i) que se pone al lado del título o de las acciones
 * de una pantalla: abre una guía en un modal (bottom-sheet en móvil) con el
 * contenido armado con las primitivas de abajo:
 *
 *   <AyudaInfo titulo="Cómo usar Productos">
 *     <AyudaSeccion titulo="Buscar">...</AyudaSeccion>
 *     <AyudaPasos pasos={[<>Tocá <b>Configurar</b>…</>, ...]} />
 *     <AyudaEjemplo titulo="Cargar una funda">...</AyudaEjemplo>
 *     <AyudaCampos campos={[['Nombre', 'Qué es…'], ...]} />
 *     <AyudaTip>…</AyudaTip>
 *   </AyudaInfo>
 */

export function AyudaInfo({
  titulo,
  children,
  className,
}: {
  titulo: string
  children: ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Ayuda: ${titulo}`}
        title="¿Cómo se usa esta pantalla?"
        className={cn(
          'grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line-strong bg-surface text-ink-500',
          'transition-colors hover:border-ink-300 hover:bg-ink-50 hover:text-ink-900',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
          className,
        )}
      >
        <Info className="h-4 w-4" aria-hidden />
      </button>

      <Modal open={open} onClose={() => setOpen(false)} size="lg">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink-950 text-on-ink">
              <CircleHelp className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold leading-tight text-ink-950">{titulo}</h2>
              <p className="text-xs text-ink-400">Guía de uso, paso a paso y con ejemplos.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Cerrar ayuda"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-6 overflow-y-auto px-5 py-5 text-sm leading-relaxed text-ink-700">
          {children}
        </div>
      </Modal>
    </>
  )
}

/** Sección con título — un tema de la guía. */
export function AyudaSeccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-ink-400">
        {titulo}
      </h3>
      <div className="space-y-2.5">{children}</div>
    </section>
  )
}

/** Lista de pasos numerados (los círculos guían el ojo). */
export function AyudaPasos({ pasos }: { pasos: ReactNode[] }) {
  return (
    <ol className="space-y-2.5">
      {pasos.map((paso, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink-950 text-[0.7rem] font-bold text-on-ink">
            {i + 1}
          </span>
          <div className="min-w-0 pt-0.5">{paso}</div>
        </li>
      ))}
    </ol>
  )
}

/** Caja de ejemplo concreto, con valores reales. */
export function AyudaEjemplo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-line">
      <p className="border-b border-line bg-ink-50 px-3.5 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-ink-500">
        Ejemplo · {titulo}
      </p>
      <div className="space-y-2 bg-canvas/40 px-3.5 py-3">{children}</div>
    </div>
  )
}

/** Tabla campo → para qué sirve. */
export function AyudaCampos({ campos }: { campos: [ReactNode, ReactNode][] }) {
  return (
    <dl className="overflow-hidden rounded-xl ring-1 ring-line">
      {campos.map(([nombre, descripcion], i) => (
        <div
          key={i}
          className={cn(
            'grid gap-x-3 gap-y-0.5 px-3.5 py-2.5 sm:grid-cols-[9.5rem_minmax(0,1fr)]',
            i % 2 === 1 && 'bg-canvas/50',
          )}
        >
          <dt className="text-xs font-semibold text-ink-900 sm:pt-0.5">{nombre}</dt>
          <dd className="text-xs leading-relaxed text-ink-600">{descripcion}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Tip destacado (una recomendación puntual). */
export function AyudaTip({ children }: { children: ReactNode }) {
  return (
    <p className="flex gap-2 rounded-xl bg-ink-50 px-3.5 py-2.5 text-xs leading-relaxed text-ink-600 ring-1 ring-line">
      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" aria-hidden />
      <span>{children}</span>
    </p>
  )
}
