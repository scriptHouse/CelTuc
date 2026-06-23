import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Lock, Plus, ShieldCheck, Trash2, X } from 'lucide-react'
import type { Permiso, Rol } from '@/types'
import {
  actualizarRol,
  crearRol,
  eliminarRol,
  listarPermisos,
  listarRoles,
  type RolInput,
} from '@/services/roles'
import { useAuth } from '@/store/auth'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ToastProvider'
import { useConfirm } from '@/components/ConfirmProvider'

/**
 * Editor de roles y permisos (solo administradores). Lista los roles, permite
 * crear nuevos y ajustar qué módulos ve cada uno. 100% responsive: el Modal base
 * es bottom-sheet en móvil y tarjeta centrada en escritorio.
 */
export function RolesManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const refrescarUsuario = useAuth((s) => s.refrescarUsuario)
  const [creando, setCreando] = useState(false)

  const { data: roles = [], isLoading: cargandoRoles } = useQuery({
    queryKey: ['roles'],
    queryFn: listarRoles,
    enabled: open,
  })
  const { data: permisos = [], isLoading: cargandoPermisos } = useQuery({
    queryKey: ['permisos'],
    queryFn: listarPermisos,
    enabled: open,
  })

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ['roles'] })
    queryClient.invalidateQueries({ queryKey: ['empleados'] })
    // Si el admin tocó su propio rol, refrescamos su sesión (permisos/sidebar).
    refrescarUsuario()
  }

  useEffect(() => {
    if (!open) setCreando(false)
  }, [open])

  const cargando = cargandoRoles || cargandoPermisos

  return (
    <Modal open={open} onClose={onClose} size="xl">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink-100 text-ink-900">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold leading-tight text-ink-950">Roles y permisos</h2>
            <p className="text-xs text-ink-400">Definí qué módulos puede ver cada rol.</p>
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
        {cargando ? (
          <>
            <Skeleton className="h-40 w-full rounded-2xl" />
            <Skeleton className="h-40 w-full rounded-2xl" />
          </>
        ) : (
          <>
            {creando && (
              <RolCard
                permisos={permisos}
                modoCreacion
                onCancelar={() => setCreando(false)}
                onListo={() => {
                  setCreando(false)
                  invalidar()
                }}
              />
            )}

            {roles.map((rol) => (
              <RolCard key={rol.id} rol={rol} permisos={permisos} onListo={invalidar} />
            ))}

            {!creando && (
              <button
                type="button"
                onClick={() => setCreando(true)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong px-4 py-4 text-sm font-medium text-ink-500 transition-colors hover:border-ink-300 hover:bg-ink-50 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
              >
                <Plus className="h-4 w-4" />
                Nuevo rol
              </button>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}

// ===== Tarjeta de un rol (crear o editar) =====

function RolCard({
  rol,
  permisos,
  modoCreacion = false,
  onListo,
  onCancelar,
}: {
  rol?: Rol
  permisos: Permiso[]
  modoCreacion?: boolean
  onListo: () => void
  onCancelar?: () => void
}) {
  const toast = useToast()
  const confirm = useConfirm()

  const esSistema = Boolean(rol?.es_sistema)
  const esAdminRol = Boolean(rol?.es_admin)

  const [nombre, setNombre] = useState(rol?.nombre ?? '')
  const [descripcion, setDescripcion] = useState(rol?.descripcion ?? '')
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set(rol?.permisos ?? []))

  // Reinicia el estado local si cambia el rol de origen (tras guardar/invalidar).
  useEffect(() => {
    setNombre(rol?.nombre ?? '')
    setDescripcion(rol?.descripcion ?? '')
    setSeleccion(new Set(rol?.permisos ?? []))
  }, [rol])

  const original = useMemo(
    () => ({
      nombre: rol?.nombre ?? '',
      descripcion: rol?.descripcion ?? '',
      permisos: [...(rol?.permisos ?? [])].sort().join(','),
    }),
    [rol],
  )
  const sucio =
    modoCreacion ||
    nombre.trim() !== original.nombre ||
    descripcion.trim() !== original.descripcion ||
    [...seleccion].sort().join(',') !== original.permisos

  const guardar = useMutation({
    mutationFn: (input: RolInput) =>
      rol ? actualizarRol(rol.id, input) : crearRol(input),
    onSuccess: () => {
      toast.success(rol ? 'Rol actualizado' : 'Rol creado')
      onListo()
    },
    onError: (e) => toast.error('No se pudo guardar', e instanceof ApiError ? e.message : undefined),
  })

  const borrar = useMutation({
    mutationFn: () => eliminarRol(rol!.id),
    onSuccess: () => {
      toast.success('Rol eliminado')
      onListo()
    },
    onError: (e) => toast.error('No se pudo eliminar', e instanceof ApiError ? e.message : undefined),
  })

  function toggle(codigo: string) {
    setSeleccion((prev) => {
      const next = new Set(prev)
      if (next.has(codigo)) next.delete(codigo)
      else next.add(codigo)
      return next
    })
  }

  function handleGuardar() {
    if (!nombre.trim()) {
      toast.error('Poné un nombre al rol')
      return
    }
    guardar.mutate({ nombre: nombre.trim(), descripcion: descripcion.trim(), permisos: [...seleccion] })
  }

  async function handleEliminar() {
    const ok = await confirm({
      title: `¿Eliminar el rol ${rol?.nombre}?`,
      description: rol?.cantidad_usuarios
        ? `${rol.cantidad_usuarios} cuenta(s) quedarán sin acceso hasta asignarles otro rol.`
        : 'Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar',
      tone: 'danger',
    })
    if (ok) borrar.mutate()
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {esSistema ? (
            <p className="flex items-center gap-1.5 font-semibold text-ink-900">
              {nombre}
              {esAdminRol && <Lock className="h-3.5 w-3.5 text-ink-400" />}
            </p>
          ) : (
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre del rol"
              className="h-10 font-semibold"
              autoFocus={modoCreacion}
            />
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {esAdminRol && (
            <Badge tone="solid">
              <ShieldCheck className="h-3 w-3" /> Admin
            </Badge>
          )}
          {esSistema && <Badge tone="soft">Sistema</Badge>}
          {typeof rol?.cantidad_usuarios === 'number' && (
            <Badge tone="outline">{rol.cantidad_usuarios} cuenta{rol.cantidad_usuarios === 1 ? '' : 's'}</Badge>
          )}
        </div>
      </div>

      <Input
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
        placeholder="Descripción (opcional)"
        className="mt-2.5 h-10 text-sm"
      />

      {esAdminRol ? (
        <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-ink-50 px-3 py-2.5 text-xs text-ink-500">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
          Acceso total a todos los módulos. No se configura.
        </p>
      ) : (
        <div className="mt-3">
          <p className="mb-2 text-xs font-medium text-ink-500">Módulos visibles</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {permisos.map((permiso) => {
              const activo = seleccion.has(permiso.codigo)
              return (
                <label
                  key={permiso.codigo}
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition-colors',
                    activo
                      ? 'border-ink-900 bg-ink-50 text-ink-900'
                      : 'border-line text-ink-500 hover:border-ink-200 hover:bg-ink-50/50',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={activo}
                    onChange={() => toggle(permiso.codigo)}
                    className="h-4 w-4 shrink-0 rounded border-line-strong accent-ink-950"
                  />
                  <span className="min-w-0 truncate font-medium">{permiso.nombre}</span>
                </label>
              )
            })}
          </div>
        </div>
      )}

      <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-line pt-3">
        <div>
          {!esSistema && rol && (
            <Button variant="ghost" size="sm" onClick={handleEliminar} disabled={borrar.isPending}>
              <Trash2 className="h-4 w-4" />
              Eliminar
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
                <Loader2 className="h-4 w-4 animate-spin" />
                Guardando…
              </>
            ) : modoCreacion ? (
              'Crear rol'
            ) : (
              'Guardar'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
