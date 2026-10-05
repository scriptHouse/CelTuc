import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowDownRight, ArrowUpRight, Flag, Hand, History, Loader2, Sparkles, X } from 'lucide-react'
import type { HistorialDolarItem, OrigenDolar } from '@/types'
import { listarHistorialDolar } from '@/services/preciosService'
import { fechaHora, money0, num } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import { duracionLegible } from './reglaDolar'

/**
 * El historial del dólar del negocio: cada valor con «desde → hasta», cuánto
 * duró, de dónde salió (una persona, o la regla automática con el blue que
 * usó) y la nota si la hubo. Se filtra por fechas y se carga de a tandas.
 *
 * En escritorio es una línea de tiempo de tres columnas; en el celular cada
 * valor es una tarjeta apilada.
 */

const TANDA = 50

const ORIGEN: Record<OrigenDolar, { label: string; icono: typeof Hand; clase: string }> = {
  manual: { label: 'Fijado a mano', icono: Hand, clase: 'border-line-strong text-ink-600' },
  automatico: { label: 'Automático', icono: Sparkles, clase: 'border-ink-950 bg-ink-950 text-on-ink' },
  inicial: { label: 'Valor inicial', icono: Flag, clase: 'border-line text-ink-400' },
}

export function HistorialDolar({ className }: { className?: string }) {
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [limite, setLimite] = useState(TANDA)

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ['dolar-historial', desde, hasta, limite],
    queryFn: () => listarHistorialDolar({ desde: desde || undefined, hasta: hasta || undefined, limite }),
    placeholderData: (previa) => previa,
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const filtrando = desde !== '' || hasta !== ''

  return (
    <section className={cn('overflow-hidden rounded-2xl border border-line bg-surface', className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-3">
        <p className="flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-400">
          <History className="h-3.5 w-3.5" aria-hidden />
          Historial del dólar
          {data && (
            <span className="tnum ml-1 rounded-full bg-ink-100 px-2 py-px text-[0.65rem] font-semibold text-ink-700">
              {num(total)}
            </span>
          )}
          {isFetching && !isLoading && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
        </p>

        {/* Filtro por fechas: lo que estuvo vigente en algún momento del rango. */}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-ink-500">
            <span>Desde</span>
            <Input
              type="date"
              value={desde}
              max={hasta || undefined}
              onChange={(e) => {
                setDesde(e.target.value)
                setLimite(TANDA)
              }}
              aria-label="Desde"
              className="tnum h-9 w-[9.5rem] px-2.5 text-xs"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-ink-500">
            <span>Hasta</span>
            <Input
              type="date"
              value={hasta}
              min={desde || undefined}
              onChange={(e) => {
                setHasta(e.target.value)
                setLimite(TANDA)
              }}
              aria-label="Hasta"
              className="tnum h-9 w-[9.5rem] px-2.5 text-xs"
            />
          </label>
          {filtrando && (
            <button
              type="button"
              onClick={() => {
                setDesde('')
                setHasta('')
                setLimite(TANDA)
              }}
              className="inline-flex h-9 items-center gap-1 rounded-xl px-2 text-xs font-medium text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              Limpiar
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <p className="px-4 py-6 text-sm text-ink-400">
          No se pudo cargar el historial. Probá de nuevo en un rato.
        </p>
      ) : items.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-ink-400">
          {filtrando
            ? 'Ningún valor estuvo vigente en esas fechas.'
            : 'Todavía no hay cambios registrados.'}
        </p>
      ) : (
        <>
          <ol className="divide-y divide-line">
            {items.map((item, indice) => (
              <FilaHistorial key={item.id} item={item} primera={indice === 0} />
            ))}
          </ol>
          {items.length < total && (
            <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
              <p className="tnum text-xs text-ink-400">
                Mostrando {num(items.length)} de {num(total)}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLimite((l) => l + TANDA)}
                disabled={isFetching}
              >
                Ver más
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  )
}

function FilaHistorial({ item, primera }: { item: HistorialDolarItem; primera: boolean }) {
  const origen = ORIGEN[item.origen] ?? ORIGEN.manual
  const Icono = origen.icono
  const delta = item.valor_anterior != null ? Number(item.valor) - Number(item.valor_anterior) : null

  return (
    <li
      className={cn(
        'grid gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-[minmax(7rem,auto)_minmax(0,1fr)_auto] sm:items-center',
        item.vigente && 'bg-ink-50/50',
      )}
    >
      {/* Valor + chip de vigencia */}
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            'grid h-2.5 w-2.5 shrink-0 place-items-center rounded-full',
            item.vigente ? 'bg-ink-950 ring-4 ring-ink-950/10' : 'bg-ink-300',
          )}
          aria-hidden
        />
        <div className="min-w-0">
          <p className="tnum text-lg font-bold leading-tight tracking-tight text-ink-950">
            {money0(Number(item.valor))}
          </p>
          <p className="flex items-center gap-1.5 text-[0.68rem] text-ink-400">
            {item.vigente ? (
              <span className="font-semibold text-ink-900">vigente ahora</span>
            ) : (
              <span>duró {duracionLegible(item.vigente_desde, item.vigente_hasta)}</span>
            )}
            {delta !== null && delta !== 0 && (
              <span className={cn('tnum inline-flex items-center gap-0.5 font-medium', delta > 0 ? 'text-ink-900' : 'text-ink-500')}>
                {delta > 0 ? (
                  <ArrowUpRight className="h-3 w-3" aria-hidden />
                ) : (
                  <ArrowDownRight className="h-3 w-3" aria-hidden />
                )}
                {money0(Math.abs(delta))}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* De dónde salió */}
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-px text-[0.68rem] font-medium',
              origen.clase,
            )}
          >
            <Icono className="h-3 w-3" aria-hidden />
            {origen.label}
          </span>
          {item.origen === 'manual' && item.usuario && (
            <span className="text-xs text-ink-600">
              por <b className="text-ink-900">{item.usuario}</b>
            </span>
          )}
          {item.origen === 'automatico' && item.regla && (
            <span className="text-xs text-ink-600">{item.regla}</span>
          )}
          {item.origen === 'inicial' && (
            <span className="text-xs text-ink-500">el valor con el que arrancó el historial</span>
          )}
        </div>
        {(item.blue_venta != null || item.nota) && (
          <p className="break-words text-xs text-ink-400 sm:truncate">
            {item.blue_venta != null && (
              <span className="tnum">
                blue venta {money0(Number(item.blue_venta))}
                {item.blue_compra != null && ` · compra ${money0(Number(item.blue_compra))}`}
              </span>
            )}
            {item.blue_venta != null && item.nota && ' · '}
            {item.nota && <span className="italic">«{item.nota}»</span>}
          </p>
        )}
      </div>

      {/* Vigencia */}
      <div className="tnum text-xs text-ink-500 sm:text-right">
        <p>
          <span className="text-ink-400">desde</span> {fechaHora(item.vigente_desde)}
        </p>
        <p>
          <span className="text-ink-400">hasta</span>{' '}
          {item.vigente_hasta ? fechaHora(item.vigente_hasta) : <b className="text-ink-900">ahora</b>}
        </p>
        {primera && item.vigente && (
          <p className="sr-only">Este es el valor vigente</p>
        )}
      </div>
    </li>
  )
}
