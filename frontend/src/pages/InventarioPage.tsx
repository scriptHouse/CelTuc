import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeftRight,
  Boxes,
  ClipboardList,
  Loader2,
  Minus,
  Package,
  PackageSearch,
  Pencil,
  Plus,
  Search,
  Store,
  Trash2,
} from 'lucide-react'
import type { CategoriaCatalogo, ProductoCatalogo } from '@/types'
import { listarCategorias, listarProductos } from '@/services/productos'
import {
  actualizarSucursal,
  ajustarStock,
  crearSucursal,
  eliminarSucursal,
  listarMovimientos,
  listarStock,
  listarSucursales,
  transferirStock,
  type MovimientoStock,
  type StockRow,
  type Sucursal,
} from '@/services/inventario'
import { ApiError } from '@/lib/api'
import { useAuth } from '@/store/auth'
import { esAdmin } from '@/lib/permisos'
import { money0, num, tiempoRelativo } from '@/lib/format'
import { cn, coincideBusqueda, ctStagger } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { AyudaInfo } from '@/components/ui/AyudaInfo'
import { AyudaInventario } from '@/components/AyudaContenidos'
import { useToast } from '@/components/ToastProvider'
import { useConfirm } from '@/components/ConfirmProvider'

/**
 * Inventario real: stock por sucursal sobre el catálogo central de productos.
 * Los precios son los vivos del catálogo (derivados del dólar del negocio);
 * acá solo se manejan cantidades: ajustar, fijar mínimos y transferir entre
 * sucursales. Cada cambio queda registrado (quién, cuándo, cuánto y por qué).
 */

type SeleccionSucursal = number | 'todas'
type Vista = 'con-stock' | 'todos' | 'bajo'

const VISTAS: Array<{ id: Vista; label: string }> = [
  { id: 'con-stock', label: 'Con stock' },
  { id: 'todos', label: 'Todo el catálogo' },
  { id: 'bajo', label: 'Bajo mínimo' },
]

