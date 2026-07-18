import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Loader2, MapPin, Plus, Trash2, X } from 'lucide-react'
import type { Sucursal } from '@/types'
import {
  actualizarSucursal,
  crearSucursal,
  eliminarSucursal,
  type SucursalInput,
  listarSucursales,
} from '@/services/sucursales'
import { ApiError } from '@/lib/api'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ToastProvider'
import { useConfirm } from '@/components/ConfirmProvider'

/**
 * Gestor de sucursales (locales del negocio): nombre, código postal y estado.
 * Solo administradores. Mismas piezas y estética que RolesManager: el Modal base
 * es bottom-sheet en móvil y tarjeta centrada en escritorio (100% responsive).
 */
export function SucursalesManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [creando, setCreando] = useState(false)

  const { data: sucursales = [], isLoading } = useQuery({
    queryKey: ['sucursales'],
    queryFn: listarSucursales,
    enabled: open,
  })

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ['sucursales'] })
    // Las tarjetas de empleados muestran el nombre de la sucursal.
    queryClient.invalidateQueries({ queryKey: ['empleados'] })
  }

  useEffect(() => {
    if (!open) setCreando(false)
  }, [open])

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink-100 text-ink-900">
            <Building2 className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold leading-tight text-ink-950">Sucursales</h2>
            <p className="text-xs text-ink-400">Los locales del negocio y su código postal.</p>
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

      <div className="space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
        {isLoading ? (
          <>
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-24 w-full rounded-2xl" />
          </>
        ) : (
          <>
            {creando && (
              <SucursalCard
                modoCreacion
                onCancelar={() => setCreando(false)}
                onListo={() => {
                  setCreando(false)
                  invalidar()
                }}
              />
            )}

            {sucursales.map((sucursal) => (
              <SucursalCard key={sucursal.id} sucursal={sucursal} onListo={invalidar} />
            ))}

            {!creando && (
              <button
                type="button"
                onClick={() => setCreando(true)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong px-4 py-4 text-sm font-medium text-ink-500 transition-colors hover:border-ink-300 hover:bg-ink-50 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
              >
                <Plus className="h-4 w-4" />
                Nueva sucursal
              </button>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}

// ===== Tarjeta de una sucursal (crear o editar) =====

function SucursalCard({
  sucursal,
  modoCreacion = false,
  onListo,
  onCancelar,
}: {
  sucursal?: Sucursal
  modoCreacion?: boolean
  onListo: () => void
  onCancelar?: () => void
}) {
  const toast = useToast()
  const confirm = useConfirm()

  const [nombre, setNombre] = useState(sucursal?.nombre ?? '')
  const [codigoPostal, setCodigoPostal] = useState(sucursal?.codigo_postal ?? '')
  const [activa, setActiva] = useState(sucursal?.activa ?? true)

  // Reinicia el estado local si cambia la sucursal de origen (tras guardar).
  useEffect(() => {
    setNombre(sucursal?.nombre ?? '')
    setCodigoPostal(sucursal?.codigo_postal ?? '')
    setActiva(sucursal?.activa ?? true)
  }, [sucursal])

  const sucio =
    modoCreacion ||
    nombre.trim() !== (sucursal?.nombre ?? '') ||
    codigoPostal.trim() !== (sucursal?.codigo_postal ?? '') ||
    activa !== (sucursal?.activa ?? true)

  const guardar = useMutation({
    mutationFn: (input: SucursalInput) =>
      sucursal ? actualizarSucursal(sucursal.id, input) : crearSucursal(input),
    onSuccess: () => {
      toast.success(sucursal ? 'Sucursal actualizada' : 'Sucursal creada')
      onListo()
    },
    onError: (e) => toast.error('No se pudo guardar', e instanceof ApiError ? e.message : undefined),
  })

  const borrar = useMutation({
    mutationFn: () => eliminarSucursal(sucursal!.id),
    onSuccess: () => {
      toast.success('Sucursal eliminada')
      onListo()
    },
    onError: (e) => toast.error('No se pudo eliminar', e instanceof ApiError ? e.message : undefined),
  })

  function handleGuardar() {
    if (!nombre.trim()) {
      toast.error('Poné un nombre a la sucursal')
      return
    }
    guardar.mutate({ nombre: nombre.trim(), codigo_postal: codigoPostal.trim(), activa })
  }

  async function handleEliminar() {
    const ok = await confirm({
      title: `¿Eliminar la sucursal ${sucursal?.nombre}?`,
      description: 'Los empleados de esta sucursal quedarán sin sucursal asignada.',
      confirmLabel: 'Eliminar',
      tone: 'danger',
    })
    if (ok) borrar.mutate()
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <label className="mb-1.5 block text-xs font-medium text-ink-500">Nombre</label>
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre de la sucursal"
            className="h-10 font-semibold"
            autoFocus={modoCreacion}
          />
        </div>
        <div className="w-full sm:w-32">
          <label className="mb-1.5 block text-xs font-medium text-ink-500">Código postal</label>
          <div className="relative">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <Input
              value={codigoPostal}
              onChange={(e) => setCodigoPostal(e.target.value)}
              placeholder="4000"
              inputMode="numeric"
              className="h-10 pl-9"
            />
          </div>
        </div>
      </div>

      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <label className="flex cursor-pointer items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={activa}
            onChange={(e) => setActiva(e.target.checked)}
            className="h-4 w-4 rounded border-line-strong accent-ink-950"
          />
          <span className="font-medium text-ink-700">Activa</span>
          <Badge tone={activa ? 'solid' : 'outline'}>{activa ? 'En uso' : 'Inactiva'}</Badge>
        </label>

        <div className="flex items-center gap-2">
          {!modoCreacion && sucursal && (
            <Button variant="ghost" size="sm" onClick={handleEliminar} disabled={borrar.isPending}>
              <Trash2 className="h-4 w-4" />
              Eliminar
            </Button>
          )}
          {modoCreacion && (
            <Button variant="outline" size="sm" onClick={onCancelar}>
              Cancelar
            </Button>
          )}
          <Button size="sm" onClick={handleGuardar} disabled={!sucio || guardar.isPending}>
            {guardar.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Guardando…
              </>
            ) : modoCreacion ? (
              'Crear sucursal'
            ) : (
              'Guardar'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
