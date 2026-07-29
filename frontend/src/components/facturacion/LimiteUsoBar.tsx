import { AlertTriangle, Gauge } from 'lucide-react'
import { money } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Uso del límite mensual de una cuenta (control INTERNO, no fiscal).
 *
 * Con `adicional` (un importe que todavía no se facturó, típicamente la venta
 * que se está cargando) la barra muestra DOS tramos: lo ya facturado y lo que
 * sumaría esa operación, para que se vea de un vistazo cómo queda la cuenta.
 * Sin `adicional` se comporta exactamente igual que siempre.
 */
export function LimiteUsoBar({
  mesNombre,
  limite,
  facturado,
  adicional = 0,
  etiquetaAdicional = 'Esta venta',
}: {
  mesNombre: string
  limite: number
  facturado: number
  /** Importe a proyectar sobre lo ya facturado (0 = sin proyección). */
  adicional?: number
  etiquetaAdicional?: string
}) {
  const proyecta = adicional > 0
  const usado = facturado + adicional
  const pct = limite > 0 ? (usado / limite) * 100 : 100
  const pctFacturado = limite > 0 ? Math.min(100, (facturado / limite) * 100) : 100
  const excedido = usado > limite
  const cerca = !excedido && pct >= 80
  return (
    <div className="space-y-1.5 border-t border-line pt-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
        <span className="flex items-center gap-1.5 font-medium text-ink-600">
          <Gauge className="h-3.5 w-3.5" />
          Límite de <span className="capitalize">{mesNombre}</span>
          {excedido && (
            <span className="inline-flex items-center gap-1 rounded-md bg-ink-950 px-1.5 py-0.5 text-[10px] font-semibold text-on-ink">
              <AlertTriangle className="h-3 w-3" /> Superado
            </span>
          )}
          {cerca && (
            <span className="rounded-md border border-ink-950 px-1.5 py-0.5 text-[10px] font-semibold text-ink-900">
              Cerca del tope
            </span>
          )}
        </span>
        <span className="tnum text-ink-500">
          {money(usado)} de {money(limite)} · {Math.round(pct)}%
        </span>
      </div>

      <div className="flex h-2 overflow-hidden rounded-full bg-ink-100">
        {proyecta ? (
          <>
            {/* Lo ya facturado del mes */}
            <div
              className="h-full bg-ink-400 transition-all duration-300"
              style={{ width: `${pctFacturado}%` }}
            />
            {/* Lo que suma esta operación (el tramo que importa mirar) */}
            <div
              className={cn(
                'h-full transition-all duration-300',
                excedido ? 'bg-ink-950' : 'bg-ink-700',
              )}
              style={{ width: `${Math.max(0, Math.min(100, pct) - pctFacturado)}%` }}
            />
          </>
        ) : (
          <div
            className={cn('h-full rounded-full transition-all duration-300', excedido ? 'bg-ink-950' : 'bg-ink-600')}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        )}
      </div>

      {proyecta && (
        <div className="space-y-0.5 pt-0.5 text-xs">
          <p className="flex items-center justify-between gap-3 text-ink-500">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="h-2 w-2 rounded-full bg-ink-400" />
              Ya facturado en <span className="capitalize">{mesNombre}</span>
            </span>
            <span className="tnum">{money(facturado)}</span>
          </p>
          <p className="flex items-center justify-between gap-3 font-medium text-ink-900">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className={cn('h-2 w-2 rounded-full', excedido ? 'bg-ink-950' : 'bg-ink-700')} />
              {etiquetaAdicional}
            </span>
            <span className="tnum">+ {money(adicional)}</span>
          </p>
          <p className="flex items-center justify-between gap-3 border-t border-line pt-1 font-semibold text-ink-950">
            <span>{excedido ? 'Se pasa por' : 'Queda disponible'}</span>
            <span className="tnum">{money(Math.abs(limite - usado))}</span>
          </p>
        </div>
      )}

      {excedido && !proyecta && (
        <p className="text-xs text-ink-500">
          Superado por {money(usado - limite)}. Al emitir otra factura este mes se va a pedir confirmación.
        </p>
      )}
    </div>
  )
}
