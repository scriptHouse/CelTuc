import { Landmark, Wallet } from 'lucide-react'
import { plata } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/Card'
import { hayMonto, leerMonto, montoATexto, saltoDeFondo } from '@/components/caja/cierre/pasos'
import { CampoPlata } from '@/components/caja/cierre/piezas'

/**
 * Paso «Para mañana»: cuánta plata queda en el cajón para dar vuelto en la
 * próxima apertura (el «fondo»). La barra muestra el reparto a simple vista
 * —lo que queda y lo que se guarda aparte— y se cambia con atajos, con la
 * barra deslizante o escribiendo el monto.
 */
export function PasoFondo({
  contado,
  fondo,
  texto,
  onTexto,
  sugerido,
  fondoDeHoy,
}: {
  /** Efectivo contado (el máximo que puede quedar). */
  contado: number
  /** Lo que queda, ya acotado a lo contado. */
  fondo: number
  /** Lo escrito en el campo. */
  texto: string
  onTexto: (texto: string) => void
  /** El fondo de la configuración («lo de siempre»). */
  sugerido: number
  /** Con cuánto se abrió este turno. */
  fondoDeHoy: number
}) {
  const retiro = Math.max(0, contado - fondo)
  const porcentaje = contado > 0 ? (fondo / contado) * 100 : 0

  if (contado <= 0) {
    return (
      <Card className="flex flex-col items-center px-5 py-8 text-center">
        <span aria-hidden className="grid h-12 w-12 place-items-center rounded-2xl bg-ink-100 text-ink-500">
          <Wallet className="h-6 w-6" strokeWidth={1.75} />
        </span>
        <p className="mt-3 text-base font-semibold text-ink-950">No hay efectivo para dejar</p>
        <p className="mt-1 max-w-sm text-pretty text-sm leading-relaxed text-ink-500">
          Contaste $ 0, así que el cajón queda vacío. Mañana se abre la caja con el cambio que se ponga.
        </p>
      </Card>
    )
  }

  // Atajos sin repetir montos (si «lo de siempre» ya es todo, queda uno solo).
  const atajos: Array<{ etiqueta: string; valor: number }> = []
  const sumar = (etiqueta: string, valor: number) => {
    const v = Math.max(0, Math.min(valor, contado))
    if (!atajos.some((a) => a.valor === v)) atajos.push({ etiqueta, valor: v })
  }
  if (sugerido > 0) sumar('Lo de siempre', sugerido)
  if (fondoDeHoy > 0) sumar('Igual que hoy', fondoDeHoy)
  sumar('Todo', contado)
  sumar('Nada', 0)

  return (
    <div className="space-y-4">
      {/* El reparto */}
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-sm text-ink-500">Contaste en efectivo</p>
          <p className="tnum text-xl font-bold tracking-tight text-ink-950">{plata(contado)}</p>
        </div>
        <div
          className="mt-3.5 h-4 overflow-hidden rounded-full bg-ink-100 ring-1 ring-line"
          role="img"
          aria-label={`Quedan ${plata(fondo)} en el cajón y se guardan ${plata(retiro)} aparte`}
        >
          <div
            className="h-full rounded-full bg-ink-950 transition-[width] duration-300 ease-out motion-reduce:transition-none"
            style={{ width: `${porcentaje}%` }}
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <div className="rounded-xl bg-ink-950 p-3 text-on-ink">
            <p className="flex items-center gap-1.5 text-xs text-on-ink/70">
              <Wallet className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Queda en el cajón
            </p>
            <p key={fondo} className="ct-count tnum mt-1 text-base font-bold sm:text-lg">{plata(fondo)}</p>
          </div>
          <div className="rounded-xl bg-canvas p-3 ring-1 ring-line">
            <p className="flex items-center gap-1.5 text-xs text-ink-500">
              <Landmark className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Se guarda aparte
            </p>
            <p key={retiro} className="ct-count tnum mt-1 text-base font-bold text-ink-950 sm:text-lg">{plata(retiro)}</p>
          </div>
        </div>
      </Card>

      {/* Cómo se elige */}
      <Card className="space-y-4 p-4 sm:p-5">
        <div>
          <p className="mb-2 text-sm font-medium text-ink-700">Elegí rápido</p>
          <div className="flex flex-wrap gap-2">
            {atajos.map((a) => {
              const activo = a.valor === fondo
              return (
                <button
                  key={a.etiqueta}
                  type="button"
                  aria-pressed={activo}
                  onClick={() => onTexto(montoATexto(a.valor))}
                  className={cn(
                    'inline-flex h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-all duration-150',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                    activo
                      ? 'border-ink-950 bg-ink-950 text-on-ink'
                      : 'border-line-strong bg-surface text-ink-700 hover:border-ink-300 hover:bg-ink-50',
                  )}
                >
                  {a.etiqueta}
                  <span className={cn('tnum font-normal', activo ? 'text-on-ink/70' : 'text-ink-400')}>
                    {plata(a.valor)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {contado > 0 && (
          <div>
            <label htmlFor="cierre-fondo-barra" className="mb-1 block text-sm font-medium text-ink-700">
              O mové la barra
            </label>
            <input
              id="cierre-fondo-barra"
              type="range"
              min={0}
              max={contado}
              step={saltoDeFondo(contado)}
              value={fondo}
              onChange={(e) => onTexto(montoATexto(Number(e.target.value)))}
              className="h-8 w-full cursor-pointer accent-ink-950"
            />
            <div className="tnum flex justify-between text-[0.7rem] text-ink-400">
              <span>Nada</span>
              <span>Todo</span>
            </div>
          </div>
        )}

        <div>
          <label htmlFor="cierre-fondo-monto" className="mb-1.5 block text-sm font-medium text-ink-700">
            O escribí el monto exacto
          </label>
          <CampoPlata id="cierre-fondo-monto" valor={texto} onValor={onTexto} className="sm:w-56" />
          {hayMonto(texto) && leerMonto(texto) > contado && (
            <p className="mt-1.5 text-xs text-ink-500">
              No puede quedar más de lo que contaste: queda todo ({plata(contado)}).
            </p>
          )}
        </div>
      </Card>
    </div>
  )
}
