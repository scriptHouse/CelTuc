import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Loader2, Plus, Search, Settings2, Trash2, Wrench, X } from 'lucide-react'
import type {
  ConfiguracionPreciosService,
  ItemPrecioService,
  SeccionPreciosService,
  VarianteSeccionService,
} from '@/types'
import {
  actualizarConfiguracion,
  actualizarItem,
  actualizarSeccion,
  crearItem,
  crearSeccion,
  eliminarItem,
  eliminarSeccion,
  listarSecciones,
  obtenerConfiguracion,
  type ItemInput,
  type PrecioInput,
} from '@/services/preciosService'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ToastProvider'
import { useConfirm } from '@/components/ConfirmProvider'

/**
 * Editor de la lista de precios de service (solo administradores).
 *
 * - Parámetros: dólar, descuento cash y redondeo; al guardar se recalcula toda
 *   la lista derivada.
 * - Secciones: nombre, nota, promo propia y variantes (conservan sus precios
 *   al renombrar).
 * - Ítems: los 4 precios por variante. Un campo VACÍO se deriva con la fórmula
 *   (el placeholder muestra cuánto daría); un valor tipeado la pisa.
 * 100 % responsive vía el Modal base (bottom-sheet en móvil).
 */

/** Número desde un input (admite coma decimal). Null si está vacío/inválido. */
function aNumero(texto: string): number | null {
  const limpio = texto.trim().replace(',', '.')
  if (!limpio) return null
  const valor = Number(limpio)
  return Number.isFinite(valor) ? valor : null
}

const aTexto = (valor: number | null | undefined): string =>
  valor === null || valor === undefined ? '' : String(Number(valor))

