import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CreditCard, Loader2, Plus, Trash2, X } from 'lucide-react'
import type { CategoriaTarjeta, PlanCuota, Tarjeta } from '@/types'
import { CATEGORIAS_TARJETA } from '@/types'
import {
  actualizarTarjeta,
  crearTarjeta,
  eliminarTarjeta,
  listarTarjetas,
  type TarjetaInput,
} from '@/services/simulador'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ToastProvider'
import { useConfirm } from '@/components/ConfirmProvider'

/**
 * Editor de tarjetas y sus recargos (solo administradores). Cada tarjeta se edita
 * como una tabla de planes (estilo planilla): agregás, editás o borrás filas y
 * guardás todo junto. 100 % responsive vía el Modal base (bottom-sheet en móvil).
 */
interface PlanDraft {
  /** Clave estable para React: el id real si ya existe, o un negativo si es nuevo. */
  key: number
  etiqueta: string
  cuotas: string
  interes: string
}

function aDraft(plan: PlanCuota): PlanDraft {
  return { key: plan.id, etiqueta: plan.etiqueta, cuotas: String(plan.cuotas), interes: String(plan.interes) }
}

/** Firma de la tabla de planes (ignora la clave) para detectar cambios sin guardar. */
function firma(planes: PlanDraft[]): string {
  return planes.map((p) => `${p.etiqueta.trim()}|${p.cuotas}|${p.interes}`).join(';')
}

