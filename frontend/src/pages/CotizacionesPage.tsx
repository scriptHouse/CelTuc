import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Eraser, Lightbulb, MessageCircle, Search, SearchX, SlidersHorizontal, Smartphone } from 'lucide-react'
import type { ModeloEquipo } from '@/types'
import { listarModelos } from '@/services/cotizaciones'
import { useAuth } from '@/store/auth'
import { esAdmin } from '@/lib/permisos'
import { num, usd0 } from '@/lib/format'
import { cn, ctStagger, coincideBusqueda } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { AyudaInfo } from '@/components/ui/AyudaInfo'
import { AyudaCotizacionesPagina } from '@/components/AyudaContenidos'
import { useToast } from '@/components/ToastProvider'
import { CotizacionesManager } from '@/components/CotizacionesManager'

/**
 * Cotizaciones de equipos usados. Replica la hoja "Cotizaciones" del Excel:
 * cada modelo tiene su rango de toma MIN-MAX en USD por capacidad, más los
 * precios de service (batería, módulo, tapa...). Todo es configurable desde
 * el botón "Configurar" (solo admin).
 *
 * El botón de WhatsApp copia la respuesta tipo de la planilla: el punto medio
 * entre el mínimo más bajo y el máximo más alto del modelo.
 */

const TIPS = [
  'Por WhatsApp pasá el precio máximo como aproximado, aclarando que aplica en condiciones ideales.',
  'El tope es para un equipo impecable: sin piezas reemplazadas y batería al 98 % o más.',
  'Batería al 82 % o menos: descontá el cambio de batería.',
  'Equipo en parte de pago: restauralo de fábrica y arrancá con una SIM para descartar bloqueo de operador.',
]

/** Respuesta tipo para WhatsApp (misma redacción que la planilla). */
function mensajeWhatsapp(modelo: ModeloEquipo): string | null {
  if (modelo.cotizaciones.length === 0) return null
  const min = Math.min(...modelo.cotizaciones.map((c) => Number(c.precio_min)))
  const max = Math.max(...modelo.cotizaciones.map((c) => Number(c.precio_max)))
  const punta = Math.round((min + max) / 2)
  return (
    `Al ${modelo.nombre_completo} podríamos tomarlo en el orden de los USD ${num(punta)}. ` +
    'Esto siempre y cuando el equipo se encuentre en condiciones estándar y no haya que reacondicionarlo. ' +
    'La valuación final se pasa en el local a la hora de cotizar el equipo.'
  )
}