export function PreciosServiceManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [seccionId, setSeccionId] = useState<number | null>(null)
  const [creandoSeccion, setCreandoSeccion] = useState(false)

  const { data: secciones = [], isLoading } = useQuery({
    queryKey: ['service-secciones'],
    queryFn: listarSecciones,
    enabled: open,
  })
  const { data: config } = useQuery({
    queryKey: ['service-config'],
    queryFn: obtenerConfiguracion,
    enabled: open,
  })

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ['service-secciones'] })
    queryClient.invalidateQueries({ queryKey: ['service-config'] })
  }

  useEffect(() => {
    if (!open) {
      setCreandoSeccion(false)
      setSeccionId(null)
    }
  }, [open])

  const ordenadas = useMemo(
    () => [...secciones].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre)),
    [secciones],
  )
  const seleccionada = ordenadas.find((s) => s.id === seccionId) ?? ordenadas[0]

  return (
    <Modal open={open} onClose={onClose} size="xl">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink-100 text-ink-900">
            <Wrench className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold leading-tight text-ink-950">Configurar service</h2>
            <p className="text-xs text-ink-400">Dólar, secciones, ítems y overrides.</p>
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
        {isLoading || !config ? (
          <>
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-40 w-full rounded-2xl" />
          </>
        ) : (
          <>
            <ConfigEditor config={config} onListo={invalidar} />

            {/* Selector de sección */}
            <div>
              <p className="mb-1.5 px-0.5 text-[0.7rem] font-medium uppercase tracking-[0.08em] text-ink-400">
                Secciones
              </p>
              <div className="-mx-1 overflow-x-auto px-1 pb-1">
                <div className="flex w-max gap-2">
                  {ordenadas.map((seccion) => {
                    const activa = !creandoSeccion && seleccionada?.id === seccion.id
                    return (
                      <button
                        key={seccion.id}
                        type="button"
                        onClick={() => {
                          setSeccionId(seccion.id)
                          setCreandoSeccion(false)
                        }}
                        aria-pressed={activa}
                        className={cn(
                          'whitespace-nowrap rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors',
                          activa
                            ? 'border-ink-950 bg-ink-950 text-on-ink'
                            : 'border-line-strong bg-surface text-ink-600 hover:border-ink-300 hover:bg-ink-50 hover:text-ink-900',
                        )}
                      >
                        {seccion.nombre}
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    onClick={() => setCreandoSeccion(true)}
                    className={cn(
                      'inline-flex items-center gap-1 whitespace-nowrap rounded-xl border border-dashed px-3 py-1.5 text-sm font-medium transition-colors',
                      creandoSeccion
                        ? 'border-ink-950 bg-ink-950 text-on-ink'
                        : 'border-line-strong text-ink-500 hover:border-ink-300 hover:bg-ink-50 hover:text-ink-900',
                    )}
                  >
                    <Plus className="h-3.5 w-3.5" /> Nueva
                  </button>
                </div>
              </div>
            </div>

            {creandoSeccion ? (
              <SeccionForm
                modoCreacion
                ordenSiguiente={ordenadas.reduce((max, s) => Math.max(max, s.orden), -1) + 1}
                onCancelar={() => setCreandoSeccion(false)}
                onListo={(nueva) => {
                  setCreandoSeccion(false)
                  if (nueva) setSeccionId(nueva.id)
                  invalidar()
                }}
              />
            ) : seleccionada ? (
              <SeccionPanel key={seleccionada.id} seccion={seleccionada} onListo={invalidar} />
            ) : (
              <p className="py-8 text-center text-sm text-ink-400">
                Todavía no hay secciones. Creá la primera con «Nueva».
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
  config: ConfiguracionPreciosService
  onListo: () => void
}) {
  const toast = useToast()
  const [dolar, setDolar] = useState(aTexto(config.dolar))
  const [descuento, setDescuento] = useState(aTexto(config.descuento_cash_pct))
  const [redondeo, setRedondeo] = useState(aTexto(config.redondeo_ars))

  useEffect(() => {
    setDolar(aTexto(config.dolar))
    setDescuento(aTexto(config.descuento_cash_pct))
    setRedondeo(aTexto(config.redondeo_ars))
  }, [config])

  const sucio =
    dolar !== aTexto(config.dolar) ||
    descuento !== aTexto(config.descuento_cash_pct) ||
    redondeo !== aTexto(config.redondeo_ars)

  const guardar = useMutation({
    mutationFn: () => {
      const valores = {
        dolar: aNumero(dolar),
        descuento_cash_pct: aNumero(descuento),
        redondeo_ars: aNumero(redondeo),
      }
      if (valores.dolar === null || valores.dolar <= 0) throw new ApiError(0, 'Poné un dólar válido.', null)
      if (valores.descuento_cash_pct === null || valores.descuento_cash_pct < 0 || valores.descuento_cash_pct > 100) {
        throw new ApiError(0, 'El descuento tiene que estar entre 0 y 100.', null)
      }
      if (valores.redondeo_ars === null || valores.redondeo_ars < 1) {
        throw new ApiError(0, 'Poné un redondeo válido (ej: 1000).', null)
      }
      return actualizarConfiguracion({
        dolar: valores.dolar,
        descuento_cash_pct: valores.descuento_cash_pct,
        redondeo_ars: Math.trunc(valores.redondeo_ars),
      })
    },
    onSuccess: () => {
      toast.success('Parámetros guardados', 'Toda la lista derivada quedó recalculada.')
      onListo()
    },
    onError: (e) => toast.error('No se pudo guardar', e instanceof ApiError ? e.message : undefined),
  })

  return (
    <div className="rounded-2xl border border-line bg-canvas/40 p-4">
      <p className="mb-2.5 flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-400">
        <Settings2 className="h-3.5 w-3.5" /> Parámetros de la lista
      </p>
      <div className="grid grid-cols-3 gap-2">
        <CampoNumero etiqueta="Dólar service" valor={dolar} onChange={setDolar} prefijo="$" />
        <CampoNumero etiqueta="Desc. cash" valor={descuento} onChange={setDescuento} sufijo="%" />
        <CampoNumero etiqueta="Redondeo $" valor={redondeo} onChange={setRedondeo} />
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-3">
        <p className="text-xs leading-relaxed text-ink-400">
          Los precios sin override se recalculan solos al guardar.
        </p>
        <Button size="sm" onClick={() => guardar.mutate()} disabled={!sucio || guardar.isPending}>
          {guardar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
        </Button>
      </div>
    </div>
  )
}

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

// ===== Panel de una sección: metadatos + ítems =====

function SeccionPanel({
  seccion,
  onListo,
}: {
  seccion: SeccionPreciosService
  onListo: () => void
}) {
  const [editandoMeta, setEditandoMeta] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [creandoItem, setCreandoItem] = useState(false)

  const variantes = useMemo(
    () => [...seccion.variantes].sort((a, b) => a.orden - b.orden || a.id - b.id),
    [seccion.variantes],
  )

  const items = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    const ordenados = [...seccion.items].sort((a, b) => a.orden - b.orden || a.id - b.id)
    if (!q) return ordenados
    return ordenados.filter((i) => `${i.etiqueta} ${i.nota}`.toLowerCase().includes(q))
  }, [seccion.items, busqueda])

  return (
    <div className="space-y-3">
      {/* Metadatos de la sección (colapsable) */}
      <div className="rounded-2xl border border-line bg-surface">
        <button
          type="button"
          onClick={() => setEditandoMeta((v) => !v)}
          aria-expanded={editandoMeta}
          className="flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink-900">{seccion.nombre}</p>
            <p className="text-xs text-ink-400">
              Editar sección · {variantes.length === 1 ? '1 variante' : `${variantes.length} variantes`}
              {seccion.descuento_cash_pct !== null && ` · cash −${Number(seccion.descuento_cash_pct)} %`}
            </p>
          </div>
          <ChevronDown
            className={cn('h-4 w-4 shrink-0 text-ink-400 transition-transform', editandoMeta && 'rotate-180')}
          />
        </button>
        {editandoMeta && (
          <div className="border-t border-line p-4">
            <SeccionForm seccion={seccion} onListo={onListo} />
          </div>
        )}
      </div>

      {/* Ítems */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder={`Buscar en ${seccion.nombre}`}
          className="h-10 pl-9 text-sm"
        />
      </div>

      {creandoItem && (
        <div className="rounded-2xl border border-line bg-surface p-4">
          <ItemForm
            seccion={seccion}
            variantes={variantes}
            modoCreacion
            onCancelar={() => setCreandoItem(false)}
            onListo={() => {
              setCreandoItem(false)
              onListo()
            }}
          />
        </div>
      )}

      {items.map((item) => (
        <ItemColapsable key={item.id} item={item} seccion={seccion} variantes={variantes} onListo={onListo} />
      ))}

      {items.length === 0 && !creandoItem && (
        <p className="py-6 text-center text-sm text-ink-400">
          {busqueda ? `Sin resultados para «${busqueda.trim()}».` : 'Esta sección no tiene ítems.'}
        </p>
      )}

      {!creandoItem && (
        <button
          type="button"
          onClick={() => setCreandoItem(true)}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong px-4 py-3.5 text-sm font-medium text-ink-500 transition-colors hover:border-ink-300 hover:bg-ink-50 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
        >
          <Plus className="h-4 w-4" /> Nuevo ítem
        </button>
      )}
    </div>
  )
}

// ===== Formulario de sección (crear o editar metadatos + variantes) =====

interface VarianteDraft {
  key: number
  id?: number
  nombre: string
}

function SeccionForm({
  seccion,
  modoCreacion = false,
  ordenSiguiente = 0,
  onListo,
  onCancelar,
}: {
  seccion?: SeccionPreciosService
  modoCreacion?: boolean
  ordenSiguiente?: number
  onListo: (nueva?: SeccionPreciosService) => void
  onCancelar?: () => void
}) {
  const toast = useToast()
  const confirm = useConfirm()
  const claveRef = useRef(-1)

  const aDrafts = (s?: SeccionPreciosService): VarianteDraft[] =>
    (s?.variantes ?? []).map((v) => ({ key: v.id, id: v.id, nombre: v.nombre }))

  const [nombre, setNombre] = useState(seccion?.nombre ?? '')
  const [nota, setNota] = useState(seccion?.nota ?? '')
  const [descuento, setDescuento] = useState(aTexto(seccion?.descuento_cash_pct ?? null))
  const [variantes, setVariantes] = useState<VarianteDraft[]>(() =>
    modoCreacion ? [{ key: claveRef.current--, nombre: 'Estándar' }] : aDrafts(seccion),
  )

  useEffect(() => {
    if (!modoCreacion) {
      setNombre(seccion?.nombre ?? '')
      setNota(seccion?.nota ?? '')
      setDescuento(aTexto(seccion?.descuento_cash_pct ?? null))
      setVariantes(aDrafts(seccion))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seccion])

  const firma = (vs: VarianteDraft[]) => vs.map((v) => `${v.id ?? 'n'}|${v.nombre.trim()}`).join(';')
  const sucio =
    modoCreacion ||
    nombre.trim() !== (seccion?.nombre ?? '') ||
    nota.trim() !== (seccion?.nota ?? '') ||
    descuento !== aTexto(seccion?.descuento_cash_pct ?? null) ||
    firma(variantes) !== firma(aDrafts(seccion))

  const guardar = useMutation({
    mutationFn: (input: Parameters<typeof crearSeccion>[0]) =>
      seccion ? actualizarSeccion(seccion.id, input) : crearSeccion(input),
    onSuccess: (data) => {
      toast.success(seccion ? 'Sección actualizada' : 'Sección creada')
      onListo(data)
    },
    onError: (e) => toast.error('No se pudo guardar', e instanceof ApiError ? e.message : undefined),
  })

  const borrar = useMutation({
    mutationFn: () => eliminarSeccion(seccion!.id),
    onSuccess: () => {
      toast.success('Sección eliminada')
      onListo()
    },
    onError: (e) => toast.error('No se pudo eliminar', e instanceof ApiError ? e.message : undefined),
  })

  async function handleGuardar() {
    if (!nombre.trim()) {
      toast.error('Poné el nombre de la sección')
      return
    }
    const limpias = variantes.map((v) => ({ ...v, nombre: v.nombre.trim() }))
    if (limpias.length === 0 || limpias.some((v) => !v.nombre)) {
      toast.error('Cada variante necesita un nombre (y tiene que quedar al menos una)')
      return
    }
    const descuentoValor = descuento.trim() ? aNumero(descuento) : null
    if (descuento.trim() && (descuentoValor === null || descuentoValor < 0 || descuentoValor > 100)) {
      toast.error('El descuento propio tiene que estar entre 0 y 100 (o vacío para usar el global)')
      return
    }

    const eliminadas = (seccion?.variantes ?? []).filter(
      (original) => !limpias.some((v) => v.id === original.id),
    )
    if (eliminadas.length > 0) {
      const ok = await confirm({
        title: `¿Quitar ${eliminadas.length === 1 ? `la variante "${eliminadas[0].nombre}"` : `${eliminadas.length} variantes`}?`,
        description: 'Se borrarán los precios cargados contra esa variante en todos los ítems.',
        confirmLabel: 'Quitar y guardar',
        tone: 'danger',
      })
      if (!ok) return
    }

    guardar.mutate({
      nombre: nombre.trim(),
      nota: nota.trim(),
      descuento_cash_pct: descuentoValor,
      ...(modoCreacion ? { orden: ordenSiguiente } : {}),
      variantes: limpias.map((v, i) => ({ ...(v.id ? { id: v.id } : {}), nombre: v.nombre, orden: i })),
    })
  }

  async function handleEliminar() {
    const ok = await confirm({
      title: `¿Eliminar la sección ${seccion?.nombre}?`,
      description: 'Se dejarán de mostrar todos sus ítems y precios.',
      confirmLabel: 'Eliminar',
      tone: 'danger',
    })
    if (ok) borrar.mutate()
  }

  return (
    <div>
      <Input
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder="Nombre de la sección (ej: Parlantes)"
        className="h-10 font-semibold"
        autoFocus={modoCreacion}
      />
      <textarea
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        placeholder="Nota / condiciones (demoras, aclaraciones…)"
        rows={2}
        className="mt-2.5 w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 transition-[border-color,box-shadow] duration-150 focus:border-ink-900 focus:outline-none focus:ring-2 focus:ring-ink-900/12"
      />
      <div className="mt-2.5 w-40">
        <CampoNumero
          etiqueta="Desc. cash propio"
          valor={descuento}
          onChange={setDescuento}
          sufijo="%"
          placeholder="global"
        />
      </div>

      <div className="mt-3.5">
        <p className="mb-1.5 px-0.5 text-[0.7rem] font-medium uppercase tracking-[0.08em] text-ink-400">
          Variantes (calidades)
        </p>
        <div className="space-y-2">
          {variantes.map((v) => (
            <div key={v.key} className="flex items-center gap-2">
              <Input
                value={v.nombre}
                onChange={(e) =>
                  setVariantes((prev) =>
                    prev.map((x) => (x.key === v.key ? { ...x, nombre: e.target.value } : x)),
                  )
                }
                placeholder="Nombre de la variante"
                className="h-10 text-sm"
              />
              <button
                type="button"
                onClick={() => setVariantes((prev) => prev.filter((x) => x.key !== v.key))}
                aria-label="Quitar variante"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setVariantes((prev) => [...prev, { key: claveRef.current--, nombre: '' }])}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong px-3 py-2 text-xs font-medium text-ink-500 transition-colors hover:border-ink-300 hover:bg-ink-50 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
        >
          <Plus className="h-3.5 w-3.5" /> Agregar variante
        </button>
      </div>

      <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-line pt-3">
        <div>
          {!modoCreacion && seccion && (
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
              'Crear sección'
            ) : (
              'Guardar'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ===== Ítems =====

function ItemColapsable({
  item,
  seccion,
  variantes,
  onListo,
}: {
  item: ItemPrecioService
  seccion: SeccionPreciosService
  variantes: VarianteSeccionService[]
  onListo: () => void
}) {
  const [abierto, setAbierto] = useState(false)
  const conPrecio = item.precios.length

  return (
    <div className="rounded-2xl border border-line bg-surface">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink-900">{item.etiqueta}</p>
          <p className="truncate text-xs text-ink-400">
            {conPrecio === 0 ? 'Sin precios' : conPrecio === 1 ? '1 variante con precio' : `${conPrecio} variantes con precio`}
            {item.nota && ` · ${item.nota}`}
          </p>
        </div>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-ink-400 transition-transform', abierto && 'rotate-180')}
        />
      </button>
      {abierto && (
        <div className="border-t border-line p-4">
          <ItemForm item={item} seccion={seccion} variantes={variantes} onListo={onListo} />
        </div>
      )}
    </div>
  )
}

/** 4 campos de texto por variante (vacío = derivar con la fórmula). */
type PreciosDraft = Record<number, { lu: string; cu: string; la: string; ca: string }>

function ItemForm({
  item,
  seccion,
  variantes,
  modoCreacion = false,
  onListo,
  onCancelar,
}: {
  item?: ItemPrecioService
  seccion: SeccionPreciosService
  variantes: VarianteSeccionService[]
  modoCreacion?: boolean
  onListo: () => void
  onCancelar?: () => void
}) {
  const toast = useToast()
  const confirm = useConfirm()

  const aDraft = (it?: ItemPrecioService): PreciosDraft => {
    const draft: PreciosDraft = {}
    for (const v of variantes) draft[v.id] = { lu: '', cu: '', la: '', ca: '' }
    for (const p of it?.precios ?? []) {
      draft[p.variante] = {
        lu: aTexto(p.precio_lista_usd),
        cu: aTexto(p.precio_cash_usd),
        la: aTexto(p.precio_lista_ars),
        ca: aTexto(p.precio_cash_ars),
      }
    }
    return draft
  }

  const [etiqueta, setEtiqueta] = useState(item?.etiqueta ?? '')
  const [nota, setNota] = useState(item?.nota ?? '')
  const [precios, setPrecios] = useState<PreciosDraft>(() => aDraft(item))

  useEffect(() => {
    setEtiqueta(item?.etiqueta ?? '')
    setNota(item?.nota ?? '')
    setPrecios(aDraft(item))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, variantes])

  const efectivoPorVariante = useMemo(() => {
    const mapa = new Map<number, ItemPrecioService['precios'][number]['efectivo']>()
    for (const p of item?.precios ?? []) mapa.set(p.variante, p.efectivo)
    return mapa
  }, [item])

  const firma = (d: PreciosDraft) =>
    variantes.map((v) => {
      const f = d[v.id] ?? { lu: '', cu: '', la: '', ca: '' }
      return `${v.id}:${f.lu}|${f.cu}|${f.la}|${f.ca}`
    }).join(';')

  const sucio =
    modoCreacion ||
    etiqueta.trim() !== (item?.etiqueta ?? '') ||
    nota.trim() !== (item?.nota ?? '') ||
    firma(precios) !== firma(aDraft(item))

  const guardar = useMutation({
    mutationFn: (input: Partial<ItemInput>) =>
      item ? actualizarItem(item.id, input) : crearItem(input as ItemInput),
    onSuccess: () => {
      toast.success(item ? 'Ítem actualizado' : 'Ítem creado')
      onListo()
    },
    onError: (e) => toast.error('No se pudo guardar', e instanceof ApiError ? e.message : undefined),
  })

  const borrar = useMutation({
    mutationFn: () => eliminarItem(item!.id),
    onSuccess: () => {
      toast.success('Ítem eliminado')
      onListo()
    },
    onError: (e) => toast.error('No se pudo eliminar', e instanceof ApiError ? e.message : undefined),
  })

  function setCampo(varianteId: number, campo: 'lu' | 'cu' | 'la' | 'ca', valor: string) {
    setPrecios((prev) => ({
      ...prev,
      [varianteId]: { ...(prev[varianteId] ?? { lu: '', cu: '', la: '', ca: '' }), [campo]: valor },
    }))
  }

  function handleGuardar() {
    if (!etiqueta.trim()) {
      toast.error('Poné la etiqueta del ítem (modelo o servicio)')
      return
    }
    const filas: PrecioInput[] = []
    for (const v of variantes) {
      const f = precios[v.id] ?? { lu: '', cu: '', la: '', ca: '' }
      const valores = {
        precio_lista_usd: aNumero(f.lu),
        precio_cash_usd: aNumero(f.cu),
        precio_lista_ars: aNumero(f.la),
        precio_cash_ars: aNumero(f.ca),
      }
      const campos = [f.lu, f.cu, f.la, f.ca]
      const invalido = campos.some((texto, i) => texto.trim() !== '' && Object.values(valores)[i] === null)
      if (invalido) {
        toast.error(`Hay un precio inválido en "${v.nombre}"`)
        return
      }
      if (Object.values(valores).some((x) => x !== null && x < 0)) {
        toast.error(`Los precios de "${v.nombre}" no pueden ser negativos`)
        return
      }
      if (Object.values(valores).some((x) => x !== null)) {
        filas.push({ variante: v.id, ...valores })
      }
    }

    guardar.mutate({
      ...(modoCreacion
        ? {
            seccion: seccion.id,
            orden: seccion.items.reduce((max, i) => Math.max(max, i.orden), -1) + 1,
          }
        : {}),
      etiqueta: etiqueta.trim(),
      nota: nota.trim(),
      precios: filas,
    })
  }

  async function handleEliminar() {
    const ok = await confirm({
      title: `¿Eliminar "${item?.etiqueta}"?`,
      description: 'Se borrarán sus precios de la lista.',
      confirmLabel: 'Eliminar',
      tone: 'danger',
    })
    if (ok) borrar.mutate()
  }

  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Input
          value={etiqueta}
          onChange={(e) => setEtiqueta(e.target.value)}
          placeholder="Etiqueta (ej: 13 PRO, LINEA 12, SOFTWARE IPAD)"
          className="h-10 font-semibold"
          autoFocus={modoCreacion}
        />
        <Input
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Nota de la fila (opcional)"
          className="h-10 text-sm"
        />
      </div>

      <p className="mt-3 px-0.5 text-xs leading-relaxed text-ink-400">
        Campo vacío = se calcula con la fórmula (el placeholder muestra cuánto daría). Un valor
        tipeado la pisa.
      </p>

      <div className="mt-2 space-y-3">
        {variantes.map((variante) => {
          const f = precios[variante.id] ?? { lu: '', cu: '', la: '', ca: '' }
          const efectivo = efectivoPorVariante.get(variante.id)
          return (
            <div key={variante.id} className="rounded-xl bg-canvas/60 p-3 ring-1 ring-line">
              {variantes.length > 1 && (
                <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-ink-500">
                  {variante.nombre}
                </p>
              )}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <CampoNumero
                  etiqueta="Lista USD"
                  valor={f.lu}
                  onChange={(v) => setCampo(variante.id, 'lu', v)}
                  placeholder="—"
                />
                <CampoNumero
                  etiqueta="Cash USD"
                  valor={f.cu}
                  onChange={(v) => setCampo(variante.id, 'cu', v)}
                  placeholder={efectivo?.cash_usd != null ? String(Number(efectivo.cash_usd)) : 'auto'}
                />
                <CampoNumero
                  etiqueta="Lista $"
                  valor={f.la}
                  onChange={(v) => setCampo(variante.id, 'la', v)}
                  placeholder={efectivo?.lista_ars != null ? String(Number(efectivo.lista_ars)) : 'auto'}
                />
                <CampoNumero
                  etiqueta="Cash $"
                  valor={f.ca}
                  onChange={(v) => setCampo(variante.id, 'ca', v)}
                  placeholder={efectivo?.cash_ars != null ? String(Number(efectivo.cash_ars)) : 'auto'}
                />
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-line pt-3">
        <div>
          {!modoCreacion && item && (
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
              'Crear ítem'
            ) : (
              'Guardar'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
