import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronDown, Loader2, Plus, Search, Smartphone, Trash2, X } from 'lucide-react'
import type { ModeloEquipo, TipoServicio } from '@/types'
import {
  actualizarModelo,
  actualizarTipoServicio,
  crearModelo,
  crearTipoServicio,
  eliminarModelo,
  eliminarTipoServicio,
  listarModelos,
  listarTiposServicio,
  type ModeloEquipoInput,
} from '@/services/cotizaciones'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import { AyudaInfo } from '@/components/ui/AyudaInfo'
import { AyudaCotizacionesManager } from '@/components/AyudaContenidos'
import { useToast } from '@/components/ToastProvider'
import { useConfirm } from '@/components/ConfirmProvider'

/**
 * Editor de cotizaciones (solo administradores). Cada modelo se edita como en
 * la planilla: sus capacidades con rango MIN-MAX y el precio de cada service.
 * La pestaña "Tipos de service" administra las secciones (batería, módulo,
 * tapa...): agregar una nueva la habilita en todos los modelos.
 * 100 % responsive vía el Modal base (bottom-sheet en móvil).
 */

const TABS = [
  { value: 'modelos', label: 'Modelos' },
  { value: 'tipos', label: 'Tipos de service' },
] as const

type Tab = (typeof TABS)[number]['value']

/** Número desde un input (admite coma decimal). Null si no es válido. */
function aNumero(texto: string): number | null {
  const limpio = texto.trim().replace(',', '.')
  if (!limpio) return null
  const valor = Number(limpio)
  return Number.isFinite(valor) ? valor : null
}

export function CotizacionesManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('modelos')
  const [busqueda, setBusqueda] = useState('')
  const [creando, setCreando] = useState(false)

  const { data: modelos = [], isLoading: cargandoModelos } = useQuery({
    queryKey: ['cotizaciones-modelos'],
    queryFn: listarModelos,
    enabled: open,
  })
  const { data: tipos = [], isLoading: cargandoTipos } = useQuery({
    queryKey: ['cotizaciones-tipos'],
    queryFn: listarTiposServicio,
    enabled: open,
  })

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ['cotizaciones-modelos'] })
    queryClient.invalidateQueries({ queryKey: ['cotizaciones-tipos'] })
  }

  useEffect(() => {
    if (!open) {
      setCreando(false)
      setBusqueda('')
      setTab('modelos')
    }
  }, [open])

  const ordenados = useMemo(
    () => [...modelos].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre)),
    [modelos],
  )

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return ordenados
    return ordenados.filter((m) => m.nombre_completo.toLowerCase().includes(q))
  }, [ordenados, busqueda])

  const tiposActivos = useMemo(
    () => tipos.filter((t) => t.activo).sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre)),
    [tipos],
  )

  const ordenSiguiente = modelos.reduce((max, m) => Math.max(max, m.orden), -1) + 1
  const cargando = cargandoModelos || cargandoTipos

  return (
    <Modal open={open} onClose={onClose} size="xl">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink-100 text-ink-900">
            <Smartphone className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold leading-tight text-ink-950">Configurar cotizaciones</h2>
            <p className="text-xs text-ink-400">Modelos, rangos de toma y precios de service (USD).</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <AyudaInfo titulo="Cómo cargar cotizaciones">
            <AyudaCotizacionesManager />
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

      {/* Pestañas + buscador */}
      <div className="flex flex-col gap-3 border-b border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="inline-flex w-full rounded-xl border border-line-strong bg-surface p-1 sm:w-auto">
          {TABS.map((t) => {
            const activo = tab === t.value
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setTab(t.value)}
                aria-pressed={activo}
                className={cn(
                  'flex-1 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors sm:flex-initial',
                  activo ? 'bg-ink-950 text-on-ink' : 'text-ink-500 hover:text-ink-900',
                )}
              >
                {t.label}
              </button>
            )
          })}
        </div>
        {tab === 'modelos' && (
          <div className="relative sm:w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar modelo"
              className="h-10 pl-9 text-sm"
            />
          </div>
        )}
      </div>

      <div className="space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
        {cargando ? (
          <>
            <Skeleton className="h-14 w-full rounded-2xl" />
            <Skeleton className="h-14 w-full rounded-2xl" />
            <Skeleton className="h-14 w-full rounded-2xl" />
          </>
        ) : tab === 'modelos' ? (
          <>
            {creando && (
              <div className="rounded-2xl border border-line bg-surface p-4">
                <ModeloForm
                  tipos={tiposActivos}
                  modoCreacion
                  ordenSiguiente={ordenSiguiente}
                  onCancelar={() => setCreando(false)}
                  onListo={() => {
                    setCreando(false)
                    invalidar()
                  }}
                />
              </div>
            )}

            {visibles.map((modelo) => (
              <ModeloColapsable key={modelo.id} modelo={modelo} tipos={tiposActivos} onListo={invalidar} />
            ))}

            {visibles.length === 0 && !creando && (
              <p className="py-8 text-center text-sm text-ink-400">
                {busqueda ? `Sin resultados para «${busqueda.trim()}».` : 'Todavía no hay modelos cargados.'}
              </p>
            )}

            {!creando && (
              <button
                type="button"
                onClick={() => setCreando(true)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong px-4 py-4 text-sm font-medium text-ink-500 transition-colors hover:border-ink-300 hover:bg-ink-50 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
              >
                <Plus className="h-4 w-4" /> Nuevo modelo
              </button>
            )}
          </>
        ) : (
          <TiposEditor tipos={tipos} onListo={invalidar} />
        )}
      </div>
    </Modal>
  )
}

