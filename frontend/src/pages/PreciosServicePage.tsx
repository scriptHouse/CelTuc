import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Aperture,
  BatteryCharging,
  Camera,
  CircuitBoard,
  Eraser,
  Layers,
  MessageSquareX,
  PlugZap,
  ScanFace,
  Search,
  SearchX,
  SlidersHorizontal,
  Smartphone,
  SmartphoneNfc,
  SwitchCamera,
  Volume2,
  Watch,
  Wrench,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type {
  ItemPrecioService,
  PrecioEfectivoService,
  SeccionPreciosService,
} from '@/types'
import { listarDispositivos, listarSecciones, obtenerConfiguracion } from '@/services/preciosService'
import { useAuth } from '@/store/auth'
import { esAdmin } from '@/lib/permisos'
import { money0, num, usd } from '@/lib/format'
import { cn, ctStagger } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { PreciosServiceManager } from '@/components/PreciosServiceManager'

/** Ícono para el chip de cada sección, por palabra clave del nombre.
 * Así las secciones nuevas que cargue el admin reciben un ícono razonable
 * sin tocar código (fallback: llave inglesa). El orden importa: "watch" y
 * "selfie" antes que "módulos"/"cámara", que son más genéricos. */
const ICONOS_SECCION: [RegExp, LucideIcon][] = [
  [/watch/i, Watch],
  [/bater/i, BatteryCharging],
  [/glass de pantalla/i, Smartphone],
  [/m[óo]dulo/i, Layers],
  [/pieza desconocida|mensaje/i, MessageSquareX],
  [/placa/i, CircuitBoard],
  [/face id/i, ScanFace],
  [/selfie/i, SwitchCamera],
  [/glass de c[áa]mara/i, Aperture],
  [/c[áa]mara/i, Camera],
  [/flex|carga/i, PlugZap],
  [/audio|parlante|o[íi]do/i, Volume2],
  [/tapa/i, SmartphoneNfc],
]

function iconoDeSeccion(nombre: string): LucideIcon {
  return ICONOS_SECCION.find(([patron]) => patron.test(nombre))?.[1] ?? Wrench
}

/** Arma las opciones del selector: líneas (con 2+ equipos) y equipos. */
export function opcionesDeEquipo(
  dispositivos: { id: number; nombre: string; linea: string }[],
): { value: string; label: string }[] {
  const porLinea = new Map<string, number>()
  for (const d of dispositivos) {
    if (d.linea) porLinea.set(d.linea, (porLinea.get(d.linea) ?? 0) + 1)
  }
  const lineas = [...new Set(dispositivos.map((d) => d.linea))].filter(
    (l) => l && (porLinea.get(l) ?? 0) > 1,
  )
  return [
    { value: '', label: 'Todos los equipos' },
    ...lineas.map((l) => ({ value: `linea:${l}`, label: `Línea ${l} (completa)` })),
    ...dispositivos.map((d) => ({ value: `disp:${d.id}`, label: d.nombre })),
  ]
}

/**
 * Lista de precios del service técnico (hoja "Precios Service" del Excel).
 * Se navega por sección (Baterías, Módulos, ...) o buscando un modelo: la
 * búsqueda recorre TODAS las secciones y agrupa los resultados, así "13 pro"
 * muestra batería, módulo, cámara, etc. de ese equipo en una sola pantalla.
 * Los precios en pesos se derivan del dólar configurado (solo admin lo cambia).
 */

