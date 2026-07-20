import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Apple,
  BatteryCharging,
  Cable,
  Eraser,
  Gamepad2,
  Gift,
  Headphones,
  LayoutGrid,
  Package,
  Search,
  SearchX,
  Shield,
  ShoppingBag,
  SlidersHorizontal,
  Smartphone,
  Speaker,
  Tag,
  Watch,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { CategoriaCatalogo, PrecioEfectivoService, ProductoCatalogo } from '@/types'
import {
  listarCategorias,
  listarProductos,
  obtenerConfiguracionCatalogo,
} from '@/services/productos'
import { useAuth } from '@/store/auth'
import { esAdmin } from '@/lib/permisos'
import { money0, num, usd } from '@/lib/format'
import { cn, ctStagger, coincideBusqueda } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { AyudaInfo } from '@/components/ui/AyudaInfo'
import { AyudaProductosPagina } from '@/components/AyudaContenidos'
import { ProductosManager } from '@/components/ProductosManager'

/**
 * Catálogo central de productos (hoja "Accesorios" + lo que se cargue).
 * Se navega por categoría o filtrando (texto, marca, calidad): los filtros
 * COMPONEN y recorren todo el catálogo agrupando por categoría, igual que
 * en Service. Los precios en pesos se derivan del dólar del negocio.
 */

const ICONOS_CATEGORIA: [RegExp, LucideIcon][] = [
  [/fuente|powerbank|carga/i, BatteryCharging],
  [/cable|lightning|usb/i, Cable],
  [/auricular/i, Headphones],
  [/liquidaci/i, Tag],
  [/funda/i, Smartphone],
  [/templado|protector/i, Shield],
  [/smartwatch|watch/i, Watch],
  [/parlante/i, Speaker],
  [/consola/i, Gamepad2],
  [/apple|iphone|ipad|mac/i, Apple],
  [/combo/i, Gift],
  [/xiaomi|samsung/i, Smartphone],
]

function iconoDeCategoria(nombre: string): LucideIcon {
  return ICONOS_CATEGORIA.find(([patron]) => patron.test(nombre))?.[1] ?? Package
}

