import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ListPlus, Loader2, Plus, Search, Settings2, ShoppingBag, Trash2, X } from 'lucide-react'
import type {
  CategoriaCatalogo,
  ConfiguracionCatalogo,
  DispositivoService,
  ProductoCatalogo,
} from '@/types'
import {
  actualizarCategoria,
  actualizarConfiguracionCatalogo,
  actualizarProducto,
  crearCategoria,
  crearProducto,
  eliminarCategoria,
  eliminarProducto,
  listarCategorias,
  listarProductos,
  obtenerConfiguracionCatalogo,
  type CategoriaCatalogoInput,
  type ProductoCatalogoInput,
} from '@/services/productos'
import { listarDispositivos } from '@/services/preciosService'
import { ApiError } from '@/lib/api'
import { cn, coincideBusqueda } from '@/lib/utils'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { AyudaInfo } from '@/components/ui/AyudaInfo'
import { AyudaProductosManager } from '@/components/AyudaContenidos'
import { GestorDolar } from '@/components/GestorDolar'
import { DescuentoCashEditor, type FilaDescuento } from '@/components/DescuentoCashEditor'
import { useToast } from '@/components/ToastProvider'
import { useConfirm } from '@/components/ConfirmProvider'

/**
 * Editor del catálogo de productos (solo administradores).
 * - Parámetros: el dólar es el del NEGOCIO (compartido con Service): editarlo
 *   recalcula las dos listas. Descuento y redondeos son propios del catálogo.
 * - Categorías: jerárquicas (una con "madre" es un subgrupo).
 * - Productos: campo de precio vacío = fórmula (el placeholder muestra cuánto
 *   daría); valor tipeado = override.
 */

function aNumero(texto: string): number | null {
  const limpio = texto.trim().replace(',', '.')
  if (!limpio) return null
  const valor = Number(limpio)
  return Number.isFinite(valor) ? valor : null
}

const aTexto = (valor: number | null | undefined): string =>
  valor === null || valor === undefined ? '' : String(Number(valor))

function CampoNumero({
  etiqueta,
  valor,
  onChange,
  prefijo,
  sufijo,
  placeholder,
  className,
}: {
  etiqueta?: string
  valor: string
  onChange: (v: string) => void
  prefijo?: string
  sufijo?: string
  placeholder?: string
  className?: string
}) {
  return (
    <label className={cn('block min-w-0', className)}>
      {etiqueta && (
        <span className="mb-1 block truncate text-[0.68rem] font-medium uppercase tracking-[0.06em] text-ink-400">
          {etiqueta}
        </span>
      )}
      <div className="relative">
        {prefijo && (
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-ink-400">
            {prefijo}
          </span>
        )}
        <Input
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          inputMode="decimal"
          placeholder={placeholder ?? ''}
          className={cn('tnum h-10 px-2.5 text-sm', prefijo && 'pl-7', sufijo && 'pr-7')}
        />
        {sufijo && (
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-ink-400">
            {sufijo}
          </span>
        )}
      </div>
    </label>
  )
}

function CampoBooleano({
  etiqueta,
  valor,
  onChange,
}: {
  etiqueta: string
  valor: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="inline-flex cursor-pointer select-none items-center gap-2 text-sm text-ink-700">
      <input
        type="checkbox"
        checked={valor}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-line-strong accent-ink-950"
      />
      {etiqueta}
    </label>
  )
}

const etiquetaDe = (c: CategoriaCatalogo, porId: Map<number, CategoriaCatalogo>) =>
  c.padre !== null ? `${porId.get(c.padre)?.nombre ?? '?'} · ${c.nombre}` : c.nombre