export function PreciosServicePage() {
  const usuario = useAuth((s) => s.usuario)
  const admin = esAdmin(usuario)

  const [busqueda, setBusqueda] = useState('')
  const [filtroEquipo, setFiltroEquipo] = useState('')
  const [seccionId, setSeccionId] = useState<number | null>(null)
  const [configOpen, setConfigOpen] = useState(false)

  const { data: secciones = [], isLoading } = useQuery({
    queryKey: ['service-secciones'],
    queryFn: listarSecciones,
  })
  const { data: config } = useQuery({
    queryKey: ['service-config'],
    queryFn: obtenerConfiguracion,
  })
  const { data: dispositivos = [] } = useQuery({
    queryKey: ['service-dispositivos'],
    queryFn: listarDispositivos,
  })

  const activas = useMemo(
    () =>
      secciones
        .filter((s) => s.activo)
        .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre)),
    [secciones],
  )

  const seleccionada = activas.find((s) => s.id === seccionId) ?? activas[0]
  const query = busqueda.trim().toLowerCase()

  const dispositivosActivos = useMemo(
    () =>
      dispositivos
        .filter((d) => d.activo)
        .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre)),
    [dispositivos],
  )

  const opcionesEquipos = useMemo(() => opcionesDeEquipo(dispositivosActivos), [dispositivosActivos])

  /** Ids de equipos que matchean el filtro del selector (null = sin filtro). */
  const idsEquipo = useMemo(() => {
    if (!filtroEquipo) return null
    const [tipo, valor] = filtroEquipo.split(':')
    if (tipo === 'disp') return new Set([Number(valor)])
    return new Set(dispositivosActivos.filter((d) => d.linea === valor).map((d) => d.id))
  }, [filtroEquipo, dispositivosActivos])

  const filtrando = Boolean(query) || idsEquipo !== null

  /** Filtrando (texto o equipo): todas las secciones. Si no: la sección activa. */
  const visibles = useMemo(() => {
    const base = filtrando ? activas : seleccionada ? [seleccionada] : []
    return base
      .map((seccion) => ({
        seccion,
        items: seccion.items.filter(
          (item) =>
            item.activo &&
            (!query || `${item.etiqueta} ${item.nota}`.toLowerCase().includes(query)) &&
            (idsEquipo === null || item.dispositivos.some((id) => idsEquipo.has(id))),
        ),
      }))
      .filter((grupo) => grupo.items.length > 0)
  }, [activas, seleccionada, filtrando, query, idsEquipo])

  const totalResultados = visibles.reduce((total, grupo) => total + grupo.items.length, 0)
  const etiquetaFiltro = opcionesEquipos.find((o) => o.value === filtroEquipo)?.label

  return (
    <div className="animate-fade-in">
      <PageHeader
        icon={Wrench}
        eyebrow="Taller"
        title="Service"
        subtitle="Lista de precios del service técnico: lista y cash, en dólares y pesos."
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

      {/* Hero: buscador + parámetros vigentes */}
      <Card className="ct-rise mb-5 overflow-hidden">
        <div className="grid sm:grid-cols-[1.6fr_1fr]">
          <div className="p-5 sm:p-6">
            <label
              htmlFor="buscar-service"
              className="mb-2 block text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-400"
            >
              ¿Qué equipo o reparación buscás?
            </label>
            <div className="flex items-center gap-2.5">
              <Search className="h-6 w-6 shrink-0 text-ink-300" aria-hidden />
              <input
                id="buscar-service"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="13 Pro, baño químico, iPad…"
                autoComplete="off"
                className="w-full min-w-0 bg-transparent text-2xl font-bold tracking-tight text-ink-950 placeholder:text-ink-300 focus:outline-none sm:text-4xl"
              />
              {busqueda && (
                <button
                  type="button"
                  onClick={() => setBusqueda('')}
                  aria-label="Limpiar búsqueda"
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-ink-400 transition-colors hover:text-ink-900"
                >
                  <Eraser className="h-3.5 w-3.5" /> Limpiar
                </button>
              )}
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <div className="w-full sm:max-w-[16rem]">
                <Select
                  options={opcionesEquipos}
                  value={filtroEquipo}
                  onChange={setFiltroEquipo}
                  searchable
                  searchPlaceholder="iPhone 11 Pro, línea 13…"
                  placeholder="Todos los equipos"
                />
              </div>
              <p className="text-xs text-ink-400">
                Elegí un equipo o una línea y aparece todo lo que le aplica.
              </p>
            </div>
          </div>

          <div className="border-t border-line bg-canvas/40 p-5 sm:border-l sm:border-t-0 sm:p-6">
            <p className="mb-2.5 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-400">
              Parámetros vigentes
            </p>
            {config ? (
              <div className="space-y-1.5 text-sm text-ink-700">
                <p className="tnum">
                  Dólar service <b className="text-ink-950">$ {num(Number(config.dolar))}</b>
                </p>
                <p className="tnum">
                  Cash <b className="text-ink-950">−{num(Number(config.descuento_cash_pct))} %</b>
                  <span className="text-xs text-ink-400"> sobre el precio de lista</span>
                </p>
                <p className="text-xs leading-relaxed text-ink-400">
                  Los pesos salen del dólar y se redondean para arriba
                  {admin ? '; cambialo desde Configurar y toda la lista se actualiza.' : '.'}
                </p>
              </div>
            ) : (
              <Skeleton className="h-16 w-full" />
            )}
          </div>
        </div>
      </Card>

      {/* Secciones: chips con ícono que envuelven — todas visibles de un
          vistazo, sin scroll horizontal escondiendo opciones. */}
      {activas.length > 0 && !filtrando && (
        <nav aria-label="Secciones de service" className="ct-rise mb-4 flex flex-wrap gap-2">
          {activas.map((seccion) => {
            const activa = seleccionada?.id === seccion.id
            const Icono = iconoDeSeccion(seccion.nombre)
            return (
              <button
                key={seccion.id}
                type="button"
                onClick={() => setSeccionId(seccion.id)}
                aria-pressed={activa}
                className={cn(
                  'inline-flex min-w-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                  activa
                    ? 'border-ink-950 bg-ink-950 text-on-ink'
                    : 'border-line-strong bg-surface text-ink-600 hover:border-ink-300 hover:bg-ink-50 hover:text-ink-900',
                )}
              >
                <Icono
                  aria-hidden
                  strokeWidth={1.9}
                  className={cn('h-4 w-4 shrink-0', activa ? 'text-on-ink' : 'text-ink-400')}
                />
                <span className="truncate">{seccion.nombre}</span>
              </button>
            )
          })}
        </nav>
      )}

      {/* Resultados */}
      {isLoading ? (
        <SeccionesSkeleton />
      ) : activas.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="Sin precios de service cargados"
          description={
            admin
              ? 'Cargá las secciones con sus precios para empezar.'
              : 'Todavía no hay precios cargados. Pedile a un administrador que los cargue.'
          }
          action={
            admin ? (
              <Button onClick={() => setConfigOpen(true)}>
                <SlidersHorizontal className="h-4 w-4" /> Configurar service
              </Button>
            ) : undefined
          }
        />
      ) : visibles.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title={
            query
              ? `Sin resultados para «${busqueda.trim()}»`
              : `Sin precios cargados para ${etiquetaFiltro ?? 'ese equipo'}`
          }
          description="Probá con el modelo (13 Pro, XS Max), una línea o el nombre del service (módulo, baño químico)."
          action={
            <Button
              variant="outline"
              onClick={() => {
                setBusqueda('')
                setFiltroEquipo('')
              }}
            >
              Limpiar filtros
            </Button>
          }
        />
      ) : (
        <>
          {filtrando && (
            <p className="mb-3 text-xs text-ink-400">
              {totalResultados === 1 ? '1 resultado' : `${totalResultados} resultados`} en{' '}
              {visibles.length === 1 ? '1 sección' : `${visibles.length} secciones`}
              {idsEquipo !== null && etiquetaFiltro ? ` para ${etiquetaFiltro}` : ''}
            </p>
          )}
          <div className="space-y-4">
            {visibles.map(({ seccion, items }, i) => (
              <SeccionCard key={seccion.id} seccion={seccion} items={items} index={i} />
            ))}
          </div>
        </>
      )}

      <PreciosServiceManager open={configOpen} onClose={() => setConfigOpen(false)} />
    </div>
  )
}

