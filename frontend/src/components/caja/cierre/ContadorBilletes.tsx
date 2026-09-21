import { Coins, Minus, Plus, RotateCcw } from 'lucide-react'
import type { ConteoBilletes } from '@/types'
import { money0 } from '@/lib/format'
import { cn, ctStagger } from '@/lib/utils'
import { CampoPlata } from '@/components/caja/cierre/piezas'

/**
 * Contador de billetes del cierre, hecho para contar sin pensar: cada billete
 * es un botón que se toca una vez por cada billete que hay en la mano (el −
 * corrige), el número también se puede escribir, y el billete se pinta oscuro
 * apenas tiene algo contado: de un vistazo se ve qué falta contar. Monedas y
 * billetes fuera de la lista van juntos en «Monedas y sueltos».
 */

export function ContadorBilletes({
  denominaciones,
  conteo,
  onConteo,
  sueltos,
  onSueltos,
  onReiniciar,
}: {
  denominaciones: number[]
  conteo: ConteoBilletes
  onConteo: (conteo: ConteoBilletes) => void
  /** Monedas y billetes sueltos, como texto (se escribe la plata). */
  sueltos: string
  onSueltos: (texto: string) => void
  /** Borra todo lo contado (pide confirmación afuera). */
  onReiniciar: () => void
}) {
  const orden = [...denominaciones].sort((a, b) => b - a)
  const hayAlgo = Object.values(conteo).some((c) => c > 0) || sueltos.trim() !== ''

  function setCantidad(den: number, cantidad: number) {
    onConteo({ ...conteo, [den]: Math.max(0, Math.min(9999, Math.floor(cantidad) || 0)) })
  }

  return (
    <div className="space-y-2.5">
      <div className="grid gap-2.5 md:grid-cols-2">
        {orden.map((den, i) => {
          const cantidad = conteo[den] || 0
          const subtotal = cantidad * den
          const activo = cantidad > 0
          return (
            <div
              key={den}
              style={ctStagger(i)}
              className={cn(
                'ct-stagger-item flex items-center gap-2 rounded-2xl border bg-surface p-2 pr-3 transition-colors duration-200 min-[400px]:gap-3',
                activo ? 'border-ink-300' : 'border-line',
              )}
            >
              {/* El billete: tocarlo suma uno. */}
              <button
                type="button"
                onClick={() => setCantidad(den, cantidad + 1)}
                aria-label={`Sumar un billete de ${money0(den)}`}
                className={cn(
                  'relative h-14 w-[5.6rem] shrink-0 overflow-hidden rounded-xl border text-left transition-all duration-150 min-[400px]:w-[6.4rem]',
                  'active:scale-[0.96] motion-reduce:active:scale-100',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                  activo
                    ? 'border-ink-950 bg-ink-950 text-on-ink shadow-[0_8px_18px_rgba(10,10,11,0.22)]'
                    : 'border-line-strong bg-ink-50 text-ink-800 hover:border-ink-400',
                )}
              >
                {/* La guarda y el sello de un billete, apenas insinuados. */}
                <span aria-hidden className="absolute inset-[3px] rounded-[0.6rem] border border-current opacity-[0.14]" />
                <span
                  aria-hidden
                  className="absolute -right-3 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full border-[1.5px] border-current opacity-[0.13]"
                />
                <span className="absolute left-2.5 top-1.5 text-[0.5rem] font-semibold uppercase tracking-[0.16em] opacity-55">
                  Billete
                </span>
                <span className="tnum absolute bottom-1.5 left-2.5 text-[0.95rem] font-bold tracking-tight">
                  {money0(den)}
                </span>
              </button>

              {/* Cuántos hay: − número + */}
              <div className="flex items-center rounded-xl border border-line-strong bg-surface">
                <button
                  type="button"
                  onClick={() => setCantidad(den, cantidad - 1)}
                  disabled={cantidad <= 0}
                  aria-label={`Sacar un billete de ${money0(den)}`}
                  className="grid h-11 w-9 place-items-center rounded-l-xl text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 min-[400px]:w-10"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <input
                  value={String(cantidad)}
                  onChange={(e) => setCantidad(den, parseInt(e.target.value.replace(/\D/g, ''), 10) || 0)}
                  onFocus={(e) => e.target.select()}
                  inputMode="numeric"
                  aria-label={`Cantidad de billetes de ${money0(den)}`}
                  className={cn(
                    'tnum h-11 w-11 border-x border-line bg-transparent text-center text-base font-bold focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ink-900/15',
                    activo ? 'text-ink-950' : 'text-ink-400',
                  )}
                />
                <button
                  type="button"
                  onClick={() => setCantidad(den, cantidad + 1)}
                  aria-label={`Sumar un billete de ${money0(den)}`}
                  className="grid h-11 w-9 place-items-center rounded-r-xl text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 min-[400px]:w-10"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {/* Cuánto suman */}
              <div className="ml-auto hidden min-w-0 text-right min-[360px]:block">
                <p className="text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-ink-400">Suman</p>
                <p
                  key={subtotal}
                  className={cn(
                    'ct-count tnum truncate text-sm font-bold',
                    activo ? 'text-ink-950' : 'text-ink-300',
                  )}
                >
                  {money0(subtotal)}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Monedas y lo que no está en la lista */}
      <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-line-strong bg-surface p-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span
            aria-hidden
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-ink-50 text-ink-500 ring-1 ring-line"
          >
            <Coins className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink-900">Monedas y sueltos</p>
            <p className="text-xs leading-relaxed text-ink-500">
              Sumá las monedas y los billetes que no están en la lista, y escribí cuánto dan.
            </p>
          </div>
        </div>
        <CampoPlata
          valor={sueltos}
          onValor={onSueltos}
          aria-label="Monedas y sueltos, en pesos"
          className="sm:w-44"
        />
      </div>

      {hayAlgo && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onReiniciar}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Empezar de nuevo
          </button>
        </div>
      )}
    </div>
  )
}