export function ProductosManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [categoriaId, setCategoriaId] = useState<number | null>(null)
  const [creandoCategoria, setCreandoCategoria] = useState(false)

  const { data: categorias = [], isLoading: cargandoCategorias } = useQuery({
    queryKey: ['productos-categorias'],
    queryFn: listarCategorias,
    enabled: open,
  })
  const { data: productos = [], isLoading: cargandoProductos } = useQuery({
    queryKey: ['productos-items'],
    queryFn: listarProductos,
    enabled: open,
  })
  const { data: config } = useQuery({
    queryKey: ['productos-config'],
    queryFn: obtenerConfiguracionCatalogo,
    enabled: open,
  })
  const { data: dispositivos = [] } = useQuery({
    queryKey: ['service-dispositivos'],
    queryFn: listarDispositivos,
    enabled: open,
  })

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ['productos-categorias'] })
    queryClient.invalidateQueries({ queryKey: ['productos-items'] })
    queryClient.invalidateQueries({ queryKey: ['productos-config'] })
    // El dólar es compartido: la lista de Service también queda vieja.
    queryClient.invalidateQueries({ queryKey: ['service-secciones'] })
    queryClient.invalidateQueries({ queryKey: ['service-config'] })
  }

  useEffect(() => {
    if (!open) {
      setCategoriaId(null)
      setCreandoCategoria(false)
    }
  }, [open])

  const porId = useMemo(() => new Map(categorias.map((c) => [c.id, c])), [categorias])
  const ordenadas = useMemo(() => {
    const raices = categorias
      .filter((c) => c.padre === null)
      .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre))
    const lista: CategoriaCatalogo[] = []
    for (const raiz of raices) {
      lista.push(raiz)
      lista.push(
        ...categorias
          .filter((c) => c.padre === raiz.id)
          .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre)),
      )
    }
    return lista
  }, [categorias])
  const seleccionada = ordenadas.find((c) => c.id === categoriaId) ?? ordenadas[0]

  // Filas de la tarjeta «Descuento cash»: cada categoría con el % que le aplica
  // hoy (propio, o el de la madre, o el general). Las que no muestran precio
  // cash (Samsung/Apple: lista + cuotas) no participan.
  const filasDescuento = useMemo<FilaDescuento[]>(() => {
    if (!config) return []
    const general = Number(config.descuento_cash_pct)
    return ordenadas
      .filter((c) => c.muestra_cash)
      .map((c) => {
        const madre = c.padre !== null ? porId.get(c.padre) : undefined
        const heredado = madre?.descuento_cash_pct ?? null
        return {
          id: c.id,
          nombre: c.nombre,
          nivel: c.padre !== null ? (1 as const) : (0 as const),
          propio: c.descuento_cash_pct,
          efectivo: Number(c.descuento_cash_pct ?? heredado ?? general),
          origen:
            c.descuento_cash_pct !== null
              ? ''
              : heredado !== null
                ? `como ${madre!.nombre}`
                : 'general',
        }
      })
  }, [ordenadas, porId, config])

  const dispositivosActivos = useMemo(
    () =>
      dispositivos
        .filter((d) => d.activo)
        .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre)),
    [dispositivos],
  )

  const cargando = cargandoCategorias || cargandoProductos || !config

  return (
    <Modal open={open} onClose={onClose} size="xl">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink-100 text-ink-900">
            <ShoppingBag className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold leading-tight text-ink-950">Configurar productos</h2>
            <p className="text-xs text-ink-400">Dólar del negocio, categorías y precios.</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <AyudaInfo titulo="Cómo cargar productos">
            <AyudaProductosManager />
          </AyudaInfo>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
        {cargando ? (
          <>
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-40 w-full rounded-2xl" />
          </>
        ) : (
          <>
            <GestorDolar />
            <ConfigEditor config={config} onListo={invalidar} />
            <DescuentoCashEditor
              general={Number(config.descuento_cash_pct)}
              filas={filasDescuento}
              guardarGeneral={(pct) => actualizarConfiguracionCatalogo({ descuento_cash_pct: pct })}
              guardarFila={(id, pct) => actualizarCategoria(id, { descuento_cash_pct: pct })}
              onListo={invalidar}
            />

            <div>
              <p className="mb-1.5 px-0.5 text-[0.7rem] font-medium uppercase tracking-[0.08em] text-ink-400">
                Categorías (las «madre · hija» son subgrupos)
              </p>
              <div className="-mx-1 overflow-x-auto px-1 pb-1">
                <div className="flex w-max gap-2">
                  {ordenadas.map((c) => {
                    const activa = !creandoCategoria && seleccionada?.id === c.id
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setCategoriaId(c.id)
                          setCreandoCategoria(false)
                        }}
                        aria-pressed={activa}
                        className={cn(
                          'whitespace-nowrap rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors',
                          c.padre !== null && 'text-xs',
                          activa
                            ? 'border-ink-950 bg-ink-950 text-on-ink'
                            : 'border-line-strong bg-surface text-ink-600 hover:border-ink-300 hover:bg-ink-50 hover:text-ink-900',
                        )}
                      >
                        {etiquetaDe(c, porId)}
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    onClick={() => setCreandoCategoria(true)}
                    className={cn(
                      'inline-flex items-center gap-1 whitespace-nowrap rounded-xl border border-dashed px-3 py-1.5 text-sm font-medium transition-colors',
                      creandoCategoria
                        ? 'border-ink-950 bg-ink-950 text-on-ink'
                        : 'border-line-strong text-ink-500 hover:border-ink-300 hover:bg-ink-50 hover:text-ink-900',
                    )}
                  >
                    <Plus className="h-3.5 w-3.5" /> Nueva
                  </button>
                </div>
              </div>
            </div>

            {creandoCategoria ? (
              <CategoriaForm
                categorias={categorias}
                modoCreacion
                ordenSiguiente={categorias.reduce((max, c) => Math.max(max, c.orden), -1) + 1}
                onCancelar={() => setCreandoCategoria(false)}
                onListo={(nueva) => {
                  setCreandoCategoria(false)
                  if (nueva) setCategoriaId(nueva.id)
                  invalidar()
                }}
              />
            ) : seleccionada ? (
              <CategoriaPanel
                key={seleccionada.id}
                categoria={seleccionada}
                categorias={categorias}
                productos={productos}
                dispositivos={dispositivosActivos}
                onListo={invalidar}
              />
            ) : (
              <p className="py-8 text-center text-sm text-ink-400">
                Todavía no hay categorías. Creá la primera con «Nueva».
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}

// ===== Parámetros globales =====

function ConfigEditor({
  config,
  onListo,
}: {
  config: ConfiguracionCatalogo
  onListo: () => void
}) {
  const toast = useToast()
  const [redLista, setRedLista] = useState(aTexto(config.redondeo_lista_ars))
  const [redCash, setRedCash] = useState(aTexto(config.redondeo_cash_ars))

  useEffect(() => {
    setRedLista(aTexto(config.redondeo_lista_ars))
    setRedCash(aTexto(config.redondeo_cash_ars))
  }, [config])

  const sucio =
    redLista !== aTexto(config.redondeo_lista_ars) ||
    redCash !== aTexto(config.redondeo_cash_ars)

  const guardar = useMutation({
    mutationFn: () => {
      const valores = {
        redondeo_lista_ars: aNumero(redLista),
        redondeo_cash_ars: aNumero(redCash),
      }
      if (!valores.redondeo_lista_ars || !valores.redondeo_cash_ars) {
        throw new ApiError(0, 'Poné redondeos válidos (ej: 100 y 1000).', null)
      }
      return actualizarConfiguracionCatalogo({
        redondeo_lista_ars: Math.trunc(valores.redondeo_lista_ars),
        redondeo_cash_ars: Math.trunc(valores.redondeo_cash_ars),
      })
    },
    onSuccess: () => {
      toast.success('Parámetros guardados', 'El catálogo quedó recalculado.')
      onListo()
    },
    onError: (e) => toast.error('No se pudo guardar', e instanceof ApiError ? e.message : undefined),
  })

  return (
    <div className="rounded-2xl border border-line bg-canvas/40 p-4">
      <p className="mb-2.5 flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-400">
        <Settings2 className="h-3.5 w-3.5" /> Parámetros del catálogo
      </p>
      <div className="grid grid-cols-2 gap-2">
        <CampoNumero etiqueta="Redondeo lista $" valor={redLista} onChange={setRedLista} />
        <CampoNumero etiqueta="Redondeo cash $" valor={redCash} onChange={setRedCash} />
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-3">
        <p className="text-xs leading-relaxed text-ink-400">
          El dólar se cambia arriba (compartido con Service); el descuento cash, en su tarjeta.
        </p>
        <Button size="sm" onClick={() => guardar.mutate()} disabled={!sucio || guardar.isPending}>
          {guardar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
        </Button>
      </div>
    </div>
  )
}

// ===== Panel de una categoría =====

function CategoriaPanel({
  categoria,
  categorias,
  productos,
  dispositivos,
  onListo,
}: {
  categoria: CategoriaCatalogo
  categorias: CategoriaCatalogo[]
  productos: ProductoCatalogo[]
  dispositivos: DispositivoService[]
  onListo: () => void
}) {
  const [editandoMeta, setEditandoMeta] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  // Alta de productos: 'uno' abre el formulario completo; 'masiva' la planilla.
  const [creando, setCreando] = useState<false | 'uno' | 'masiva'>(false)

  const filas = useMemo(() => {
    const q = busqueda.trim()
    const propios = productos
      .filter((p) => p.categoria === categoria.id)
      .sort((a, b) => a.orden - b.orden || a.id - b.id)
    if (!q) return propios
    return propios.filter((p) =>
      coincideBusqueda(`${p.nombre} ${p.marca} ${p.calidad} ${p.nota}`, q),
    )
  }, [productos, categoria, busqueda])

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-line bg-surface">
        <button
          type="button"
          onClick={() => setEditandoMeta((v) => !v)}
          aria-expanded={editandoMeta}
          className="flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink-900">{categoria.nombre}</p>
            <p className="truncate text-xs text-ink-400">
              Editar categoría
              {categoria.padre !== null && ' (subgrupo)'}
              {!categoria.muestra_cash && ' · sin cash'}
              {categoria.es_equipo && ' · venta de equipos'}
            </p>
          </div>
          <ChevronDown
            className={cn('h-4 w-4 shrink-0 text-ink-400 transition-transform', editandoMeta && 'rotate-180')}
          />
        </button>
        {editandoMeta && (
          <div className="border-t border-line p-4">
            <CategoriaForm categoria={categoria} categorias={categorias} onListo={onListo} />
          </div>
        )}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder={`Buscar en ${categoria.nombre}`}
          className="h-10 pl-9 text-sm"
        />
      </div>

      {creando === 'uno' && (
        <div className="rounded-2xl border border-line bg-surface p-4">
          <ProductoForm
            categoria={categoria}
            productosDeCategoria={productos.filter((p) => p.categoria === categoria.id)}
            dispositivos={dispositivos}
            modoCreacion
            onCancelar={() => setCreando(false)}
            onListo={() => {
              setCreando(false)
              onListo()
            }}
          />
        </div>
      )}

      {creando === 'masiva' && (
        <div className="rounded-2xl border border-line bg-surface p-4">
          <CargaMasivaProductos
            categoria={categoria}
            productosDeCategoria={productos.filter((p) => p.categoria === categoria.id)}
            onCerrar={() => setCreando(false)}
            onListo={onListo}
          />
        </div>
      )}

      {filas.map((producto) => (
        <ProductoColapsable
          key={producto.id}
          producto={producto}
          categoria={categoria}
          dispositivos={dispositivos}
          onListo={onListo}
        />
      ))}

      {filas.length === 0 && !creando && (
        <p className="py-6 text-center text-sm text-ink-400">
          {busqueda ? `Sin resultados para «${busqueda.trim()}».` : 'Esta categoría no tiene productos.'}
        </p>
      )}

      {!creando && (
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setCreando('uno')}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong px-4 py-3.5 text-sm font-medium text-ink-500 transition-colors hover:border-ink-300 hover:bg-ink-50 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
          >
            <Plus className="h-4 w-4" /> Nuevo producto
          </button>
          <button
            type="button"
            onClick={() => setCreando('masiva')}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong px-4 py-3.5 text-sm font-medium text-ink-500 transition-colors hover:border-ink-300 hover:bg-ink-50 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
          >
            <ListPlus className="h-4 w-4" /> Carga masiva
          </button>
        </div>
      )}
    </div>
  )
}

// ===== Formulario de categoría =====

function CategoriaForm({
  categoria,
  categorias,
  modoCreacion = false,
  ordenSiguiente = 0,
  onListo,
  onCancelar,
}: {
  categoria?: CategoriaCatalogo
  categorias: CategoriaCatalogo[]
  modoCreacion?: boolean
  ordenSiguiente?: number
  onListo: (nueva?: CategoriaCatalogo) => void
  onCancelar?: () => void
}) {
  const toast = useToast()
  const confirm = useConfirm()

  const [nombre, setNombre] = useState(categoria?.nombre ?? '')
  const [nota, setNota] = useState(categoria?.nota ?? '')
  const [padre, setPadre] = useState(categoria?.padre !== null && categoria !== undefined ? String(categoria.padre) : '')
  const [redondeo, setRedondeo] = useState(aTexto(categoria?.redondeo_ars ?? null))
  const [muestraCash, setMuestraCash] = useState(categoria?.muestra_cash ?? true)
  const [tarifa, setTarifa] = useState<'accesorios' | 'equipos'>(categoria?.tarifa_cuotas ?? 'accesorios')
  const [esEquipo, setEsEquipo] = useState(categoria?.es_equipo ?? false)

  const raices = categorias.filter((c) => c.padre === null && c.id !== categoria?.id)

  const sucio =
    modoCreacion ||
    nombre.trim() !== (categoria?.nombre ?? '') ||
    nota.trim() !== (categoria?.nota ?? '') ||
    padre !== (categoria?.padre !== null && categoria !== undefined ? String(categoria.padre) : '') ||
    redondeo !== aTexto(categoria?.redondeo_ars ?? null) ||
    muestraCash !== (categoria?.muestra_cash ?? true) ||
    tarifa !== (categoria?.tarifa_cuotas ?? 'accesorios') ||
    esEquipo !== (categoria?.es_equipo ?? false)

  const guardar = useMutation({
    mutationFn: (input: CategoriaCatalogoInput) =>
      categoria ? actualizarCategoria(categoria.id, input) : crearCategoria(input),
    onSuccess: (data) => {
      toast.success(categoria ? 'Categoría actualizada' : 'Categoría creada')
      onListo(data)
    },
    onError: (e) => toast.error('No se pudo guardar', e instanceof ApiError ? e.message : undefined),
  })

  const borrar = useMutation({
    mutationFn: () => eliminarCategoria(categoria!.id),
    onSuccess: () => {
      toast.success('Categoría eliminada')
      onListo()
    },
    onError: (e) => toast.error('No se pudo eliminar', e instanceof ApiError ? e.message : undefined),
  })

  function handleGuardar() {
    if (!nombre.trim()) {
      toast.error('Poné el nombre de la categoría')
      return
    }
    const redondeoValor = redondeo.trim() ? aNumero(redondeo) : null
    if (redondeo.trim() && (!redondeoValor || redondeoValor < 1)) {
      toast.error('El redondeo propio tiene que ser 1 o más (o vacío)')
      return
    }
    guardar.mutate({
      nombre: nombre.trim(),
      nota: nota.trim(),
      padre: padre ? Number(padre) : null,
      redondeo_ars: redondeoValor ? Math.trunc(redondeoValor) : null,
      muestra_cash: muestraCash,
      tarifa_cuotas: tarifa,
      es_equipo: esEquipo,
      ...(modoCreacion ? { orden: ordenSiguiente } : {}),
    })
  }

  async function handleEliminar() {
    const ok = await confirm({
      title: `¿Eliminar la categoría ${categoria?.nombre}?`,
      description: 'Se dejarán de mostrar todos sus productos (y los de sus subgrupos).',
      confirmLabel: 'Eliminar',
      tone: 'danger',
    })
    if (ok) borrar.mutate()
  }

  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre (ej: Parlantes)"
          className="h-10 font-semibold"
          autoFocus={modoCreacion}
        />
        <Select
          options={[
            { value: '', label: '— Categoría principal' },
            ...raices.map((r) => ({ value: String(r.id), label: `Subgrupo de ${r.nombre}` })),
          ]}
          value={padre}
          onChange={setPadre}
          placeholder="— Categoría principal"
        />
      </div>
      <textarea
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        placeholder="Nota / garantía (ej: 3 meses de garantía)"
        rows={2}
        className="mt-2.5 w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 transition-[border-color,box-shadow] duration-150 focus:border-ink-900 focus:outline-none focus:ring-2 focus:ring-ink-900/12"
      />

      <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <CampoNumero etiqueta="Redondeo propio $" valor={redondeo} onChange={setRedondeo} placeholder="global" />
        <div className="col-span-2">
          <span className="mb-1 block text-[0.68rem] font-medium uppercase tracking-[0.06em] text-ink-400">
            Cuotas del simulador
          </span>
          <div className="inline-flex w-full rounded-xl border border-line-strong bg-surface p-1">
            {(['accesorios', 'equipos'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTarifa(t)}
                aria-pressed={tarifa === t}
                className={cn(
                  'flex-1 rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors',
                  tarifa === t ? 'bg-ink-950 text-on-ink' : 'text-ink-500 hover:text-ink-900',
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        <CampoBooleano etiqueta="Muestra precio cash" valor={muestraCash} onChange={setMuestraCash} />
        <CampoBooleano etiqueta="Es venta de equipos (Ficha)" valor={esEquipo} onChange={setEsEquipo} />
      </div>

      <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-line pt-3">
        <div>
          {!modoCreacion && categoria && (
            <Button variant="ghost" size="sm" onClick={handleEliminar} disabled={borrar.isPending}>
              <Trash2 className="h-4 w-4" /> Eliminar
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {modoCreacion && (
            <Button variant="outline" size="sm" onClick={onCancelar}>
              Cancelar
            </Button>
          )}
          <Button size="sm" onClick={handleGuardar} disabled={!sucio || guardar.isPending}>
            {guardar.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Guardando…
              </>
            ) : modoCreacion ? (
              'Crear categoría'
            ) : (
              'Guardar'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ===== Productos =====

function ProductoColapsable({
  producto,
  categoria,
  dispositivos,
  onListo,
}: {
  producto: ProductoCatalogo
  categoria: CategoriaCatalogo
  dispositivos: DispositivoService[]
  onListo: () => void
}) {
  const [abierto, setAbierto] = useState(false)

  return (
    <div className="rounded-2xl border border-line bg-surface">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink-900">{producto.nombre}</p>
          <p className="truncate text-xs text-ink-400">
            {[producto.calidad, producto.marca, producto.a_pedido && 'a pedido', producto.nuevo && 'nuevo']
              .filter(Boolean)
              .join(' · ') || 'Sin atributos'}
          </p>
        </div>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-ink-400 transition-transform', abierto && 'rotate-180')} />
      </button>
      {abierto && (
        <div className="border-t border-line p-4">
          <ProductoForm
            producto={producto}
            categoria={categoria}
            productosDeCategoria={[]}
            dispositivos={dispositivos}
            onListo={onListo}
          />
        </div>
      )}
    </div>
  )
}

function ProductoForm({
  producto,
  categoria,
  productosDeCategoria,
  dispositivos,
  modoCreacion = false,
  onListo,
  onCancelar,
}: {
  producto?: ProductoCatalogo
  categoria: CategoriaCatalogo
  productosDeCategoria: ProductoCatalogo[]
  dispositivos: DispositivoService[]
  modoCreacion?: boolean
  onListo: () => void
  onCancelar?: () => void
}) {
  const toast = useToast()
  const confirm = useConfirm()

  const [nombre, setNombre] = useState(producto?.nombre ?? '')
  const [marca, setMarca] = useState(producto?.marca ?? '')
  const [calidad, setCalidad] = useState(producto?.calidad ?? '')
  const [nota, setNota] = useState(producto?.nota ?? '')
  const [aPedido, setAPedido] = useState(producto?.a_pedido ?? false)
  const [nuevo, setNuevo] = useState(producto?.nuevo ?? false)
  const [equipos, setEquipos] = useState<number[]>(producto?.dispositivos ?? [])
  const [lu, setLu] = useState(aTexto(producto?.precio_lista_usd))
  const [cu, setCu] = useState(aTexto(producto?.precio_cash_usd))
  const [la, setLa] = useState(aTexto(producto?.precio_lista_ars))
  const [ca, setCa] = useState(aTexto(producto?.precio_cash_ars))

  useEffect(() => {
    setNombre(producto?.nombre ?? '')
    setMarca(producto?.marca ?? '')
    setCalidad(producto?.calidad ?? '')
    setNota(producto?.nota ?? '')
    setAPedido(producto?.a_pedido ?? false)
    setNuevo(producto?.nuevo ?? false)
    setEquipos(producto?.dispositivos ?? [])
    setLu(aTexto(producto?.precio_lista_usd))
    setCu(aTexto(producto?.precio_cash_usd))
    setLa(aTexto(producto?.precio_lista_ars))
    setCa(aTexto(producto?.precio_cash_ars))
  }, [producto])

  const equipoPorId = useMemo(() => new Map(dispositivos.map((d) => [d.id, d])), [dispositivos])
  const opcionesAgregar = useMemo(() => {
    const porLinea = new Map<string, number>()
    for (const d of dispositivos) {
      if (d.linea) porLinea.set(d.linea, (porLinea.get(d.linea) ?? 0) + 1)
    }
    const lineas = [...new Set(dispositivos.map((d) => d.linea))].filter(
      (l) => l && (porLinea.get(l) ?? 0) > 1,
    )
    return [
      ...lineas.map((l) => ({ value: `linea:${l}`, label: `Línea ${l} (toda)` })),
      ...dispositivos.filter((d) => !equipos.includes(d.id)).map((d) => ({ value: `disp:${d.id}`, label: d.nombre })),
    ]
  }, [dispositivos, equipos])

  function agregarEquipo(valor: string) {
    if (!valor) return
    const [tipo, dato] = valor.split(':')
    if (tipo === 'disp') {
      const id = Number(dato)
      setEquipos((prev) => (prev.includes(id) ? prev : [...prev, id]))
      return
    }
    const ids = dispositivos.filter((d) => d.linea === dato).map((d) => d.id)
    setEquipos((prev) => [...prev, ...ids.filter((id) => !prev.includes(id))])
  }

  const sucio =
    modoCreacion ||
    nombre.trim() !== (producto?.nombre ?? '') ||
    marca.trim() !== (producto?.marca ?? '') ||
    calidad.trim() !== (producto?.calidad ?? '') ||
    nota.trim() !== (producto?.nota ?? '') ||
    aPedido !== (producto?.a_pedido ?? false) ||
    nuevo !== (producto?.nuevo ?? false) ||
    [...equipos].sort((a, b) => a - b).join(',') !==
      [...(producto?.dispositivos ?? [])].sort((a, b) => a - b).join(',') ||
    lu !== aTexto(producto?.precio_lista_usd) ||
    cu !== aTexto(producto?.precio_cash_usd) ||
    la !== aTexto(producto?.precio_lista_ars) ||
    ca !== aTexto(producto?.precio_cash_ars)

  const guardar = useMutation({
    mutationFn: (input: Partial<ProductoCatalogoInput>) =>
      producto ? actualizarProducto(producto.id, input) : crearProducto(input as ProductoCatalogoInput),
    onSuccess: () => {
      toast.success(producto ? 'Producto actualizado' : 'Producto creado')
      onListo()
    },
    onError: (e) => toast.error('No se pudo guardar', e instanceof ApiError ? e.message : undefined),
  })

  const borrar = useMutation({
    mutationFn: () => eliminarProducto(producto!.id),
    onSuccess: () => {
      toast.success('Producto eliminado')
      onListo()
    },
    onError: (e) => toast.error('No se pudo eliminar', e instanceof ApiError ? e.message : undefined),
  })

  function handleGuardar() {
    if (!nombre.trim()) {
      toast.error('Poné el nombre del producto')
      return
    }
    const valores = { lu: aNumero(lu), cu: aNumero(cu), la: aNumero(la), ca: aNumero(ca) }
    const textos = { lu, cu, la, ca }
    for (const clave of ['lu', 'cu', 'la', 'ca'] as const) {
      if (textos[clave].trim() !== '' && (valores[clave] === null || valores[clave]! < 0)) {
        toast.error('Hay un precio inválido')
        return
      }
    }
    guardar.mutate({
      ...(modoCreacion
        ? {
            categoria: categoria.id,
            orden: productosDeCategoria.reduce((max, p) => Math.max(max, p.orden), -1) + 1,
          }
        : {}),
      nombre: nombre.trim(),
      marca: marca.trim(),
      calidad: calidad.trim(),
      nota: nota.trim(),
      a_pedido: aPedido,
      nuevo,
      dispositivos: equipos,
      precio_lista_usd: valores.lu,
      precio_cash_usd: valores.cu,
      precio_lista_ars: valores.la,
      precio_cash_ars: valores.ca,
    })
  }

  async function handleEliminar() {
    const ok = await confirm({
      title: `¿Eliminar "${producto?.nombre}"?`,
      description: 'Se dejará de mostrar en el catálogo.',
      confirmLabel: 'Eliminar',
      tone: 'danger',
    })
    if (ok) borrar.mutate()
  }

  const efectivo = producto?.efectivo

  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre (ej: iPhone 15 128GB)"
          className="h-10 font-semibold"
          autoFocus={modoCreacion}
        />
        <Input
          value={marca}
          onChange={(e) => setMarca(e.target.value)}
          placeholder="Marca (opcional)"
          className="h-10 text-sm"
        />
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <Input
          value={calidad}
          onChange={(e) => setCalidad(e.target.value)}
          placeholder="Calidad (ej: Apple original)"
          className="h-10 text-sm"
        />
        <Input
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Nota (ej: x2 $6.000)"
          className="h-10 text-sm"
        />
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-2">
        <CampoBooleano etiqueta="A pedido (seña previa)" valor={aPedido} onChange={setAPedido} />
        <CampoBooleano etiqueta="Producto nuevo" valor={nuevo} onChange={setNuevo} />
      </div>

      {/* Equipos vinculados (alimenta la Ficha de equipo) */}
      <div className="mt-3">
        <p className="mb-1.5 px-0.5 text-[0.7rem] font-medium uppercase tracking-[0.08em] text-ink-400">
          Equipos vinculados (Ficha de equipo)
        </p>
        {equipos.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {equipos.map((id) => (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded-lg bg-ink-100 py-1 pl-2.5 pr-1 text-xs font-medium text-ink-700"
              >
                {equipoPorId.get(id)?.nombre ?? `#${id}`}
                <button
                  type="button"
                  onClick={() => setEquipos((prev) => prev.filter((x) => x !== id))}
                  aria-label={`Quitar ${equipoPorId.get(id)?.nombre ?? id}`}
                  className="grid h-5 w-5 place-items-center rounded-md text-ink-400 transition-colors hover:bg-ink-200 hover:text-ink-900"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="sm:max-w-[16rem]">
          <Select
            options={opcionesAgregar}
            value=""
            onChange={agregarEquipo}
            searchable
            searchPlaceholder="iPhone 15, línea 13…"
            placeholder="Agregar equipo o línea"
          />
        </div>
      </div>

      <p className="mt-3 px-0.5 text-xs leading-relaxed text-ink-400">
        Precio vacío = se calcula con la fórmula (el placeholder muestra cuánto daría). Un valor
        tipeado la pisa.
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <CampoNumero etiqueta="Lista USD" valor={lu} onChange={setLu} placeholder="—" />
        <CampoNumero
          etiqueta="Cash USD"
          valor={cu}
          onChange={setCu}
          placeholder={efectivo?.cash_usd != null ? String(Number(efectivo.cash_usd)) : 'auto'}
        />
        <CampoNumero
          etiqueta="Lista $"
          valor={la}
          onChange={setLa}
          placeholder={efectivo?.lista_ars != null ? String(Number(efectivo.lista_ars)) : 'auto'}
        />
        <CampoNumero
          etiqueta="Cash $"
          valor={ca}
          onChange={setCa}
          placeholder={efectivo?.cash_ars != null ? String(Number(efectivo.cash_ars)) : 'auto'}
        />
      </div>

      <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-line pt-3">
        <div>
          {!modoCreacion && producto && (
            <Button variant="ghost" size="sm" onClick={handleEliminar} disabled={borrar.isPending}>
              <Trash2 className="h-4 w-4" /> Eliminar
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {modoCreacion && (
            <Button variant="outline" size="sm" onClick={onCancelar}>
              Cancelar
            </Button>
          )}
          <Button size="sm" onClick={handleGuardar} disabled={!sucio || guardar.isPending}>
            {guardar.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Guardando…
              </>
            ) : modoCreacion ? (
              'Crear producto'
            ) : (
              'Guardar'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ===== Carga masiva (planilla): varios productos en una tabla, un solo guardar =====

const MAX_FILAS_MASIVA = 30

interface FilaMasivaProducto {
  key: number
  nombre: string
  marca: string
  calidad: string
  nota: string
  lu: string
  cu: string
  la: string
  ca: string
  /** Mensaje del backend si la fila falló al guardar (queda para reintentar). */
  error?: string
}

type CampoMasivo = 'nombre' | 'marca' | 'calidad' | 'nota' | 'lu' | 'cu' | 'la' | 'ca'

const COLUMNAS_PRECIO: Array<{ campo: Extract<CampoMasivo, 'lu' | 'cu' | 'la' | 'ca'>; etiqueta: string }> = [
  { campo: 'lu', etiqueta: 'Lista USD' },
  { campo: 'cu', etiqueta: 'Cash USD' },
  { campo: 'la', etiqueta: 'Lista $' },
  { campo: 'ca', etiqueta: 'Cash $' },
]

function CargaMasivaProductos({
  categoria,
  productosDeCategoria,
  onCerrar,
  onListo,
}: {
  categoria: CategoriaCatalogo
  productosDeCategoria: ProductoCatalogo[]
  onCerrar: () => void
  onListo: () => void
}) {
  const toast = useToast()
  const confirm = useConfirm()
  const claveRef = useRef(0)

  const filaVacia = (): FilaMasivaProducto => ({
    key: claveRef.current++,
    nombre: '',
    marca: '',
    calidad: '',
    nota: '',
    lu: '',
    cu: '',
    la: '',
    ca: '',
  })

  const [filas, setFilas] = useState<FilaMasivaProducto[]>(() => Array.from({ length: 3 }, filaVacia))
  const [guardando, setGuardando] = useState(false)

  const tieneDatos = (f: FilaMasivaProducto) =>
    Boolean(`${f.nombre}${f.marca}${f.calidad}${f.nota}${f.lu}${f.cu}${f.la}${f.ca}`.trim())
  const conDatos = filas.filter(tieneDatos)

  function setCampo(key: number, campo: CampoMasivo, valor: string) {
    setFilas((prev) => prev.map((f) => (f.key === key ? { ...f, [campo]: valor, error: undefined } : f)))
  }

  async function handleGuardar() {
    if (guardando) return
    // Validación previa de TODAS las filas con datos: no se manda nada a medias.
    for (const fila of conDatos) {
      const n = filas.indexOf(fila) + 1
      if (!fila.nombre.trim()) {
        toast.error(`A la fila ${n} le falta el nombre`)
        return
      }
      for (const { campo, etiqueta } of COLUMNAS_PRECIO) {
        const texto = fila[campo]
        const valor = aNumero(texto)
        if (texto.trim() !== '' && (valor === null || valor < 0)) {
          toast.error(`La fila ${n} tiene un precio inválido en "${etiqueta}"`)
          return
        }
      }
    }

    setGuardando(true)
    const base = productosDeCategoria.reduce((max, p) => Math.max(max, p.orden), -1) + 1
    let creadas = 0
    const restantes: FilaMasivaProducto[] = []
    for (const [i, fila] of conDatos.entries()) {
      try {
        await crearProducto({
          categoria: categoria.id,
          orden: base + i,
          nombre: fila.nombre.trim(),
          marca: fila.marca.trim(),
          calidad: fila.calidad.trim(),
          nota: fila.nota.trim(),
          precio_lista_usd: aNumero(fila.lu),
          precio_cash_usd: aNumero(fila.cu),
          precio_lista_ars: aNumero(fila.la),
          precio_cash_ars: aNumero(fila.ca),
        })
        creadas++
      } catch (e) {
        restantes.push({ ...fila, error: e instanceof ApiError ? e.message : 'No se pudo crear.' })
      }
    }
    setGuardando(false)

    if (creadas > 0) {
      toast.success(
        creadas === 1 ? '1 producto creado' : `${creadas} productos creados`,
        `En ${categoria.nombre}.`,
      )
      onListo()
    }
    if (restantes.length > 0) {
      // Las filas que fallaron quedan en la planilla con su error, para corregir
      // y reintentar sin perder lo tipeado.
      setFilas(restantes)
      toast.error(
        restantes.length === 1
          ? 'Un producto no se pudo crear'
          : `${restantes.length} productos no se pudieron crear`,
        'Quedaron en la planilla con el detalle.',
      )
    } else {
      onCerrar()
    }
  }

  async function handleCancelar() {
    if (conDatos.length > 0) {
      const ok = await confirm({
        title: '¿Descartar la carga masiva?',
        description:
          conDatos.length === 1
            ? 'Hay 1 fila con datos sin guardar.'
            : `Hay ${conDatos.length} filas con datos sin guardar.`,
        confirmLabel: 'Descartar',
        tone: 'warning',
      })
      if (!ok) return
    }
    onCerrar()
  }

  return (
    <div>
      <p className="text-sm font-semibold text-ink-900">Carga masiva en {categoria.nombre}</p>
      <p className="mt-1 text-xs leading-relaxed text-ink-400">
        Un producto por fila; las filas vacías se ignoran. Precio vacío = se calcula con la
        fórmula. Un solo «Guardar» crea todos juntos.
      </p>

      <div className="-mx-4 mt-3 overflow-x-auto px-4 pb-1 sm:-mx-1 sm:px-1">
        <table className="w-full min-w-[58rem] border-separate border-spacing-0">
          <thead>
            <tr className="text-left text-[0.68rem] font-medium uppercase tracking-[0.06em] text-ink-400">
              <th className="w-7 pb-1.5 pr-2 font-medium">#</th>
              <th className="min-w-[11rem] pb-1.5 pr-1.5 font-medium">Nombre</th>
              <th className="min-w-[6.5rem] pb-1.5 pr-1.5 font-medium">Marca</th>
              <th className="min-w-[6.5rem] pb-1.5 pr-1.5 font-medium">Calidad</th>
              <th className="min-w-[8rem] pb-1.5 pr-1.5 font-medium">Nota</th>
              {COLUMNAS_PRECIO.map((c) => (
                <th key={c.campo} className="w-[5.5rem] pb-1.5 pr-1.5 font-medium">
                  {c.etiqueta}
                </th>
              ))}
              <th className="w-9 pb-1.5" />
            </tr>
          </thead>
          <tbody>
            {filas.map((fila, i) => (
              <Fragment key={fila.key}>
                <tr>
                  <td className="tnum pb-1.5 pr-2 text-xs text-ink-400">{i + 1}</td>
                  <td className="pb-1.5 pr-1.5">
                    <Input
                      value={fila.nombre}
                      onChange={(e) => setCampo(fila.key, 'nombre', e.target.value)}
                      placeholder="Fuente 20W"
                      className="h-9 px-2 text-sm font-medium"
                    />
                  </td>
                  <td className="pb-1.5 pr-1.5">
                    <Input
                      value={fila.marca}
                      onChange={(e) => setCampo(fila.key, 'marca', e.target.value)}
                      placeholder="Marca"
                      className="h-9 px-2 text-sm"
                    />
                  </td>
                  <td className="pb-1.5 pr-1.5">
                    <Input
                      value={fila.calidad}
                      onChange={(e) => setCampo(fila.key, 'calidad', e.target.value)}
                      placeholder="Calidad"
                      className="h-9 px-2 text-sm"
                    />
                  </td>
                  <td className="pb-1.5 pr-1.5">
                    <Input
                      value={fila.nota}
                      onChange={(e) => setCampo(fila.key, 'nota', e.target.value)}
                      placeholder="Nota"
                      className="h-9 px-2 text-sm"
                    />
                  </td>
                  {COLUMNAS_PRECIO.map((c) => (
                    <td key={c.campo} className="pb-1.5 pr-1.5">
                      <Input
                        value={fila[c.campo]}
                        onChange={(e) => setCampo(fila.key, c.campo, e.target.value)}
                        inputMode="decimal"
                        placeholder="—"
                        className="tnum h-9 px-2 text-sm"
                      />
                    </td>
                  ))}
                  <td className="pb-1.5">
                    <button
                      type="button"
                      onClick={() => setFilas((prev) => prev.filter((f) => f.key !== fila.key))}
                      disabled={filas.length === 1}
                      aria-label={`Quitar fila ${i + 1}`}
                      className="grid h-9 w-9 place-items-center rounded-lg text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 disabled:pointer-events-none disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
                {fila.error && (
                  <tr>
                    <td />
                    <td colSpan={9} className="pb-2">
                      <p className="rounded-lg bg-ink-100 px-2.5 py-1.5 text-xs font-medium text-ink-900">
                        No se pudo crear: {fila.error}
                      </p>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={() => setFilas((prev) => [...prev, filaVacia()])}
        disabled={filas.length >= MAX_FILAS_MASIVA}
        className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong px-3 py-2 text-xs font-medium text-ink-500 transition-colors hover:border-ink-300 hover:bg-ink-50 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 disabled:pointer-events-none disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" />
        {filas.length >= MAX_FILAS_MASIVA ? `Máximo ${MAX_FILAS_MASIVA} filas por tanda` : 'Agregar fila'}
      </button>

      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <p className="text-xs text-ink-400">
          {conDatos.length === 0
            ? 'Todavía no hay filas con datos.'
            : conDatos.length === 1
              ? '1 fila con datos.'
              : `${conDatos.length} filas con datos.`}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleCancelar} disabled={guardando}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleGuardar} disabled={guardando || conDatos.length === 0}>
            {guardando ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Guardando…
              </>
            ) : conDatos.length > 1 ? (
              `Guardar ${conDatos.length} productos`
            ) : (
              'Guardar producto'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
