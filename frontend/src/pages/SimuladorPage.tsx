import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CreditCard, Eraser, Layers, SlidersHorizontal } from 'lucide-react'
import type { CategoriaTarjeta, PlanCuota, Tarjeta } from '@/types'
import { CATEGORIAS_TARJETA } from '@/types'
import { listarTarjetas } from '@/services/simulador'
import { useAuth } from '@/store/auth'
import { esAdmin } from '@/lib/permisos'
import { money0, num } from '@/lib/format'
import { cn, ctStagger } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { SimuladorManager } from '@/components/SimuladorManager'

/**
 * Simulador de cuotas con tarjeta. Replica la lógica de la hoja de Excel:
 *   total       = monto * (1 + recargo% / 100)
 *   valor cuota = total / cantidad de cuotas
 * El monto se ingresa arriba y los resultados de cada tarjeta se actualizan en
 * vivo. Los porcentajes son 100 % configurables (botón "Configurar", solo admin).
 */
function calcular(monto: number, plan: PlanCuota) {
  const total = monto * (1 + Number(plan.interes) / 100)
  const cuotas = Math.max(plan.cuotas, 1)
  return { total, valorCuota: total / cuotas }
}

/** Deja solo los dígitos del texto y lo pasa a número (monto en pesos enteros). */
function parseMonto(texto: string): number {
  const soloDigitos = texto.replace(/\D/g, '')
  return soloDigitos ? Number(soloDigitos) : 0
}

const PRESETS = [50000, 100000, 250000, 500000]

export function SimuladorPage() {
  const usuario = useAuth((s) => s.usuario)
  const admin = esAdmin(usuario)

  const [monto, setMonto] = useState(0)
  const [categoria, setCategoria] = useState<CategoriaTarjeta>('accesorios')
  const [configOpen, setConfigOpen] = useState(false)

  const { data: tarjetas = [], isLoading } = useQuery({
    queryKey: ['tarjetas'],
    queryFn: listarTarjetas,
  })

  const visibles = useMemo(
    () =>
      tarjetas
        .filter((t) => t.activa && t.categoria === categoria)
        .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre)),
    [tarjetas, categoria],
  )

  const hintCategoria = CATEGORIAS_TARJETA.find((c) => c.value === categoria)?.hint

  return (
    <div className="animate-fade-in">
      <PageHeader
        icon={CreditCard}
        eyebrow="Ventas"
        title="Simulador de tarjetas"
        subtitle="Ingresá un monto y mirá las cuotas y recargos al instante."
        className="ct-rise"
        actions={
          admin ? (
            <Button variant="outline" onClick={() => setConfigOpen(true)}>
              <SlidersHorizontal className="h-4 w-4" />
              Configurar
            </Button>
          ) : undefined
        }
      />

      {/* Hero: monto + categoría */}
      <Card className="ct-rise mb-5 overflow-hidden">
        <div className="grid sm:grid-cols-[1.5fr_1fr]">
          <div className="p-5 sm:p-6">
            <label
              htmlFor="monto"
              className="mb-2 block text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-400"
            >
              Monto a financiar
            </label>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-semibold text-ink-300 sm:text-3xl">$</span>
              <input
                id="monto"
                value={monto ? num(monto) : ''}
                onChange={(e) => setMonto(parseMonto(e.target.value))}
                inputMode="numeric"
                autoComplete="off"
                placeholder="0"
                className="tnum w-full min-w-0 bg-transparent text-4xl font-bold tracking-tight text-ink-950 placeholder:text-ink-300 focus:outline-none sm:text-5xl"
              />
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {PRESETS.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setMonto(v)}
                  className="tnum rounded-lg border border-line-strong bg-surface px-2.5 py-1 text-xs font-medium text-ink-600 transition-colors hover:border-ink-300 hover:bg-ink-50 hover:text-ink-900"
                >
                  {num(v)}
                </button>
              ))}
              {monto > 0 && (
                <button
                  type="button"
                  onClick={() => setMonto(0)}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-ink-400 transition-colors hover:text-ink-900"
                >
                  <Eraser className="h-3.5 w-3.5" /> Limpiar
                </button>
              )}
            </div>
          </div>

          <div className="border-t border-line bg-canvas/40 p-5 sm:border-l sm:border-t-0 sm:p-6">
            <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-400">Categoría</p>
            <div className="inline-flex w-full rounded-xl border border-line-strong bg-surface p-1">
              {CATEGORIAS_TARJETA.map((c) => {
                const activo = categoria === c.value
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setCategoria(c.value)}
                    aria-pressed={activo}
                    className={cn(
                      'flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      activo ? 'bg-ink-950 text-on-ink' : 'text-ink-500 hover:text-ink-900',
                    )}
                  >
                    {c.label}
                  </button>
                )
              })}
            </div>
            {hintCategoria && <p className="mt-2 text-xs text-ink-400">{hintCategoria}</p>}
          </div>
        </div>
      </Card>

      {/* Resultados */}
      {isLoading ? (
        <ResultadosSkeleton />
      ) : visibles.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="Sin tarjetas en esta categoría"
          description={
            admin
              ? 'Cargá las tarjetas y sus planes de cuotas para empezar a simular.'
              : 'Todavía no hay tarjetas configuradas acá. Pedile a un administrador que las cargue.'
          }
          action={
            admin ? (
              <Button onClick={() => setConfigOpen(true)}>
                <SlidersHorizontal className="h-4 w-4" /> Configurar tarjetas
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {visibles.map((t, i) => (
            <TarjetaResultado key={t.id} tarjeta={t} monto={monto} index={i} />
          ))}
        </div>
      )}

      <SimuladorManager open={configOpen} onClose={() => setConfigOpen(false)} />
    </div>
  )
}