export function ProductosPage() {
  const usuario = useAuth((s) => s.usuario)
  const admin = esAdmin(usuario)

  const [busqueda, setBusqueda] = useState('')
  const [filtroMarca, setFiltroMarca] = useState('')
  const [filtroCalidad, setFiltroCalidad] = useState('')
  const [categoriaId, setCategoriaId] = useState<number | null>(null)
  const [configOpen, setConfigOpen] = useState(false)

  const { data: categorias = [], isLoading: cargandoCategorias } = useQuery({
    queryKey: ['productos-categorias'],
    queryFn: listarCategorias,
  })
  const { data: productos = [], isLoading: cargandoProductos } = useQuery({
    queryKey: ['productos-items'],
    queryFn: listarProductos,
  })
  const { data: config } = useQuery({
    queryKey: ['productos-config'],
    queryFn: obtenerConfiguracionCatalogo,
  })

  const isLoading = cargandoCategorias || cargandoProductos

  const raices = useMemo(
    () =>
      categorias
        .filter((c) => c.activo && c.padre === null)
        .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre)),
    [categorias],
  )
  const hijasDe = useMemo(() => {
    const mapa = new Map<number, CategoriaCatalogo[]>()
    for (const c of categorias) {
      if (c.padre !== null && c.activo) {
        mapa.set(c.padre, [...(mapa.get(c.padre) ?? []), c].sort((a, b) => a.orden - b.orden))
      }
    }
    return mapa
  }, [categorias])
  const categoriaPorId = useMemo(() => new Map(categorias.map((c) => [c.id, c])), [categorias])

  // Resumen de las categorías con descuento cash propio distinto del general
  // (antes era un texto fijo «auriculares y smartwatch −30 %»). Agrupa por %:
  // «Auriculares, Smartwatch −30 %».
  const excepcionesCash = useMemo(() => {
    if (!config) return ''
    const general = Number(config.descuento_cash_pct)
    const porPct = new Map<number, string[]>()
    for (const c of categorias) {
      if (!c.activo || !c.muestra_cash || c.descuento_cash_pct === null) continue
      const pct = Number(c.descuento_cash_pct)
      if (pct === general) continue
      porPct.set(pct, [...(porPct.get(pct) ?? []), c.nombre])
    }
    return [...porPct.entries()]
      .map(([pct, nombres]) => `${nombres.join(', ')} −${num(pct)} %`)
      .join(' · ')
  }, [categorias, config])

  const query = busqueda.trim()
  const filtrando = Boolean(query) || Boolean(filtroMarca) || Boolean(filtroCalidad)

  const seleccionada = useMemo(() => {
    const elegida = raices.find((c) => c.id === categoriaId)
    if (elegida) return elegida
    return filtrando ? null : raices[0]
  }, [raices, categoriaId, filtrando])

  const marcas = useMemo(
    () => [...new Set(productos.map((p) => p.marca).filter(Boolean))].sort(),
    [productos],
  )
  const calidades = useMemo(
    () => [...new Set(productos.map((p) => p.calidad).filter(Boolean))].sort(),
    [productos],
  )

  function pasaFiltros(p: ProductoCatalogo): boolean {
    if (!p.activo) return false
    if (query && !coincideBusqueda(`${p.nombre} ${p.marca} ${p.calidad} ${p.nota}`, query)) {
      return false
    }
    if (filtroMarca && p.marca !== filtroMarca) return false
    if (filtroCalidad && p.calidad !== filtroCalidad) return false
    return true
  }

  /** Grupos visibles: categoría raíz + sus productos (con los de sus hijas). */
  const visibles = useMemo(() => {
    const base = seleccionada ? [seleccionada] : raices
    return base
      .map((raiz) => {
        const idsGrupo = new Set([raiz.id, ...(hijasDe.get(raiz.id) ?? []).map((h) => h.id)])
        return {
          categoria: raiz,
          productos: productos
            .filter((p) => idsGrupo.has(p.categoria) && pasaFiltros(p))
            .sort((a, b) => {
              const ca = categoriaPorId.get(a.categoria)
              const cb = categoriaPorId.get(b.categoria)
              const ordenCa = ca?.padre ? 1000 + (ca.orden + 1) * 1000 + a.orden : a.orden
              const ordenCb = cb?.padre ? 1000 + (cb.orden + 1) * 1000 + b.orden : b.orden
              return ordenCa - ordenCb
            }),
        }
      })
      .filter((grupo) => grupo.productos.length > 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raices, seleccionada, productos, hijasDe, categoriaPorId, query, filtroMarca, filtroCalidad])

  const totalResultados = visibles.reduce((total, g) => total + g.productos.length, 0)

  return (
    <div className="animate-fade-in">
      <PageHeader
        icon={ShoppingBag}
        eyebrow="Ventas"
        title="Productos"
        subtitle="El catálogo central: accesorios, audio, consolas y equipos, con lista y cash."
        className="ct-rise"
        actions={
          <div className="flex items-center gap-2">
            <AyudaInfo titulo="Cómo usar Productos">
              <AyudaProductosPagina />
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

      {/* Hero: buscador + filtros + parámetros. Sin overflow-hidden: los
          desplegables de los filtros son absolute y quedarían recortados. */}
      <Card className="ct-rise mb-5">
        <div className="grid sm:grid-cols-[1.6fr_1fr]">
          <div className="p-5 sm:p-6">
            <label
              htmlFor="buscar-producto"
              className="mb-2 block text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-400"
            >
              ¿Qué producto buscás?
            </label>
            <div className="flex items-center gap-2.5">
              <Search className="h-6 w-6 shrink-0 text-ink-300" aria-hidden />
              <input
                id="buscar-producto"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Fuente 20W, funda 13, JBL…"
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
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="w-full sm:max-w-[13rem]">
                <Select
                  options={[
                    { value: '', label: 'Todas las marcas' },
                    ...marcas.map((m) => ({ value: m, label: m })),
                  ]}
                  value={filtroMarca}
                  onChange={setFiltroMarca}
                  searchable
                  searchPlaceholder="JBL, Xiaomi, Spigen…"
                  placeholder="Todas las marcas"
                />
              </div>
              <div className="w-full sm:max-w-[13rem]">
                <Select
                  options={[
                    { value: '', label: 'Todas las calidades' },
                    ...calidades.map((c) => ({ value: c, label: c })),
                  ]}
                  value={filtroCalidad}
                  onChange={setFiltroCalidad}
                  placeholder="Todas las calidades"
                />
              </div>
            </div>
          </div>

          <div className="rounded-b-2xl border-t border-line bg-canvas/40 p-5 sm:rounded-bl-none sm:rounded-tr-2xl sm:border-l sm:border-t-0 sm:p-6">
            <p className="mb-2.5 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-400">
              Parámetros vigentes
            </p>
            {config ? (
              <div className="space-y-1.5 text-sm text-ink-700">
                <p className="tnum">
                  Dólar del negocio <b className="text-ink-950">$ {num(Number(config.dolar))}</b>
                </p>
                <p className="tnum">
                  Cash <b className="text-ink-950">−{num(Number(config.descuento_cash_pct))} %</b>
                  {excepcionesCash && (
                    <span className="text-xs text-ink-400"> ({excepcionesCash})</span>
                  )}
                </p>
                <p className="text-xs leading-relaxed text-ink-400">
                  Es el mismo dólar de Service: cambiarlo actualiza las dos listas
                  {admin ? ' (desde Configurar).' : '.'}
                </p>
              </div>
            ) : (
              <Skeleton className="h-16 w-full" />
            )}
          </div>
        </div>
      </Card>

      {/* Categorías: chips con ícono que envuelven; con filtros activos se
          suma "Todas" y los filtros COMPONEN. */}
      {raices.length > 0 && (
        <nav aria-label="Categorías de productos" className="ct-rise mb-4 flex flex-wrap gap-2">
          {filtrando && (
            <ChipCategoria
              activa={seleccionada === null}
              onClick={() => setCategoriaId(null)}
              icono={LayoutGrid}
              etiqueta="Todas"
            />
          )}
          {raices.map((c) => (
            <ChipCategoria
              key={c.id}
              activa={seleccionada?.id === c.id}
              onClick={() => setCategoriaId(c.id)}
              icono={iconoDeCategoria(c.nombre)}
              etiqueta={c.nombre}
            />
          ))}
        </nav>
      )}

      {/* Resultados */}
      {isLoading ? (
        <ProductosSkeleton />
      ) : raices.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="Sin productos cargados"
          description={
            admin
              ? 'Cargá las categorías y productos para empezar.'
              : 'Todavía no hay productos. Pedile a un administrador que los cargue.'
          }
          action={
            admin ? (
              <Button onClick={() => setConfigOpen(true)}>
                <SlidersHorizontal className="h-4 w-4" /> Configurar productos
              </Button>
            ) : undefined
          }
        />
      ) : visibles.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title={query ? `Sin resultados para «${busqueda.trim()}»` : 'Sin resultados con esos filtros'}
          description="Probá con el nombre del producto, la marca o la calidad."
          action={
            <Button
              variant="outline"
              onClick={() => {
                setBusqueda('')
                setFiltroMarca('')
                setFiltroCalidad('')
                setCategoriaId(null)
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
              {visibles.length === 1 ? '1 categoría' : `${visibles.length} categorías`}
            </p>
          )}
          <div className="space-y-4">
            {visibles.map(({ categoria, productos: filas }, i) => (
              <CategoriaCard
                key={categoria.id}
                categoria={categoria}
                productos={filas}
                categoriaPorId={categoriaPorId}
                index={i}
              />
            ))}
          </div>
        </>
      )}

      <ProductosManager open={configOpen} onClose={() => setConfigOpen(false)} />
    </div>
  )
}