export function SimuladorManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [categoria, setCategoria] = useState<CategoriaTarjeta>('accesorios')
  const [creando, setCreando] = useState(false)

  const { data: tarjetas = [], isLoading } = useQuery({
    queryKey: ['tarjetas'],
    queryFn: listarTarjetas,
    enabled: open,
  })

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ['tarjetas'] })

  useEffect(() => {
    if (!open) setCreando(false)
  }, [open])

  const visibles = useMemo(
    () =>
      tarjetas
        .filter((t) => t.categoria === categoria)
        .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre)),
    [tarjetas, categoria],
  )

  const labelCategoria = CATEGORIAS_TARJETA.find((c) => c.value === categoria)?.label.toLowerCase()

  return (
    <Modal open={open} onClose={onClose} size="xl">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink-100 text-ink-900">
            <CreditCard className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold leading-tight text-ink-950">Configurar tarjetas</h2>
            <p className="text-xs text-ink-400">Editá los recargos de cada plan de cuotas.</p>
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

      {/* Selector de categoría */}
      <div className="border-b border-line px-4 py-3 sm:px-5">
        <div className="inline-flex w-full rounded-xl border border-line-strong bg-surface p-1 sm:w-auto">
          {CATEGORIAS_TARJETA.map((c) => {
            const activo = categoria === c.value
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => {
                  setCategoria(c.value)
                  setCreando(false)
                }}
                aria-pressed={activo}
                className={cn(
                  'flex-1 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors sm:flex-initial',
                  activo ? 'bg-ink-950 text-on-ink' : 'text-ink-500 hover:text-ink-900',
                )}
              >
                {c.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
        {isLoading ? (
          <>
            <Skeleton className="h-44 w-full rounded-2xl" />
            <Skeleton className="h-44 w-full rounded-2xl" />
          </>
        ) : (
          <>
            {creando && (
              <TarjetaEditor
                categoria={categoria}
                modoCreacion
                onCancelar={() => setCreando(false)}
                onListo={() => {
                  setCreando(false)
                  invalidar()
                }}
              />
            )}

            {visibles.map((tarjeta) => (
              <TarjetaEditor key={tarjeta.id} tarjeta={tarjeta} categoria={categoria} onListo={invalidar} />
            ))}

            {visibles.length === 0 && !creando && (
              <p className="py-8 text-center text-sm text-ink-400">Todavía no hay tarjetas en {labelCategoria}.</p>
            )}

            {!creando && (
              <button
                type="button"
                onClick={() => setCreando(true)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong px-4 py-4 text-sm font-medium text-ink-500 transition-colors hover:border-ink-300 hover:bg-ink-50 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
              >
                <Plus className="h-4 w-4" /> Nueva tarjeta
              </button>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}

// ===== Tarjeta editable (crear o editar) =====

function TarjetaEditor({
  tarjeta,
  categoria,
  modoCreacion = false,
  onListo,
  onCancelar,
}: {
  tarjeta?: Tarjeta
  categoria: CategoriaTarjeta
  modoCreacion?: boolean
  onListo: () => void
  onCancelar?: () => void
}) {
  const toast = useToast()
  const confirm = useConfirm()
  // Contador de claves para filas nuevas (negativas, no chocan con ids reales).
  const claveRef = useRef(-1)

  const [nombre, setNombre] = useState(tarjeta?.nombre ?? '')
  const [descripcion, setDescripcion] = useState(tarjeta?.descripcion ?? '')
  const [planes, setPlanes] = useState<PlanDraft[]>(() => (tarjeta?.planes ?? []).map(aDraft))

  // Si cambia la tarjeta de origen (tras guardar/invalidar), reseteamos el form.
  useEffect(() => {
    setNombre(tarjeta?.nombre ?? '')
    setDescripcion(tarjeta?.descripcion ?? '')
    setPlanes((tarjeta?.planes ?? []).map(aDraft))
  }, [tarjeta])

  const originalDrafts = useMemo(() => (tarjeta?.planes ?? []).map(aDraft), [tarjeta])
  const sucio =
    modoCreacion ||
    nombre.trim() !== (tarjeta?.nombre ?? '') ||
    descripcion.trim() !== (tarjeta?.descripcion ?? '') ||
    firma(planes) !== firma(originalDrafts)

  const guardar = useMutation({
    mutationFn: (input: TarjetaInput) => (tarjeta ? actualizarTarjeta(tarjeta.id, input) : crearTarjeta(input)),
    onSuccess: () => {
      toast.success(tarjeta ? 'Tarjeta actualizada' : 'Tarjeta creada')
      onListo()
    },
    onError: (e) => toast.error('No se pudo guardar', e instanceof ApiError ? e.message : undefined),
  })

  const borrar = useMutation({
    mutationFn: () => eliminarTarjeta(tarjeta!.id),
    onSuccess: () => {
      toast.success('Tarjeta eliminada')
      onListo()
    },
    onError: (e) => toast.error('No se pudo eliminar', e instanceof ApiError ? e.message : undefined),
  })

  function actualizarPlan(key: number, campo: 'etiqueta' | 'cuotas' | 'interes', valor: string) {
    setPlanes((prev) => prev.map((p) => (p.key === key ? { ...p, [campo]: valor } : p)))
  }
  function agregarPlan() {
    setPlanes((prev) => [...prev, { key: claveRef.current--, etiqueta: '', cuotas: '1', interes: '0' }])
  }
  function quitarPlan(key: number) {
    setPlanes((prev) => prev.filter((p) => p.key !== key))
  }

  function handleGuardar() {
    if (!nombre.trim()) {
      toast.error('Poné un nombre a la tarjeta')
      return
    }
    const limpios = planes.map((p, i) => ({
      etiqueta: p.etiqueta.trim(),
      cuotas: Math.max(1, Math.trunc(Number(p.cuotas)) || 1),
      interes: Math.max(0, Number(String(p.interes).replace(',', '.')) || 0),
      orden: i,
    }))
    if (limpios.some((p) => !p.etiqueta)) {
      toast.error('Cada plan necesita una etiqueta')
      return
    }
    guardar.mutate({ nombre: nombre.trim(), categoria, descripcion: descripcion.trim(), planes: limpios })
  }

  async function handleEliminar() {
    const ok = await confirm({
      title: `¿Eliminar la tarjeta ${tarjeta?.nombre}?`,
      description: 'Se borrarán también sus planes de cuotas. Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar',
      tone: 'danger',
    })
    if (ok) borrar.mutate()
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <Input
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder="Nombre de la tarjeta (ej: No bancarizada)"
        className="h-10 font-semibold"
        autoFocus={modoCreacion}
      />
      <Input
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
        placeholder="Descripción (opcional)"
        className="mt-2.5 h-10 text-sm"
      />

      <div className="mt-3.5">
        <div className="mb-1.5 grid grid-cols-[minmax(0,1fr)_3.5rem_5rem_2.25rem] items-center gap-2 px-0.5 text-[0.7rem] font-medium uppercase tracking-[0.08em] text-ink-400">
          <span>Plan de cuotas</span>
          <span className="text-center">Cuotas</span>
          <span className="text-center">Recargo</span>
          <span />
        </div>

        <div className="space-y-2">
          {planes.map((p) => (
            <div key={p.key} className="grid grid-cols-[minmax(0,1fr)_3.5rem_5rem_2.25rem] items-center gap-2">
              <Input
                value={p.etiqueta}
                onChange={(e) => actualizarPlan(p.key, 'etiqueta', e.target.value)}
                placeholder="12 cuotas"
                className="h-10 text-sm"
              />
              <Input
                value={p.cuotas}
                onChange={(e) => actualizarPlan(p.key, 'cuotas', e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                className="tnum h-10 px-2 text-center text-sm"
              />
              <div className="relative">
                <Input
                  value={p.interes}
                  onChange={(e) => actualizarPlan(p.key, 'interes', e.target.value)}
                  inputMode="decimal"
                  className="tnum h-10 pr-6 text-center text-sm"
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-ink-400">
                  %
                </span>
              </div>
              <button
                type="button"
                onClick={() => quitarPlan(p.key)}
                aria-label="Quitar plan"
                className="grid h-9 w-9 place-items-center rounded-lg text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={agregarPlan}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong px-3 py-2 text-xs font-medium text-ink-500 transition-colors hover:border-ink-300 hover:bg-ink-50 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
        >
          <Plus className="h-3.5 w-3.5" /> Agregar plan
        </button>
      </div>

      <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-line pt-3">
        <div>
          {!modoCreacion && tarjeta && (
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
              'Crear tarjeta'
            ) : (
              'Guardar'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