// ===== Una sección con sus filas =====

function SeccionCard({
  seccion,
  items,
  index,
}: {
  seccion: SeccionPreciosService
  items: ItemPrecioService[]
  index: number
}) {
  const [notaExpandida, setNotaExpandida] = useState(false)
  const nota = seccion.nota.trim()
  const notaLarga = nota.length > 150

  const variantesPorId = useMemo(
    () => new Map(seccion.variantes.map((v) => [v.id, v])),
    [seccion.variantes],
  )

  return (
    <Card className="ct-stagger-item overflow-hidden p-0" style={ctStagger(index)}>
      <div className="border-b border-line px-4 py-3.5 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink-100 text-ink-900">
            <Wrench className="h-5 w-5" />
          </span>
          <h2 className="min-w-0 flex-1 truncate font-semibold text-ink-900">{seccion.nombre}</h2>
          {seccion.descuento_cash_pct !== null && (
            <Badge tone="solid">Cash −{num(Number(seccion.descuento_cash_pct))} %</Badge>
          )}
        </div>
        {nota && (
          <p className="mt-2 text-xs leading-relaxed text-ink-400">
            {notaLarga && !notaExpandida ? `${nota.slice(0, 150).trimEnd()}… ` : `${nota} `}
            {notaLarga && (
              <button
                type="button"
                onClick={() => setNotaExpandida((v) => !v)}
                className="font-medium text-ink-600 underline-offset-2 transition-colors hover:text-ink-900 hover:underline"
              >
                {notaExpandida ? 'ver menos' : 'ver más'}
              </button>
            )}
          </p>
        )}
      </div>

      <ul className="divide-y divide-line">
        {items.map((item) => (
          <ItemFila key={item.id} item={item} variantesPorId={variantesPorId} />
        ))}
      </ul>
    </Card>
  )
}