function ChipCategoria({
  activa,
  onClick,
  icono: Icono,
  etiqueta,
}: {
  activa: boolean
  onClick: () => void
  icono: LucideIcon
  etiqueta: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      className={cn(
        'inline-flex min-w-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
        activa
          ? 'border-ink-950 bg-ink-950 text-on-ink'
          : 'border-line-strong bg-surface text-ink-600 hover:border-ink-300 hover:bg-ink-50 hover:text-ink-900',
      )}
    >
      <Icono aria-hidden strokeWidth={1.9} className={cn('h-4 w-4 shrink-0', activa ? 'text-on-ink' : 'text-ink-400')} />
      <span className="truncate">{etiqueta}</span>
    </button>
  )
}

// ===== Una categoría con sus productos (subgrupos como separadores) =====

function CategoriaCard({
  categoria,
  productos,
  categoriaPorId,
  index,
}: {
  categoria: CategoriaCatalogo
  productos: ProductoCatalogo[]
  categoriaPorId: Map<number, CategoriaCatalogo>
  index: number
}) {
  const [notaExpandida, setNotaExpandida] = useState(false)
  const nota = categoria.nota.trim()
  const notaLarga = nota.length > 150
  const Icono = iconoDeCategoria(categoria.nombre)

  let subgrupoAnterior: number | null | undefined

  return (
    <Card className="ct-stagger-item overflow-hidden p-0" style={ctStagger(index)}>
      <div className="border-b border-line px-4 py-3.5 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink-100 text-ink-900">
            <Icono className="h-5 w-5" />
          </span>
          <h2 className="min-w-0 flex-1 truncate font-semibold text-ink-900">{categoria.nombre}</h2>
          {categoria.descuento_cash_pct !== null && (
            <Badge tone="solid">Cash −{num(Number(categoria.descuento_cash_pct))} %</Badge>
          )}
          {!categoria.muestra_cash && <Badge tone="outline">Lista + cuotas</Badge>}
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
        {productos.map((producto) => {
          const propia = categoriaPorId.get(producto.categoria)
          const esSubgrupo = propia?.padre != null
          const cambiaSubgrupo = esSubgrupo && producto.categoria !== subgrupoAnterior
          subgrupoAnterior = esSubgrupo ? producto.categoria : null
          return (
            <ProductoFila
              key={producto.id}
              producto={producto}
              subgrupo={cambiaSubgrupo ? propia?.nombre : undefined}
            />
          )
        })}
      </ul>
    </Card>
  )
}