// ===== Tarjeta con sus planes calculados =====

function TarjetaResultado({ tarjeta, monto, index }: { tarjeta: Tarjeta; monto: number; index: number }) {
  const planes = useMemo(
    () => tarjeta.planes.filter((p) => p.activo).sort((a, b) => a.orden - b.orden),
    [tarjeta.planes],
  )

  return (
    <Card className="ct-stagger-item flex flex-col overflow-hidden p-0" style={ctStagger(index)}>
      <div className="flex items-start gap-2.5 border-b border-line px-4 py-3.5 sm:px-5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink-100 text-ink-900">
          <CreditCard className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink-900">{tarjeta.nombre}</p>
          {tarjeta.descripcion && <p className="truncate text-xs text-ink-400">{tarjeta.descripcion}</p>}
        </div>
      </div>

      {planes.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-ink-400">Sin planes de cuotas cargados.</p>
      ) : (
        <ul className="divide-y divide-line">
          {planes.map((plan) => {
            const { total, valorCuota } = calcular(monto, plan)
            const sinInteres = Number(plan.interes) === 0
            return (
              <li key={plan.id} className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-900">{plan.etiqueta}</p>
                  <div className="mt-1">
                    {sinInteres ? (
                      <Badge tone="solid">Sin interés</Badge>
                    ) : (
                      <span className="tnum text-xs text-ink-400">+{num(Number(plan.interes))}% de recargo</span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="tnum text-lg font-bold leading-tight text-ink-950">
                    {monto > 0 ? money0(valorCuota) : '—'}
                  </p>
                  <p className="tnum text-xs text-ink-400">
                    {plan.cuotas} {plan.cuotas === 1 ? 'pago' : 'cuotas'}
                    {monto > 0 ? ` · ${money0(total)}` : ''}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

function ResultadosSkeleton() {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-xl" />
            <Skeleton className="h-4 w-1/3" />
          </div>
          <div className="mt-4 space-y-2.5">
            {Array.from({ length: 3 }).map((__, j) => (
              <Skeleton key={j} className="h-10 w-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