// ===== Modelo colapsable (la lista es larga: 28+ modelos) =====

function ModeloColapsable({
  modelo,
  tipos,
  onListo,
}: {
  modelo: ModeloEquipo
  tipos: TipoServicio[]
  onListo: () => void
}) {
  const [abierto, setAbierto] = useState(false)

  const resumen = [
    modelo.cotizaciones.length === 1 ? '1 capacidad' : `${modelo.cotizaciones.length} capacidades`,
    modelo.servicios.length === 1 ? '1 service' : `${modelo.servicios.length} services`,
  ].join(' · ')

  return (
    <div className="rounded-2xl border border-line bg-surface">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink-900">{modelo.nombre_completo}</p>
          <p className="text-xs text-ink-400">{resumen}</p>
        </div>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-ink-400 transition-transform', abierto && 'rotate-180')}
        />
      </button>
      {abierto && (
        <div className="border-t border-line p-4">
          <ModeloForm modelo={modelo} tipos={tipos} onListo={onListo} />
        </div>
      )}
    </div>
  )
}

// ===== Formulario de un modelo (crear o editar) =====

interface CapacidadDraft {
  /** Clave estable para React: el id real si ya existe, o un negativo si es nueva. */
  key: number
  gb: string
  min: string
  max: string
}

function firmaCapacidades(filas: CapacidadDraft[]): string {
  return filas.map((f) => `${f.gb}|${f.min}|${f.max}`).join(';')
}

function firmaPrecios(tipos: TipoServicio[], precios: Record<number, string>): string {
  return tipos.map((t) => `${t.id}:${(precios[t.id] ?? '').trim()}`).join(';')
}

