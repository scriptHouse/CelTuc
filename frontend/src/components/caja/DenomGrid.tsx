import { Minus, Plus } from 'lucide-react'
import type { ConteoBilletes } from '@/types'
import { money, money0 } from '@/lib/format'
import { cn } from '@/lib/utils'
import { totalConteo } from '@/components/caja/medios'

/**
 * Grilla de arqueo por denominación (patrón Odoo / Aloha / Shopify):
 * una fila por billete, cantidad editable con stepper, subtotal en vivo y
 * total corriente al pie. "Sueltos" es la vía de escape para monedas o
 * billetes fuera de la grilla (patrón "Extra" de Lightspeed).
 */

interface DenomGridProps {
  denominaciones: number[]
  conteo: ConteoBilletes
  sueltos: number
  onConteo: (conteo: ConteoBilletes) => void
  onSueltos: (sueltos: number) => void
  disabled?: boolean
  className?: string
}

export function DenomGrid({
  denominaciones,
  conteo,
  sueltos,
  onConteo,
  onSueltos,
  disabled,
  className,
}: DenomGridProps) {
  const total = totalConteo(conteo, sueltos)

  function setCantidad(den: number, cantidad: number) {
    onConteo({ ...conteo, [den]: Math.max(0, Math.min(9999, cantidad || 0)) })
  }

  return (
    <div className={cn('select-none', className)}>
      <div className="divide-y divide-dashed divide-line">
        {denominaciones.map((den) => {
          const cantidad = conteo[den] || 0
          const subtotal = cantidad * den
          return (
            <div key={den} className="flex items-center gap-2.5 py-2">
              <span className="tnum w-[4.9rem] shrink-0 text-sm font-semibold text-ink-800">
                {money0(den)}
              </span>

              <div className="flex items-center rounded-xl border border-line-strong bg-surface">
                <button
                  type="button"
                  onClick={() => setCantidad(den, cantidad - 1)}
                  disabled={disabled || cantidad <= 0}
                  aria-label={`Quitar un billete de ${money0(den)}`}
                  className="grid h-10 w-10 place-items-center rounded-l-xl text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <input
                  value={String(cantidad)}
                  onChange={(e) => setCantidad(den, parseInt(e.target.value.replace(/\D/g, ''), 10) || 0)}
                  onFocus={(e) => e.target.select()}
                  disabled={disabled}
                  inputMode="numeric"
                  aria-label={`Cantidad de billetes de ${money0(den)}`}
                  className="tnum h-10 w-11 border-x border-line bg-transparent text-center text-sm font-semibold text-ink-950 focus:outline-none disabled:opacity-40"
                />
                <button
                  type="button"
                  onClick={() => setCantidad(den, cantidad + 1)}
                  disabled={disabled}
                  aria-label={`Sumar un billete de ${money0(den)}`}
                  className="grid h-10 w-10 place-items-center rounded-r-xl text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>

              <span
                className={cn(
                  'tnum ml-auto text-sm transition-colors',
                  subtotal > 0 ? 'font-semibold text-ink-950' : 'text-ink-400',
                )}
              >
                {money0(subtotal)}
              </span>
            </div>
          )
        })}

        {/* Monedas / billetes fuera de la grilla */}
        <div className="flex items-center gap-2.5 py-2">
          <span className="w-[4.9rem] shrink-0 text-xs font-medium text-ink-500">Sueltos</span>
          <input
            type="number"
            min={0}
            value={sueltos || ''}
            onChange={(e) => onSueltos(Math.max(0, Number(e.target.value) || 0))}
            onFocus={(e) => e.target.select()}
            disabled={disabled}
            inputMode="numeric"
            placeholder="0"
            aria-label="Monto suelto sin desglosar (monedas, billetes chicos)"
            className="tnum h-10 w-32 rounded-xl border border-line-strong bg-surface px-3 text-right text-sm text-ink-950 transition-colors placeholder:text-ink-300 focus:border-ink-900 focus:outline-none focus:ring-2 focus:ring-ink-900/10 disabled:opacity-40"
          />
          <span className="ml-auto text-xs text-ink-400">monedas y resto</span>
        </div>
      </div>

      <div className="mt-1 flex items-baseline justify-between border-t border-line-strong pt-3">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-400">
          Total contado
        </span>
        <span key={total} className="tnum ct-count text-lg font-bold text-ink-950">
          {money(total)}
        </span>
      </div>
    </div>
  )
}