export function InventarioPage() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const usuario = useAuth((s) => s.usuario)
  const admin = esAdmin(usuario)

  const { data: sucursales = [], isLoading: cargandoSucursales } = useQuery({
    queryKey: ['inv-sucursales'],
    queryFn: listarSucursales,
  })
  const { data: stock = [], isLoading: cargandoStock } = useQuery({
    queryKey: ['inv-stock'],
    queryFn: listarStock,
  })
  const { data: productos = [], isLoading: cargandoProductos } = useQuery({
    queryKey: ['productos-items'],
    queryFn: listarProductos,
  })
  const { data: categorias = [] } = useQuery({
    queryKey: ['productos-categorias'],
    queryFn: listarCategorias,
  })

  const cargando = cargandoSucursales || cargandoStock || cargandoProductos

  const activas = useMemo(
    () => sucursales.filter((s) => s.activa).sort((a, b) => a.orden - b.orden || a.id - b.id),
    [sucursales],
  )

  // Arranca en "Todas" (pedido del usuario): la foto general primero, y para
  // ajustar se elige una sucursal. Con una sola sucursal, directo a esa.
  const [sel, setSel] = useState<SeleccionSucursal | null>(null)
  useEffect(() => {
    if (sel === null && activas.length) setSel(activas.length > 1 ? 'todas' : activas[0].id)
  }, [activas, sel])

  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [vista, setVista] = useState<Vista>('con-stock')
  const buscando = q.trim() !== ''

  // ---- Índices ----
  const raices = useMemo(
    () =>
      categorias
        .filter((c) => c.padre === null)
        .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre)),
    [categorias],
  )
  const categoriaPorId = useMemo(() => new Map(categorias.map((c) => [c.id, c])), [categorias])
  const raizDe = (c: CategoriaCatalogo | undefined): CategoriaCatalogo | undefined =>
    c?.padre != null ? categoriaPorId.get(c.padre) : c

  /** producto -> sucursal -> fila de stock */
  const filas = useMemo(() => {
    const mapa = new Map<number, Map<number, StockRow>>()
    for (const r of stock) {
      if (!mapa.has(r.producto)) mapa.set(r.producto, new Map())
      mapa.get(r.producto)!.set(r.sucursal, r)
    }
    return mapa
  }, [stock])

  const filaDe = (productoId: number, sucursalId: number) => filas.get(productoId)?.get(sucursalId)
  const cantidadDe = (productoId: number, donde: SeleccionSucursal) => {
    const porSucursal = filas.get(productoId)
    if (!porSucursal) return 0
    if (donde === 'todas') {
      let total = 0
      porSucursal.forEach((r) => (total += r.cantidad))
      return total
    }
    return porSucursal.get(donde)?.cantidad ?? 0
  }
  const bajoMinimo = (productoId: number, donde: SeleccionSucursal) => {
    const porSucursal = filas.get(productoId)
    if (!porSucursal) return false
    const rows = donde === 'todas' ? [...porSucursal.values()] : [porSucursal.get(donde)]
    return rows.some((r) => r && r.stock_minimo !== null && r.cantidad <= r.stock_minimo)
  }

  // ---- Filtrado ----
  const visibles = useMemo(() => {
    if (sel === null) return []
    const termino = q.trim()
    return productos.filter((p) => {
      if (!p.activo) return false
      if (termino && !coincideBusqueda(`${p.nombre} ${p.marca} ${p.calidad}`, termino)) return false
      if (cat) {
        const raiz = raizDe(categoriaPorId.get(p.categoria))
        if (String(raiz?.id ?? '') !== cat) return false
      }
      // Buscando se recorre TODO el catálogo (para cargar stock de algo nuevo);
      // sin búsqueda manda la vista elegida.
      if (termino) return true
      if (vista === 'con-stock') return cantidadDe(p.id, sel) > 0
      if (vista === 'bajo') return bajoMinimo(p.id, sel)
      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productos, q, cat, vista, sel, filas, categoriaPorId])

  const grupos = useMemo(() => {
    const porRaiz = new Map<number, { raiz: CategoriaCatalogo; items: ProductoCatalogo[] }>()
    for (const p of visibles) {
      const raiz = raizDe(categoriaPorId.get(p.categoria))
      if (!raiz) continue
      if (!porRaiz.has(raiz.id)) porRaiz.set(raiz.id, { raiz, items: [] })
      porRaiz.get(raiz.id)!.items.push(p)
    }
    return [...porRaiz.values()].sort(
      (a, b) => a.raiz.orden - b.raiz.orden || a.raiz.nombre.localeCompare(b.raiz.nombre),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibles, categoriaPorId])

  // ---- Stats de la selección ----
  // En "Todas" las 4 tarjetas son la SUMA de las sucursales (Solar 220 +
  // Centro 188 = 408): cada renglón producto×sucursal cuenta por separado,
  // así los números de las pestañas siempre cierran entre sí.
  const stats = useMemo(() => {
    if (sel === null) return { conStock: 0, unidades: 0, valorLista: 0, bajo: 0 }
    const mirando = sel === 'todas' ? activas.map((s) => s.id) : [sel]
    let conStock = 0
    let unidades = 0
    let valorLista = 0
    let bajo = 0
    for (const p of productos) {
      const lista = p.efectivo?.lista_ars
      for (const sucursalId of mirando) {
        const fila = filaDe(p.id, sucursalId)
        const cantidad = fila?.cantidad ?? 0
        if (cantidad > 0) {
          conStock += 1
          unidades += cantidad
          if (lista != null) valorLista += cantidad * Number(lista)
        }
        if (fila && fila.stock_minimo !== null && cantidad <= fila.stock_minimo) bajo += 1
      }
    }
    return { conStock, unidades, valorLista, bajo }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productos, filas, sel, activas])

  // ---- Mutaciones ----
  const [pendiente, setPendiente] = useState<string | null>(null)

  const refrescarStock = (fila: StockRow) => {
    queryClient.setQueryData<StockRow[]>(['inv-stock'], (previas = []) => {
      const idx = previas.findIndex((r) => r.producto === fila.producto && r.sucursal === fila.sucursal)
      if (idx === -1) return [...previas, fila]
      const copia = [...previas]
      copia[idx] = fila
      return copia
    })
    queryClient.invalidateQueries({ queryKey: ['inv-movimientos'] })
  }

  const ajustar = useMutation({
    mutationFn: ajustarStock,
    onMutate: (input) => setPendiente(`${input.producto}-${input.sucursal}`),
    onSettled: () => setPendiente(null),
    onSuccess: ({ stock: fila }) => refrescarStock(fila),
    onError: (e) =>
      toast.error('No se pudo ajustar', e instanceof ApiError ? e.message : undefined),
  })

  // ---- Modales ----
  const [detalle, setDetalle] = useState<{ producto: ProductoCatalogo; sucursal: Sucursal } | null>(null)
  const [gestionarSucursales, setGestionarSucursales] = useState(false)

  const opcionesCategoria = [
    { value: '', label: 'Todas las categorías' },
    ...raices.map((c) => ({ value: String(c.id), label: c.nombre })),
  ]

  return (
    <div className="animate-fade-in">
      <PageHeader
        icon={Boxes}
        eyebrow="Operación"
        title="Inventario"
        subtitle="El stock real de cada sucursal, conectado al catálogo de productos (precios siempre vivos)."
        className="ct-rise"
        actions={
          <>
            {admin && (
              <Button variant="outline" onClick={() => setGestionarSucursales(true)}>
                <Store className="h-4 w-4" />
                Sucursales
              </Button>
            )}
            <AyudaInfo titulo="Cómo usar el inventario">
              <AyudaInventario />
            </AyudaInfo>
          </>
        }
      />

      {/* Selector de sucursal */}
      <div className="ct-rise mb-4 flex flex-wrap items-center gap-2" role="tablist" aria-label="Sucursal">
        {activas.map((s) => (
          <PillSucursal key={s.id} activa={sel === s.id} onClick={() => setSel(s.id)}>
            {s.nombre}
          </PillSucursal>
        ))}
        {activas.length > 1 && (
          <PillSucursal activa={sel === 'todas'} onClick={() => setSel('todas')}>
            Todas
          </PillSucursal>
        )}
      </div>

      {/* Resumen */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          className="ct-stagger-item"
          style={ctStagger(0)}
          label="Productos con stock"
          value={num(stats.conStock)}
          hint={sel === 'todas' ? 'sumadas las sucursales' : undefined}
          icon={Package}
        />
        <StatCard className="ct-stagger-item" style={ctStagger(1)} label="Unidades" value={num(stats.unidades)} icon={Boxes} />
        <StatCard className="ct-stagger-item" style={ctStagger(2)} label="Valor a lista" value={money0(stats.valorLista)} hint="según precios vivos del catálogo" icon={PackageSearch} />
        <StatCard className="ct-stagger-item" style={ctStagger(3)} label="Bajo mínimo" value={num(stats.bajo)} hint="para reponer" icon={ClipboardList} />
      </div>

      {/* Controles */}
      <div className="ct-rise mb-2 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar en todo el catálogo (nombre, marca, calidad)"
            className="pl-10"
          />
        </div>
        <Select
          options={opcionesCategoria}
          value={cat}
          onChange={setCat}
          placeholder="Categoría"
          searchable
          className="sm:w-60"
        />
      </div>
      <div className="ct-rise mb-4 flex flex-wrap items-center gap-1.5">
        {VISTAS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setVista(v.id)}
            aria-pressed={vista === v.id && !buscando}
            disabled={buscando}
            className={cn(
              'h-8 rounded-full px-3.5 text-xs font-medium transition-colors',
              vista === v.id && !buscando
                ? 'bg-ink-100 text-ink-900'
                : 'text-ink-500 hover:bg-ink-50 hover:text-ink-800',
              buscando && 'opacity-40',
            )}
          >
            {v.label}
          </button>
        ))}
        {buscando && (
          <span className="text-xs text-ink-400">
            Buscando en todo el catálogo — el filtro de vista se aplica al limpiar la búsqueda.
          </span>
        )}
      </div>

      {/* Listado */}
      {cargando || sel === null ? (
        <ListadoSkeleton />
      ) : visibles.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title={buscando ? 'Sin resultados' : vista === 'bajo' ? 'Nada bajo mínimo' : 'Sin stock cargado'}
          description={
            buscando
              ? 'Probá con otra búsqueda o cambiá la categoría.'
              : vista === 'bajo'
                ? 'Ningún producto está en o por debajo de su mínimo en esta vista.'
                : 'Buscá un producto del catálogo y cargale unidades con el botón +.'
          }
        />
      ) : (
        <div className="space-y-4">
          {grupos.map(({ raiz, items }) => (
            <Card key={raiz.id} className="ct-rise overflow-hidden">
              <div className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
                <h2 className="min-w-0 truncate text-sm font-semibold uppercase tracking-[0.08em] text-ink-700">
                  {raiz.nombre}
                </h2>
                <span className="tnum shrink-0 text-xs text-ink-400">{num(items.length)}</span>
              </div>
              <ul className="divide-y divide-line">
                {items.map((p, i) => (
                  <FilaProducto
                    key={p.id}
                    producto={p}
                    admin={admin}
                    sel={sel}
                    activas={activas}
                    filaDe={filaDe}
                    ocupado={pendiente}
                    onDelta={(sucursalId, delta) =>
                      ajustar.mutate({ producto: p.id, sucursal: sucursalId, delta })
                    }
                    onDetalle={(sucursal) => setDetalle({ producto: p, sucursal })}
                    estilo={ctStagger(Math.min(i, 14))}
                  />
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      <DetalleStockModal
        abierto={detalle !== null}
        contexto={detalle}
        sucursales={activas}
        admin={admin}
        onCerrar={() => setDetalle(null)}
        onListo={refrescarStock}
      />
      {admin && (
        <SucursalesModal open={gestionarSucursales} onClose={() => setGestionarSucursales(false)} />
      )}
    </div>
  )
}

// ===== Subcomponentes =====

function PillSucursal({
  activa,
  onClick,
  children,
}: {
  activa: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={activa}
      onClick={onClick}
      className={cn(
        'h-9 select-none rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
        activa
          ? 'bg-ink-950 text-on-ink'
          : 'border border-line-strong bg-surface text-ink-600 hover:border-ink-300 hover:bg-ink-50',
      )}
    >
      {children}
    </button>
  )
}

function FilaProducto({
  producto,
  admin,
  sel,
  activas,
  filaDe,
  ocupado,
  onDelta,
  onDetalle,
  estilo,
}: {
  producto: ProductoCatalogo
  admin: boolean
  sel: SeleccionSucursal
  activas: Sucursal[]
  filaDe: (productoId: number, sucursalId: number) => StockRow | undefined
  ocupado: string | null
  onDelta: (sucursalId: number, delta: number) => void
  onDetalle: (sucursal: Sucursal) => void
  estilo: React.CSSProperties
}) {
  const lista = producto.efectivo?.lista_ars

  const etiquetas = [producto.calidad, producto.marca, producto.nota].filter(Boolean).join(' · ')

  if (sel === 'todas') {
    const total = activas.reduce((acc, s) => acc + (filaDe(producto.id, s.id)?.cantidad ?? 0), 0)
    return (
      <li className="ct-stagger-fade flex items-center gap-3 px-4 py-3 sm:px-5" style={estilo}>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink-900">
            {producto.nombre}
            {producto.a_pedido && <Badge tone="outline" className="ml-2 align-middle">a pedido</Badge>}
          </p>
          <p className="truncate text-xs text-ink-400">
            {etiquetas}
            {etiquetas && lista != null && ' · '}
            {lista != null && <span className="tnum">{money0(Number(lista))}</span>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {activas.map((s) => {
            const fila = filaDe(producto.id, s.id)
            const bajo = fila && fila.stock_minimo !== null && fila.cantidad <= fila.stock_minimo
            return (
              <span
                key={s.id}
                className={cn(
                  'tnum rounded-lg px-2 py-1 text-xs font-medium',
                  bajo ? 'bg-ink-950 text-on-ink' : 'bg-ink-50 text-ink-600',
                )}
                title={`${s.nombre}: ${fila?.cantidad ?? 0}`}
              >
                {s.nombre.slice(0, 3)} {num(fila?.cantidad ?? 0)}
              </span>
            )
          })}
          <span className="tnum w-10 text-right text-sm font-bold text-ink-950">{num(total)}</span>
        </div>
      </li>
    )
  }

  const sucursal = activas.find((s) => s.id === sel)
  if (!sucursal) return null
  const fila = filaDe(producto.id, sucursal.id)
  const cantidad = fila?.cantidad ?? 0
  const minimo = fila?.stock_minimo ?? null
  const bajo = minimo !== null && cantidad <= minimo
  const claveOcupado = `${producto.id}-${sucursal.id}`
  const trabajando = ocupado === claveOcupado

  return (
    <li className="ct-stagger-fade flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5" style={estilo}>
      <div className="min-w-0 flex-1 basis-52">
        <p className="truncate text-sm font-medium text-ink-900">
          {producto.nombre}
          {producto.a_pedido && <Badge tone="outline" className="ml-2 align-middle">a pedido</Badge>}
        </p>
        <p className="truncate text-xs text-ink-400">
          {etiquetas}
          {etiquetas && lista != null && ' · '}
          {lista != null && <span className="tnum">{money0(Number(lista))}</span>}
          {admin && producto.costo_usd != null && (
            <span className="tnum"> · costo US$ {num(Number(producto.costo_usd))}</span>
          )}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {bajo && (
          <Badge tone={cantidad === 0 ? 'solid' : 'outline'} className="hidden sm:inline-flex">
            {cantidad === 0 ? 'sin stock' : `mín. ${num(minimo!)}`}
          </Badge>
        )}
        <div className="inline-flex items-center rounded-xl border border-line-strong">
          <button
            type="button"
            onClick={() => onDelta(sucursal.id, -1)}
            disabled={trabajando || cantidad <= 0}
            aria-label={`Restar una unidad de ${producto.nombre}`}
            className="grid h-9 w-9 place-items-center rounded-l-xl text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 disabled:opacity-30"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className={cn('tnum w-10 text-center text-sm font-semibold', bajo ? 'text-ink-950' : 'text-ink-900')}>
            {trabajando ? <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" /> : num(cantidad)}
          </span>
          <button
            type="button"
            onClick={() => onDelta(sucursal.id, 1)}
            disabled={trabajando}
            aria-label={`Sumar una unidad de ${producto.nombre}`}
            className="grid h-9 w-9 place-items-center rounded-r-xl text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 disabled:opacity-30"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => onDetalle(sucursal)}
          aria-label={`Detalle de ${producto.nombre}`}
          title="Ajustar, mínimo, transferir y movimientos"
          className="grid h-9 w-9 place-items-center rounded-xl text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
        >
          <Pencil className="h-4 w-4" />
        </button>
      </div>
    </li>
  )
}

const TIPO_LABEL: Record<MovimientoStock['tipo'], string> = {
  ingreso: 'Ingreso',
  egreso: 'Egreso',
  ajuste: 'Ajuste',
  transferencia: 'Transferencia',
}

function DetalleStockModal({
  abierto,
  contexto,
  sucursales,
  admin,
  onCerrar,
  onListo,
}: {
  abierto: boolean
  contexto: { producto: ProductoCatalogo; sucursal: Sucursal } | null
  sucursales: Sucursal[]
  admin: boolean
  onCerrar: () => void
  onListo: (fila: StockRow) => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const producto = contexto?.producto
  const sucursal = contexto?.sucursal

  const { data: stock = [] } = useQuery({
    queryKey: ['inv-stock'],
    queryFn: listarStock,
    enabled: abierto,
  })
  const fila = stock.find((r) => r.producto === producto?.id && r.sucursal === sucursal?.id)

  const [cantidad, setCantidad] = useState('')
  const [minimo, setMinimo] = useState('')
  const [nota, setNota] = useState('')
  const [transferir, setTransferir] = useState('')
  const [destino, setDestino] = useState('')

  useEffect(() => {
    if (!abierto || !contexto) return
    setCantidad(String(fila?.cantidad ?? 0))
    setMinimo(fila?.stock_minimo != null ? String(fila.stock_minimo) : '')
    setNota('')
    setTransferir('')
    const otras = sucursales.filter((s) => s.id !== contexto.sucursal.id)
    setDestino(otras.length === 1 ? String(otras[0].id) : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, contexto?.producto.id, contexto?.sucursal.id])

  const { data: movimientos = [] } = useQuery({
    queryKey: ['inv-movimientos', producto?.id, sucursal?.id],
    queryFn: () => listarMovimientos({ producto: producto!.id, sucursal: sucursal!.id, limite: 5 }),
    enabled: abierto && producto !== undefined && sucursal !== undefined,
  })

  const guardar = useMutation({
    mutationFn: () => {
      const cantidadNum = Number(cantidad)
      if (!Number.isInteger(cantidadNum) || cantidadNum < 0) {
        throw new ApiError(0, 'La cantidad tiene que ser un entero de 0 o más.', null)
      }
      const minimoNum = minimo.trim() === '' ? null : Number(minimo)
      if (minimoNum !== null && (!Number.isInteger(minimoNum) || minimoNum < 0)) {
        throw new ApiError(0, 'El mínimo tiene que ser un entero de 0 o más (o vacío).', null)
      }
      return ajustarStock({
        producto: producto!.id,
        sucursal: sucursal!.id,
        cantidad: cantidadNum,
        stock_minimo: minimoNum,
        nota: nota.trim(),
      })
    },
    onSuccess: ({ stock: nueva }) => {
      onListo(nueva)
      toast.success('Stock actualizado')
      onCerrar()
    },
    onError: (e) =>
      toast.error('No se pudo guardar', e instanceof ApiError ? e.message : undefined),
  })

  const mover = useMutation({
    mutationFn: () => {
      const cuanto = Number(transferir)
      if (!Number.isInteger(cuanto) || cuanto <= 0) {
        throw new ApiError(0, 'Poné cuántas unidades transferir (1 o más).', null)
      }
      if (!destino) throw new ApiError(0, 'Elegí la sucursal de destino.', null)
      return transferirStock({
        producto: producto!.id,
        origen: sucursal!.id,
        destino: Number(destino),
        cantidad: cuanto,
        nota: nota.trim(),
      })
    },
    onSuccess: ({ origen, destino: filaDestino }) => {
      onListo(origen)
      onListo(filaDestino)
      queryClient.invalidateQueries({ queryKey: ['inv-movimientos'] })
      const nombreDestino = sucursales.find((s) => String(s.id) === destino)?.nombre ?? 'destino'
      toast.success('Transferencia hecha', `${transferir} u. → ${nombreDestino}`)
      onCerrar()
    },
    onError: (e) =>
      toast.error('No se pudo transferir', e instanceof ApiError ? e.message : undefined),
  })

  if (!producto || !sucursal) {
    return <Modal open={false} onClose={onCerrar}><span /></Modal>
  }

  const otras = sucursales.filter((s) => s.id !== sucursal.id)

  return (
    <Modal open={abierto} onClose={onCerrar} size="lg" labelledBy="detalle-stock-titulo">
      <div className="border-b border-line px-5 py-4">
        <h2 id="detalle-stock-titulo" className="truncate text-lg font-semibold text-ink-950">
          {producto.nombre}
        </h2>
        <p className="text-xs text-ink-400">
          Stock en <b className="text-ink-700">{sucursal.nombre}</b>
          {producto.efectivo?.lista_ars != null && (
            <span className="tnum"> · lista {money0(Number(producto.efectivo.lista_ars))}</span>
          )}
          {admin && producto.costo_usd != null && (
            <span className="tnum"> · costo US$ {num(Number(producto.costo_usd))}</span>
          )}
        </p>
      </div>

      <div className="max-h-[70vh] space-y-5 overflow-y-auto px-5 py-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoLocal label="Cantidad exacta">
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              aria-label="Cantidad exacta"
            />
          </CampoLocal>
          <CampoLocal label="Stock mínimo (alerta)" hint="Vacío = sin alerta">
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={minimo}
              onChange={(e) => setMinimo(e.target.value)}
              placeholder="Sin alerta"
              aria-label="Stock mínimo"
            />
          </CampoLocal>
          <div className="sm:col-span-2">
            <CampoLocal label="Nota (opcional)" hint="Queda en el historial de movimientos">
              <Input
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder='Ej: "llegó pedido del mayorista"'
                maxLength={200}
              />
            </CampoLocal>
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => guardar.mutate()} disabled={guardar.isPending}>
            {guardar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
          </Button>
        </div>

        {otras.length > 0 && (
          <div className="rounded-2xl border border-line bg-canvas/40 p-4">
            <p className="mb-3 flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-ink-400">
              <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden />
              Transferir a otra sucursal
            </p>
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                value={transferir}
                onChange={(e) => setTransferir(e.target.value)}
                placeholder="Cantidad"
                aria-label="Cantidad a transferir"
                className="sm:w-32"
              />
              <Select
                options={otras.map((s) => ({ value: String(s.id), label: s.nombre }))}
                value={destino}
                onChange={setDestino}
                placeholder="Destino"
                className="flex-1"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => mover.mutate()}
                disabled={mover.isPending}
              >
                {mover.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Transferir'}
              </Button>
            </div>
            <p className="mt-2 text-xs text-ink-400">
              Sale de {sucursal.nombre} y entra en el destino, en una sola operación.
            </p>
          </div>
        )}

        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-ink-400">
            <ClipboardList className="h-3.5 w-3.5" aria-hidden />
            Últimos movimientos acá
          </p>
          {movimientos.length === 0 ? (
            <p className="rounded-xl bg-ink-50 px-3 py-3 text-xs text-ink-400">
              Sin movimientos registrados todavía.
            </p>
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {movimientos.map((m) => (
                <li key={m.id} className="flex items-center gap-2.5 px-3 py-2 text-xs">
                  <span className={cn('tnum w-9 shrink-0 text-right font-bold', m.delta < 0 ? 'text-ink-500' : 'text-ink-950')}>
                    {m.delta > 0 ? `+${num(m.delta)}` : num(m.delta)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-ink-600">
                    {TIPO_LABEL[m.tipo]}
                    {m.nota && <span className="text-ink-400"> — {m.nota}</span>}
                  </span>
                  <span className="shrink-0 text-ink-400">
                    {m.usuario && <span>{m.usuario} · </span>}
                    {tiempoRelativo(m.creado)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  )
}

function CampoLocal({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-ink-500">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-ink-400">{hint}</p>}
    </div>
  )
}

function SucursalesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const { data: sucursales = [] } = useQuery({ queryKey: ['inv-sucursales'], queryFn: listarSucursales })
  const [nueva, setNueva] = useState('')
  const [nombres, setNombres] = useState<Record<number, string>>({})

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ['inv-sucursales'] })

  const crear = useMutation({
    mutationFn: () =>
      crearSucursal({ nombre: nueva.trim(), orden: (sucursales.at(-1)?.orden ?? 0) + 1 }),
    onSuccess: () => {
      invalidar()
      setNueva('')
      toast.success('Sucursal creada')
    },
    onError: (e) => toast.error('No se pudo crear', e instanceof ApiError ? e.message : undefined),
  })
  const renombrar = useMutation({
    mutationFn: ({ id, nombre }: { id: number; nombre: string }) => actualizarSucursal(id, { nombre }),
    onSuccess: () => {
      invalidar()
      toast.success('Sucursal actualizada')
    },
    onError: (e) => toast.error('No se pudo guardar', e instanceof ApiError ? e.message : undefined),
  })
  const borrar = useMutation({
    mutationFn: (id: number) => eliminarSucursal(id),
    onSuccess: () => {
      invalidar()
      queryClient.invalidateQueries({ queryKey: ['inv-stock'] })
      toast.success('Sucursal eliminada')
    },
    onError: (e) => toast.error('No se pudo eliminar', e instanceof ApiError ? e.message : undefined),
  })

  async function handleEliminar(s: { id: number; nombre: string }) {
    const ok = await confirm({
      title: `¿Eliminar la sucursal "${s.nombre}"?`,
      description: 'Su stock deja de mostrarse (queda auditado en el sistema).',
      confirmLabel: 'Eliminar',
      tone: 'danger',
    })
    if (ok) borrar.mutate(s.id)
  }

  return (
    <Modal open={open} onClose={onClose} size="md" labelledBy="sucursales-titulo">
      <div className="border-b border-line px-5 py-4">
        <h2 id="sucursales-titulo" className="text-lg font-semibold text-ink-950">
          Sucursales
        </h2>
        <p className="text-xs text-ink-400">Los locales entre los que se reparte el stock.</p>
      </div>
      <div className="max-h-[65vh] space-y-4 overflow-y-auto px-5 py-5">
        <ul className="space-y-2.5">
          {sucursales.map((s) => (
            <li key={s.id} className="flex items-center gap-2">
              <Input
                value={nombres[s.id] ?? s.nombre}
                onChange={(e) => setNombres((prev) => ({ ...prev, [s.id]: e.target.value }))}
                aria-label={`Nombre de ${s.nombre}`}
              />
              <Button
                variant="secondary"
                size="sm"
                disabled={
                  renombrar.isPending ||
                  (nombres[s.id] ?? s.nombre).trim() === s.nombre ||
                  (nombres[s.id] ?? s.nombre).trim() === ''
                }
                onClick={() => renombrar.mutate({ id: s.id, nombre: (nombres[s.id] ?? s.nombre).trim() })}
              >
                Guardar
              </Button>
              <button
                type="button"
                onClick={() => handleEliminar(s)}
                aria-label={`Eliminar ${s.nombre}`}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2 border-t border-line pt-4">
          <Input
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            placeholder="Nueva sucursal (ej: Norte)"
            aria-label="Nombre de la nueva sucursal"
          />
          <Button size="sm" disabled={crear.isPending || nueva.trim() === ''} onClick={() => crear.mutate()}>
            <Plus className="h-4 w-4" />
            Crear
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function ListadoSkeleton() {
  return (
    <Card className="overflow-hidden">
      <div className="divide-y divide-line">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-4">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3 w-1/4" />
            </div>
            <Skeleton className="h-9 w-28 rounded-xl" />
            <Skeleton className="h-9 w-9 rounded-xl" />
          </div>
        ))}
      </div>
    </Card>
  )
}