function ModeloForm({
  modelo,
  tipos,
  modoCreacion = false,
  ordenSiguiente = 0,
  onListo,
  onCancelar,
}: {
  modelo?: ModeloEquipo
  tipos: TipoServicio[]
  modoCreacion?: boolean
  ordenSiguiente?: number
  onListo: () => void
  onCancelar?: () => void
}) {
  const toast = useToast()
  const confirm = useConfirm()
  // Contador de claves para filas nuevas (negativas, no chocan con ids reales).
  const claveRef = useRef(-1)

  const aDrafts = (m?: ModeloEquipo): CapacidadDraft[] =>
    (m?.cotizaciones ?? []).map((c) => ({
      key: c.id,
      gb: String(c.capacidad_gb),
      min: String(Number(c.precio_min)),
      max: String(Number(c.precio_max)),
    }))

  const aPrecios = (m?: ModeloEquipo): Record<number, string> =>
    Object.fromEntries((m?.servicios ?? []).map((s) => [s.tipo, String(Number(s.precio))]))

  const [marca, setMarca] = useState(modelo?.marca ?? 'iPhone')
  const [nombre, setNombre] = useState(modelo?.nombre ?? '')
  const [capacidades, setCapacidades] = useState<CapacidadDraft[]>(() => aDrafts(modelo))
  const [precios, setPrecios] = useState<Record<number, string>>(() => aPrecios(modelo))

  // Si cambia el modelo de origen (tras guardar/invalidar), reseteamos el form.
  useEffect(() => {
    setMarca(modelo?.marca ?? 'iPhone')
    setNombre(modelo?.nombre ?? '')
    setCapacidades(aDrafts(modelo))
    setPrecios(aPrecios(modelo))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelo])

  const sucio =
    modoCreacion ||
    marca.trim() !== (modelo?.marca ?? '') ||
    nombre.trim() !== (modelo?.nombre ?? '') ||
    firmaCapacidades(capacidades) !== firmaCapacidades(aDrafts(modelo)) ||
    firmaPrecios(tipos, precios) !== firmaPrecios(tipos, aPrecios(modelo))

  const guardar = useMutation({
    mutationFn: (input: ModeloEquipoInput) =>
      modelo ? actualizarModelo(modelo.id, input) : crearModelo(input),
    onSuccess: () => {
      toast.success(modelo ? 'Modelo actualizado' : 'Modelo creado')
      onListo()
    },
    onError: (e) => toast.error('No se pudo guardar', e instanceof ApiError ? e.message : undefined),
  })

  const borrar = useMutation({
    mutationFn: () => eliminarModelo(modelo!.id),
    onSuccess: () => {
      toast.success('Modelo eliminado')
      onListo()
    },
    onError: (e) => toast.error('No se pudo eliminar', e instanceof ApiError ? e.message : undefined),
  })

  function actualizarCapacidad(key: number, campo: 'gb' | 'min' | 'max', valor: string) {
    setCapacidades((prev) => prev.map((f) => (f.key === key ? { ...f, [campo]: valor } : f)))
  }
  function agregarCapacidad() {
    setCapacidades((prev) => [...prev, { key: claveRef.current--, gb: '', min: '', max: '' }])
  }
  function quitarCapacidad(key: number) {
    setCapacidades((prev) => prev.filter((f) => f.key !== key))
  }

  function handleGuardar() {
    const nombreLimpio = nombre.trim()
    if (!nombreLimpio) {
      toast.error('Poné el nombre del modelo (ej: 13 Pro Max)')
      return
    }

    const filas: { capacidad_gb: number; precio_min: number; precio_max: number }[] = []
    for (const fila of capacidades) {
      const gb = Math.trunc(Number(fila.gb.replace(/\D/g, '')) || 0)
      const min = aNumero(fila.min)
      const max = aNumero(fila.max)
      if (gb <= 0) {
        toast.error('Cada capacidad necesita los GB (ej: 128)')
        return
      }
      if (min === null || max === null || min < 0) {
        toast.error(`Completá el mínimo y el máximo de ${gb} GB`)
        return
      }
      if (max < min) {
        toast.error(`En ${gb} GB el máximo no puede ser menor que el mínimo`)
        return
      }
      filas.push({ capacidad_gb: gb, precio_min: min, precio_max: max })
    }
    if (new Set(filas.map((f) => f.capacidad_gb)).size !== filas.length) {
      toast.error('Hay capacidades repetidas')
      return
    }

    const servicios: { tipo: number; precio: number }[] = []
    for (const tipo of tipos) {
      const crudo = (precios[tipo.id] ?? '').trim()
      if (!crudo) continue // vacío = este service no aplica al modelo
      const valor = aNumero(crudo)
      if (valor === null || valor < 0) {
        toast.error(`El precio de "${tipo.nombre}" no es válido`)
        return
      }
      servicios.push({ tipo: tipo.id, precio: valor })
    }

    guardar.mutate({
      marca: marca.trim() || 'iPhone',
      nombre: nombreLimpio,
      ...(modoCreacion ? { orden: ordenSiguiente } : {}),
      cotizaciones: filas,
      servicios,
    })
  }

  async function handleEliminar() {
    const ok = await confirm({
      title: `¿Eliminar ${modelo?.nombre_completo}?`,
      description: 'Se borrarán también sus rangos de toma y precios de service.',
      confirmLabel: 'Eliminar',
      tone: 'danger',
    })
    if (ok) borrar.mutate()
  }

  return (
    <div>
      <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2">
        <Input
          value={marca}
          onChange={(e) => setMarca(e.target.value)}
          placeholder="Marca"
          aria-label="Marca"
          className="h-10 text-sm"
        />
        <Input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Modelo (ej: 13 Pro Max)"
          aria-label="Nombre del modelo"
          className="h-10 font-semibold"
          autoFocus={modoCreacion}
        />
      </div>

      {/* Rangos de toma por capacidad */}
      <div className="mt-3.5">
        <div className="mb-1.5 grid grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,1fr)_2.25rem] items-center gap-2 px-0.5 text-[0.7rem] font-medium uppercase tracking-[0.08em] text-ink-400">
          <span>GB</span>
          <span className="text-center">Mín (USD)</span>
          <span className="text-center">Máx (USD)</span>
          <span />
        </div>

        <div className="space-y-2">
          {capacidades.map((fila) => (
            <div
              key={fila.key}
              className="grid grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,1fr)_2.25rem] items-center gap-2"
            >
              <Input
                value={fila.gb}
                onChange={(e) => actualizarCapacidad(fila.key, 'gb', e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                placeholder="128"
                aria-label="Capacidad en GB"
                className="tnum h-10 px-2 text-center text-sm"
              />
              <Input
                value={fila.min}
                onChange={(e) => actualizarCapacidad(fila.key, 'min', e.target.value)}
                inputMode="decimal"
                placeholder="Mínimo"
                aria-label="Precio mínimo (USD)"
                className="tnum h-10 px-2 text-center text-sm"
              />
              <Input
                value={fila.max}
                onChange={(e) => actualizarCapacidad(fila.key, 'max', e.target.value)}
                inputMode="decimal"
                placeholder="Máximo"
                aria-label="Precio máximo (USD)"
                className="tnum h-10 px-2 text-center text-sm"
              />
              <button
                type="button"
                onClick={() => quitarCapacidad(fila.key)}
                aria-label="Quitar capacidad"
                className="grid h-9 w-9 place-items-center rounded-lg text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={agregarCapacidad}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong px-3 py-2 text-xs font-medium text-ink-500 transition-colors hover:border-ink-300 hover:bg-ink-50 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
        >
          <Plus className="h-3.5 w-3.5" /> Agregar capacidad
        </button>
      </div>

      {/* Precios de service */}
      {tipos.length > 0 && (
        <div className="mt-3.5">
          <p className="mb-1.5 px-0.5 text-[0.7rem] font-medium uppercase tracking-[0.08em] text-ink-400">
            Service (USD) · dejá vacío si no aplica
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {tipos.map((tipo) => (
              <div key={tipo.id} className="flex items-center justify-between gap-2">
                <label htmlFor={`precio-tipo-${tipo.id}`} className="min-w-0 truncate text-sm text-ink-600">
                  {tipo.nombre}
                </label>
                <Input
                  id={`precio-tipo-${tipo.id}`}
                  value={precios[tipo.id] ?? ''}
                  onChange={(e) => setPrecios((prev) => ({ ...prev, [tipo.id]: e.target.value }))}
                  inputMode="decimal"
                  placeholder="—"
                  className="tnum h-10 w-24 shrink-0 px-2 text-center text-sm"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-line pt-3">
        <div>
          {!modoCreacion && modelo && (
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
              'Crear modelo'
            ) : (
              'Guardar'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ===== Tipos de service (batería, módulo, tapa, ...) =====

function TiposEditor({ tipos, onListo }: { tipos: TipoServicio[]; onListo: () => void }) {
  const toast = useToast()
  const [nuevo, setNuevo] = useState('')

  const ordenados = useMemo(
    () => [...tipos].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre)),
    [tipos],
  )
  const ordenSiguiente = tipos.reduce((max, t) => Math.max(max, t.orden), -1) + 1

  const crear = useMutation({
    mutationFn: () => crearTipoServicio({ nombre: nuevo.trim(), orden: ordenSiguiente }),
    onSuccess: () => {
      toast.success('Tipo de service creado', 'Ya podés cargarle precios en cada modelo.')
      setNuevo('')
      onListo()
    },
    onError: (e) => toast.error('No se pudo crear', e instanceof ApiError ? e.message : undefined),
  })

  function handleCrear() {
    if (!nuevo.trim()) {
      toast.error('Escribí el nombre del service (ej: Cambio de cámara)')
      return
    }
    crear.mutate()
  }

  return (
    <div>
      <p className="mb-3 text-xs text-ink-400">
        Cada tipo aparece como una fila de precio en todos los modelos. Eliminarlo oculta sus precios en
        toda la app.
      </p>

      <div className="space-y-2">
        {ordenados.map((tipo) => (
          <TipoFila key={tipo.id} tipo={tipo} onListo={onListo} />
        ))}
        {ordenados.length === 0 && (
          <p className="py-6 text-center text-sm text-ink-400">Todavía no hay tipos de service.</p>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
        <Input
          value={nuevo}
          onChange={(e) => setNuevo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCrear()
          }}
          placeholder="Nuevo tipo (ej: Cambio de cámara)"
          className="h-10 text-sm"
        />
        <Button size="sm" onClick={handleCrear} disabled={crear.isPending}>
          {crear.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Agregar
        </Button>
      </div>
    </div>
  )
}

function TipoFila({ tipo, onListo }: { tipo: TipoServicio; onListo: () => void }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [nombre, setNombre] = useState(tipo.nombre)

  useEffect(() => setNombre(tipo.nombre), [tipo])

  const sucio = nombre.trim() !== tipo.nombre && nombre.trim() !== ''

  const guardar = useMutation({
    mutationFn: () => actualizarTipoServicio(tipo.id, { nombre: nombre.trim() }),
    onSuccess: () => {
      toast.success('Tipo de service actualizado')
      onListo()
    },
    onError: (e) => toast.error('No se pudo guardar', e instanceof ApiError ? e.message : undefined),
  })

  const borrar = useMutation({
    mutationFn: () => eliminarTipoServicio(tipo.id),
    onSuccess: () => {
      toast.success('Tipo de service eliminado')
      onListo()
    },
    onError: (e) => toast.error('No se pudo eliminar', e instanceof ApiError ? e.message : undefined),
  })

  async function handleEliminar() {
    const ok = await confirm({
      title: `¿Eliminar "${tipo.nombre}"?`,
      description: 'Sus precios dejarán de mostrarse en todos los modelos.',
      confirmLabel: 'Eliminar',
      tone: 'danger',
    })
    if (ok) borrar.mutate()
  }

  return (
    <div className="flex items-center gap-2">
      <Input value={nombre} onChange={(e) => setNombre(e.target.value)} className="h-10 text-sm" />
      {sucio && (
        <Button size="sm" onClick={() => guardar.mutate()} disabled={guardar.isPending} aria-label="Guardar nombre">
          {guardar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        </Button>
      )}
      <button
        type="button"
        onClick={handleEliminar}
        disabled={borrar.isPending}
        aria-label={`Eliminar ${tipo.nombre}`}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}