function ItemFila({
  item,
  variantesPorId,
}: {
  item: ItemPrecioService
  variantesPorId: Map<number, { id: number; nombre: string; orden: number }>
}) {
  const precios = item.precios
  const multiVariante = precios.length > 1

  return (
    <li className="px-4 py-3 sm:px-5">
      <div
        className={cn(
          'flex flex-col gap-2.5',
          !multiVariante && 'sm:flex-row sm:items-center sm:justify-between sm:gap-4',
        )}
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-900">{item.etiqueta}</p>
          {item.nota && <p className="mt-0.5 text-xs text-ink-400">{item.nota}</p>}
        </div>

        {multiVariante ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {precios.map((precio) => (
              <div key={precio.id} className="rounded-xl bg-canvas/60 px-3 py-2 ring-1 ring-line">
                <p className="mb-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-ink-400">
                  {variantesPorId.get(precio.variante)?.nombre ?? 'Variante'}
                </p>
                <PrecioLineas efectivo={precio.efectivo} />
              </div>
            ))}
          </div>
        ) : precios.length === 1 ? (
          <div className="shrink-0 sm:text-right">
            <PrecioLineas efectivo={precios[0].efectivo} alineado />
          </div>
        ) : (
          <p className="text-sm text-ink-400">Sin precios cargados.</p>
        )}
      </div>
    </li>
  )
}

/** Las dos líneas Lista/Cash (o una sola si son iguales o falta una). */
function PrecioLineas({
  efectivo,
  alineado = false,
}: {
  efectivo: PrecioEfectivoService
  alineado?: boolean
}) {
  const lista = formatearPar(efectivo.lista_usd, efectivo.lista_ars)
  const cash = formatearPar(efectivo.cash_usd, efectivo.cash_ars)

  // Precio único (ej: "Quitar mensaje"): lista y cash idénticos.
  if (lista && cash && lista === cash) {
    return <p className="tnum text-sm font-bold text-ink-950">{lista}</p>
  }

  return (
    <div className={cn('space-y-0.5', alineado && 'sm:ml-auto')}>
      {lista && (
        <p className="tnum text-sm">
          <span className="mr-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-ink-400">
            Lista
          </span>
          <span className="font-bold text-ink-950">{lista}</span>
        </p>
      )}
      {cash && (
        <p className="tnum text-sm">
          <span className="mr-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-ink-400">
            Cash
          </span>
          <span className="font-medium text-ink-600">{cash}</span>
        </p>
      )}
    </div>
  )
}

function formatearPar(usdValor: number | null, arsValor: number | null): string | null {
  const partes: string[] = []
  if (usdValor !== null && usdValor !== undefined) partes.push(usd(Number(usdValor)))
  if (arsValor !== null && arsValor !== undefined) partes.push(money0(Number(arsValor)))
  return partes.length ? partes.join(' · ') : null
}

function SeccionesSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-xl" />
            <Skeleton className="h-4 w-1/3" />
          </div>
          <div className="mt-4 space-y-2.5">
            {Array.from({ length: 5 }).map((__, j) => (
              <Skeleton key={j} className="h-10 w-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