export function CotizacionesPage() {
  const usuario = useAuth((s) => s.usuario)
  const admin = esAdmin(usuario)
  const toast = useToast()

  const [busqueda, setBusqueda] = useState('')
  const [configOpen, setConfigOpen] = useState(false)

  const { data: modelos = [], isLoading } = useQuery({
    queryKey: ['cotizaciones-modelos'],
    queryFn: listarModelos,
  })

  const activos = useMemo(
    () =>
      modelos
        .filter((m) => m.activo)
        .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre)),
    [modelos],
  )

  const visibles = useMemo(() => {
    const q = busqueda.trim()
    if (!q) return activos
    return activos.filter((m) => coincideBusqueda(m.nombre_completo, q))
  }, [activos, busqueda])

  // Chips de generación (11, 12, 13...) derivados de los modelos cargados.
  const generaciones = useMemo(() => {
    const gens = new Set<number>()
    for (const m of activos) {
      const numero = /^(\d+)/.exec(m.nombre.trim())
      if (numero) gens.add(Number(numero[1]))
    }
    return [...gens].sort((a, b) => a - b)
  }, [activos])

  async function copiarRespuesta(modelo: ModeloEquipo) {
    const mensaje = mensajeWhatsapp(modelo)
    if (!mensaje) return
    try {
      await navigator.clipboard.writeText(mensaje)
      toast.success('Respuesta copiada', 'Pegala en el chat de WhatsApp.')
    } catch {
      toast.error('No se pudo copiar', 'Copiá el rango a mano desde la tarjeta.')
    }
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        icon={Smartphone}
        eyebrow="Usados y service"
        title="Cotizaciones"
        subtitle="Cuánto tomamos cada equipo usado y cuánto cuesta cada service. Valores en dólares."
        className="ct-rise"
        actions={
          <div className="flex items-center gap-2">
            <AyudaInfo titulo="Cómo cotizar usados">
              <AyudaCotizacionesPagina />
            </AyudaInfo>
            {admin && (
              <Button variant="outline" onClick={() => setConfigOpen(true)}>
                <SlidersHorizontal className="h-4 w-4" />
                Configurar
              </Button>
            )}
          </div>
        }
      />

      {/* Hero: buscador + tips de la planilla */}
      <Card className="ct-rise mb-5 overflow-hidden">
        <div className="grid sm:grid-cols-[1.5fr_1fr]">
          <div className="p-5 sm:p-6">
            <label
              htmlFor="buscar-modelo"
              className="mb-2 block text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-400"
            >
              ¿Qué modelo cotizás?
            </label>
            <div className="flex items-center gap-2.5">
              <Search className="h-6 w-6 shrink-0 text-ink-300" aria-hidden />
              <input
                id="buscar-modelo"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="13 Pro Max"
                autoComplete="off"
                className="w-full min-w-0 bg-transparent text-3xl font-bold tracking-tight text-ink-950 placeholder:text-ink-300 focus:outline-none sm:text-4xl"
              />
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {generaciones.map((gen) => {
                const activo = busqueda.trim() === String(gen)
                return (
                  <button
                    key={gen}
                    type="button"
                    onClick={() => setBusqueda(activo ? '' : String(gen))}
                    aria-pressed={activo}
                    className={cn(
                      'tnum rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
                      activo
                        ? 'border-ink-950 bg-ink-950 text-on-ink'
                        : 'border-line-strong bg-surface text-ink-600 hover:border-ink-300 hover:bg-ink-50 hover:text-ink-900',
                    )}
                  >
                    {gen}
                  </button>
                )
              })}
              {busqueda && (
                <button
                  type="button"
                  onClick={() => setBusqueda('')}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-ink-400 transition-colors hover:text-ink-900"
                >
                  <Eraser className="h-3.5 w-3.5" /> Limpiar
                </button>
              )}
            </div>
          </div>

          <div className="border-t border-line bg-canvas/40 p-5 sm:border-l sm:border-t-0 sm:p-6">
            <p className="mb-2.5 flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-400">
              <Lightbulb className="h-3.5 w-3.5" aria-hidden /> Tips para cotizar
            </p>
            <ul className="space-y-1.5">
              {TIPS.map((tip) => (
                <li key={tip} className="flex gap-2 text-xs leading-relaxed text-ink-500">
                  <span aria-hidden className="mt-[0.4rem] h-1 w-1 shrink-0 rounded-full bg-ink-300" />
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>

      {/* Resultados */}
      {isLoading ? (
        <ModelosSkeleton />
      ) : activos.length === 0 ? (
        <EmptyState
          icon={Smartphone}
          title="Sin modelos cargados"
          description={
            admin
              ? 'Cargá los modelos con sus rangos de toma para empezar a cotizar.'
              : 'Todavía no hay cotizaciones cargadas. Pedile a un administrador que las cargue.'
          }
          action={
            admin ? (
              <Button onClick={() => setConfigOpen(true)}>
                <SlidersHorizontal className="h-4 w-4" /> Configurar cotizaciones
              </Button>
            ) : undefined
          }
        />
      ) : visibles.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title={`Sin resultados para «${busqueda.trim()}»`}
          description="Probá con el número de modelo, por ejemplo: 13, 15 Pro, 16e."
          action={
            <Button variant="outline" onClick={() => setBusqueda('')}>
              Limpiar búsqueda
            </Button>
          }
        />
      ) : (
        <>
          <p className="ct-rise mb-3 text-xs text-ink-400">
            {visibles.length === 1 ? '1 modelo' : `${visibles.length} modelos`} · precios en dólares (USD)
          </p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visibles.map((modelo, i) => (
              <ModeloCard key={modelo.id} modelo={modelo} index={i} onCopiar={() => copiarRespuesta(modelo)} />
            ))}
          </div>
        </>
      )}

      <CotizacionesManager open={configOpen} onClose={() => setConfigOpen(false)} />
    </div>
  )
}

// ===== Tarjeta de un modelo: rangos de toma + service =====

function ModeloCard({
  modelo,
  index,
  onCopiar,
}: {
  modelo: ModeloEquipo
  index: number
  onCopiar: () => void
}) {
  return (
    <Card className="ct-stagger-item flex flex-col overflow-hidden p-0" style={ctStagger(index)}>
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink-100 text-ink-900">
            <Smartphone className="h-5 w-5" />
          </span>
          <p className="truncate font-semibold text-ink-900">{modelo.nombre_completo}</p>
        </div>
        {modelo.cotizaciones.length > 0 && (
          <button
            type="button"
            onClick={onCopiar}
            title="Copiar la respuesta tipo para WhatsApp"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-xs font-medium text-ink-600 transition-colors hover:border-ink-300 hover:bg-ink-50 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
          >
            <MessageCircle className="h-3.5 w-3.5" aria-hidden />
            WhatsApp
          </button>
        )}
      </div>

      <div className="flex-1 px-4 py-3.5 sm:px-5">
        <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-400">
          Toma de equipo
        </p>
        {modelo.cotizaciones.length === 0 ? (
          <p className="text-sm text-ink-400">Sin rango de toma cargado.</p>
        ) : (
          <ul className="space-y-1.5">
            {modelo.cotizaciones.map((c) => (
              <li key={c.id} className="flex items-baseline justify-between gap-3">
                <span className="shrink-0 text-sm font-medium text-ink-600">{c.capacidad_label}</span>
                <span className="tnum text-right text-base font-bold text-ink-950">
                  {usd0(Number(c.precio_min))} – {num(Number(c.precio_max))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {modelo.servicios.length > 0 && (
        <div className="border-t border-line bg-canvas/40 px-4 py-3.5 sm:px-5">
          <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-400">Service</p>
          <ul className="space-y-1">
            {modelo.servicios.map((s) => (
              <li key={s.id} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-sm text-ink-600">{s.tipo_nombre}</span>
                <span className="tnum shrink-0 text-sm font-semibold text-ink-900">{usd0(Number(s.precio))}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

function ModelosSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-xl" />
            <Skeleton className="h-4 w-1/2" />
          </div>
          <div className="mt-4 space-y-2.5">
            {Array.from({ length: 3 }).map((__, j) => (
              <Skeleton key={j} className="h-8 w-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