function ProductoFila({ producto, subgrupo }: { producto: ProductoCatalogo; subgrupo?: string }) {
  return (
    <li className="px-4 py-3 sm:px-5">
      {subgrupo && (
        <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-ink-400">
          {subgrupo}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-sm font-semibold text-ink-900">{producto.nombre}</p>
            {producto.calidad && <Badge tone="soft">{producto.calidad}</Badge>}
            {producto.nuevo && <Badge tone="solid">Nuevo</Badge>}
            {producto.a_pedido && <Badge tone="outline">A pedido</Badge>}
          </div>
          {producto.nota && <p className="mt-0.5 text-xs text-ink-400">{producto.nota}</p>}
        </div>
        <div className="shrink-0 sm:text-right">
          <PrecioLineasCatalogo efectivo={producto.efectivo} />
        </div>
      </div>
    </li>
  )
}

/** Las dos líneas Lista/Cash de un producto (o una si falta la otra). */
export function PrecioLineasCatalogo({ efectivo }: { efectivo: PrecioEfectivoService }) {
  const par = (usdValor: number | null, arsValor: number | null) => {
    const partes: string[] = []
    if (usdValor !== null && usdValor !== undefined) partes.push(usd(Number(usdValor)))
    if (arsValor !== null && arsValor !== undefined) partes.push(money0(Number(arsValor)))
    return partes.length ? partes.join(' · ') : null
  }
  const lista = par(efectivo.lista_usd, efectivo.lista_ars)
  const cash = par(efectivo.cash_usd, efectivo.cash_ars)

  if (!lista && !cash) return <p className="text-sm text-ink-400">Sin precio cargado</p>

  return (
    <div className="space-y-0.5">
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

function ProductosSkeleton() {
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
