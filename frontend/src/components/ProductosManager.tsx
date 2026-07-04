import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Loader2, Plus, Search, Settings2, ShoppingBag, Trash2, X } from 'lucide-react'
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
import { cn } from '@/lib/utils'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
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
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
        {cargando ? (
          <>
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-40 w-full rounded-2xl" />
          </>
        ) : (
          <>
            <ConfigEditor config={config} onListo={invalidar} />

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
  const [dolar, setDolar] = useState(aTexto(config.dolar))
  const [descuento, setDescuento] = useState(aTexto(config.descuento_cash_pct))
  const [redLista, setRedLista] = useState(aTexto(config.redondeo_lista_ars))
  const [redCash, setRedCash] = useState(aTexto(config.redondeo_cash_ars))

  useEffect(() => {
    setDolar(aTexto(config.dolar))
    setDescuento(aTexto(config.descuento_cash_pct))
    setRedLista(aTexto(config.redondeo_lista_ars))
    setRedCash(aTexto(config.redondeo_cash_ars))
  }, [config])

  const sucio =
    dolar !== aTexto(config.dolar) ||
    descuento !== aTexto(config.descuento_cash_pct) ||
    redLista !== aTexto(config.redondeo_lista_ars) ||
    redCash !== aTexto(config.redondeo_cash_ars)

  const guardar = useMutation({
    mutationFn: () => {
      const valores = {
        dolar: aNumero(dolar),
        descuento_cash_pct: aNumero(descuento),
        redondeo_lista_ars: aNumero(redLista),
        redondeo_cash_ars: aNumero(redCash),
      }
      if (valores.dolar === null || valores.dolar <= 0) throw new ApiError(0, 'Poné un dólar válido.', null)
      if (
        valores.descuento_cash_pct === null ||
        valores.descuento_cash_pct < 0 ||
        valores.descuento_cash_pct > 100
      ) {
        throw new ApiError(0, 'El descuento tiene que estar entre 0 y 100.', null)
      }
      if (!valores.redondeo_lista_ars || !valores.redondeo_cash_ars) {
        throw new ApiError(0, 'Poné redondeos válidos (ej: 100 y 1000).', null)
      }
      return actualizarConfiguracionCatalogo({
        dolar: valores.dolar,
        descuento_cash_pct: valores.descuento_cash_pct,
        redondeo_lista_ars: Math.trunc(valores.redondeo_lista_ars),
        redondeo_cash_ars: Math.trunc(valores.redondeo_cash_ars),
      })
    },
    onSuccess: () => {
      toast.success('Parámetros guardados', 'Productos y Service quedaron recalculados.')
      onListo()
    },
    onError: (e) => toast.error('No se pudo guardar', e instanceof ApiError ? e.message : undefined),
  })

  return (
    <div className="rounded-2xl border border-line bg-canvas/40 p-4">
      <p className="mb-2.5 flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-400">
        <Settings2 className="h-3.5 w-3.5" /> Parámetros del catálogo
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <CampoNumero etiqueta="Dólar del negocio" valor={dolar} onChange={setDolar} prefijo="$" />
        <CampoNumero etiqueta="Desc. cash" valor={descuento} onChange={setDescuento} sufijo="%" />
        <CampoNumero etiqueta="Redondeo lista $" valor={redLista} onChange={setRedLista} />
        <CampoNumero etiqueta="Redondeo cash $" valor={redCash} onChange={setRedCash} />
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-3">
        <p className="text-xs leading-relaxed text-ink-400">
          El dólar es compartido con Service: cambiarlo recalcula las dos listas.
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
  const [creando, setCreando] = useState(false)

  const filas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    const propios = productos
      .filter((p) => p.categoria === categoria.id)
      .sort((a, b) => a.orden - b.orden || a.id - b.id)
    if (!q) return propios
    return propios.filter((p) =>
      `${p.nombre} ${p.marca} ${p.calidad} ${p.nota}`.toLowerCase().includes(q),
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

      {creando && (
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
        <button
          type="button"
          onClick={() => setCreando(true)}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong px-4 py-3.5 text-sm font-medium text-ink-500 transition-colors hover:border-ink-300 hover:bg-ink-50 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
        >
          <Plus className="h-4 w-4" /> Nuevo producto
        </button>
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
  const [descuento, setDescuento] = useState(aTexto(categoria?.descuento_cash_pct ?? null))
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
    descuento !== aTexto(categoria?.descuento_cash_pct ?? null) ||
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
    const descuentoValor = descuento.trim() ? aNumero(descuento) : null
    if (descuento.trim() && (descuentoValor === null || descuentoValor < 0 || descuentoValor > 100)) {
      toast.error('El descuento propio tiene que estar entre 0 y 100 (o vacío)')
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
      descuento_cash_pct: descuentoValor,
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

      <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <CampoNumero etiqueta="Desc. cash propio" valor={descuento} onChange={setDescuento} sufijo="%" placeholder="global" />
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
