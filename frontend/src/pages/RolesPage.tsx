import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  AtSign,
  Briefcase,
  History,
  LayoutGrid,
  Loader2,
  Lock,
  Plus,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import type { Permiso, Rol, UsuarioAdmin } from '@/types'
import {
  actualizarRol,
  crearRol,
  eliminarRol,
  listarPermisos,
  listarRoles,
  type RolInput,
} from '@/services/roles'
import { actualizarUsuario, listarUsuarios } from '@/services/usuarios'
import { useAuth } from '@/store/auth'
import { ApiError } from '@/lib/api'
import { fechaHora } from '@/lib/format'
import { cn, ctStagger } from '@/lib/utils'
import { navItems } from '@/components/navItems'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ToastProvider'
import { useConfirm } from '@/components/ConfirmProvider'

/**
 * Pantalla de roles y permisos (solo administradores). Se llega desde el botón
 * «Roles y permisos» de la pantalla de Usuarios.
 *
 * Maestro-detalle: a la izquierda la lista de roles, a la derecha el editor del
 * rol elegido. Los módulos se muestran como el menú lateral (mismos íconos y
 * mismo orden), así elegir qué ve un rol es literalmente marcar qué ítems del
 * sidebar tendrá. Desde acá también se asigna el rol a varias cuentas.
 *
 * Los administradores y el superadmin no se configuran acá: ven todos los
 * módulos siempre (lo garantiza el backend con `es_administrador`).
 */

/** Ítems del sidebar que habilita cada permiso (un permiso puede abrir varios). */
const itemsPorPermiso = new Map<string, typeof navItems>()
navItems.forEach((item) => {
  if (!item.permiso) return
  const lista = itemsPorPermiso.get(item.permiso) ?? []
  itemsPorPermiso.set(item.permiso, [...lista, item])
})

/** Posición del permiso en el sidebar (para listar los módulos en ese orden). */
const ordenSidebar = new Map<string, number>()
navItems.forEach((item, indice) => {
  if (item.permiso && !ordenSidebar.has(item.permiso)) ordenSidebar.set(item.permiso, indice)
})

export function RolesPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const yo = useAuth((s) => s.usuario)
  const refrescarUsuario = useAuth((s) => s.refrescarUsuario)
  const soySuper = Boolean(yo?.is_superuser)

  const { data: roles = [], isLoading: cargandoRoles, isFetching: refrescandoRoles } = useQuery({
    queryKey: ['roles'],
    queryFn: listarRoles,
  })
  const { data: permisos = [], isLoading: cargandoPermisos } = useQuery({
    queryKey: ['permisos'],
    queryFn: listarPermisos,
  })
  const { data: usuarios = [] } = useQuery({
    queryKey: ['usuarios'],
    queryFn: listarUsuarios,
  })

  // Rol elegido: un id, o 'nuevo' cuando se está creando uno.
  const [seleccion, setSeleccion] = useState<number | 'nuevo' | null>(null)

  // Al cargar (o si el rol elegido desaparece, p. ej. tras eliminarlo), se
  // selecciona el primero. Mientras la lista se refresca no se decide nada:
  // evita pisar la selección de un rol recién creado que todavía no llegó.
  useEffect(() => {
    if (seleccion === 'nuevo' || refrescandoRoles) return
    if (roles.length === 0) return
    if (seleccion === null || !roles.some((r) => r.id === seleccion)) {
      setSeleccion(roles[0].id)
    }
  }, [roles, seleccion, refrescandoRoles])

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ['roles'] })
    queryClient.invalidateQueries({ queryKey: ['usuarios'] })
    queryClient.invalidateQueries({ queryKey: ['empleados'] })
    // Por si el cambio toca la propia sesión (permisos del sidebar).
    refrescarUsuario()
  }

  const permisosOrdenados = useMemo(
    () =>
      [...permisos].sort(
        (a, b) => (ordenSidebar.get(a.codigo) ?? 100 + a.orden) - (ordenSidebar.get(b.codigo) ?? 100 + b.orden),
      ),
    [permisos],
  )

  const rolActual = seleccion === 'nuevo' ? null : roles.find((r) => r.id === seleccion) ?? null
  const cargando = cargandoRoles || cargandoPermisos
  const cuentasConRol = usuarios.filter((u) => u.rol).length

  return (
    <div className="animate-fade-in">
      <PageHeader
        icon={ShieldCheck}
        eyebrow="Accesos"
        title="Roles y permisos"
        subtitle="Creá roles y elegí qué módulos del menú ve cada uno. Después asignáselos a las cuentas: los administradores ven todo, siempre."
        className="ct-rise"
        actions={
          <>
            <Button variant="outline" onClick={() => navigate('/usuarios')}>
              <ArrowLeft className="h-4 w-4" />
              Usuarios
            </Button>
            <Button onClick={() => setSeleccion('nuevo')} disabled={seleccion === 'nuevo'}>
              <Plus className="h-4 w-4" />
              Nuevo rol
            </Button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-3 gap-3">
        <StatCard className="ct-stagger-item" style={ctStagger(0)} label="Roles" value={String(roles.length)} icon={ShieldCheck} />
        <StatCard className="ct-stagger-item" style={ctStagger(1)} label="Cuentas con rol" value={String(cuentasConRol)} icon={Users} />
        <StatCard className="ct-stagger-item" style={ctStagger(2)} label="Módulos" value={String(permisos.length)} icon={LayoutGrid} />
      </div>

      {cargando ? (
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-96 w-full rounded-2xl" />
        </div>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          {/* Lista de roles: pills deslizables en el celular, columna en escritorio. */}
          <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {roles.map((rol) => (
              <RolListItem
                key={rol.id}
                rol={rol}
                activo={seleccion === rol.id}
                onClick={() => setSeleccion(rol.id)}
              />
            ))}
            <button
              type="button"
              onClick={() => setSeleccion('nuevo')}
              className={cn(
                'flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong px-4 py-3 text-sm font-medium transition-colors lg:w-full',
                seleccion === 'nuevo'
                  ? 'border-ink-900 bg-ink-50 text-ink-900'
                  : 'text-ink-500 hover:border-ink-300 hover:bg-ink-50 hover:text-ink-900',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900',
              )}
            >
              <Plus className="h-4 w-4" />
              Nuevo rol
            </button>
          </div>

          {/* Editor del rol elegido (o formulario de creación). */}
          {seleccion === 'nuevo' ? (
            <RolEditor
              key="nuevo"
              permisos={permisosOrdenados}
              usuarios={usuarios}
              soySuper={soySuper}
              miId={yo?.id}
              onListo={(nuevo) => {
                invalidar()
                if (nuevo) setSeleccion(nuevo.id)
              }}
              onCancelar={() => setSeleccion(roles[0]?.id ?? null)}
            />
          ) : rolActual ? (
            <RolEditor
              key={rolActual.id}
              rol={rolActual}
              permisos={permisosOrdenados}
              usuarios={usuarios}
              soySuper={soySuper}
              miId={yo?.id}
              onListo={() => invalidar()}
            />
          ) : roles.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="Sin roles"
              description="Creá el primer rol y elegí qué módulos puede ver."
              action={
                <Button onClick={() => setSeleccion('nuevo')}>
                  <Plus className="h-4 w-4" />
                  Nuevo rol
                </Button>
              }
            />
          ) : (
            // Selección en tránsito (rol recién creado/eliminado): un instante
            // hasta que el efecto de arriba la acomoda.
            <Skeleton className="h-96 w-full rounded-2xl" />
          )}
        </div>
      )}
    </div>
  )
}

// ===== Ítem de la lista de roles =====

function RolListItem({ rol, activo, onClick }: { rol: Rol; activo: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'shrink-0 rounded-2xl border px-4 py-3 text-left transition-colors lg:w-full',
        activo
          ? 'border-ink-900 bg-ink-50'
          : 'border-line bg-surface hover:border-ink-300 hover:bg-ink-50/50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900',
      )}
    >
      <span className="flex items-center gap-1.5">
        <span className={cn('truncate text-sm font-semibold', activo ? 'text-ink-950' : 'text-ink-900')}>
          {rol.nombre}
        </span>
        {rol.es_admin && <Lock className="h-3.5 w-3.5 shrink-0 text-ink-400" />}
      </span>
      <span className="mt-1 flex items-center gap-2 text-xs text-ink-400">
        <span className="tnum whitespace-nowrap">
          {rol.cantidad_usuarios} cuenta{rol.cantidad_usuarios === 1 ? '' : 's'}
        </span>
        <span aria-hidden>·</span>
        <span className="tnum whitespace-nowrap">
          {rol.es_admin ? 'todos los módulos' : `${rol.permisos.length} módulo${rol.permisos.length === 1 ? '' : 's'}`}
        </span>
      </span>
    </button>
  )
}

// ===== Editor de un rol =====

function RolEditor({
  rol,
  permisos,
  usuarios,
  soySuper,
  miId,
  onListo,
  onCancelar,
}: {
  rol?: Rol
  permisos: Permiso[]
  usuarios: UsuarioAdmin[]
  soySuper: boolean
  miId?: number
  /** Tras guardar/eliminar. En una creación recibe el rol nuevo, para seleccionarlo. */
  onListo: (nuevo?: Rol) => void
  onCancelar?: () => void
}) {
  const toast = useToast()
  const confirm = useConfirm()

  const modoCreacion = !rol
  const esSistema = Boolean(rol?.es_sistema)
  const esAdminRol = Boolean(rol?.es_admin)
  // Un admin común no puede tocar roles de administrador (regla del backend).
  const soloLectura = esAdminRol && !soySuper

  const [nombre, setNombre] = useState(rol?.nombre ?? '')
  const [descripcion, setDescripcion] = useState(rol?.descripcion ?? '')
  const [marcados, setMarcados] = useState<Set<string>>(new Set(rol?.permisos ?? []))

  const sucio =
    modoCreacion ||
    nombre.trim() !== (rol?.nombre ?? '') ||
    descripcion.trim() !== (rol?.descripcion ?? '') ||
    [...marcados].sort().join(',') !== [...(rol?.permisos ?? [])].sort().join(',')

  const guardar = useMutation({
    mutationFn: (input: RolInput) => (rol ? actualizarRol(rol.id, input) : crearRol(input)),
    onSuccess: (guardado) => {
      toast.success(rol ? 'Rol actualizado' : 'Rol creado')
      onListo(modoCreacion ? guardado : undefined)
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
    setMarcados((prev) => {
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
    guardar.mutate({ nombre: nombre.trim(), descripcion: descripcion.trim(), permisos: [...marcados] })
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
    <Card className="p-4 sm:p-5">
      {/* Nombre y descripción */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {esSistema ? (
            <p className="flex items-center gap-1.5 text-lg font-semibold text-ink-950">
              {nombre}
              {esAdminRol && <Lock className="h-4 w-4 text-ink-400" />}
            </p>
          ) : (
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre del rol (p. ej. Cajero)"
              className="h-11 font-semibold"
              autoFocus={modoCreacion}
            />
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5 pt-1.5">
          {esAdminRol && (
            <Badge tone="solid">
              <ShieldCheck className="h-3 w-3" /> Admin
            </Badge>
          )}
          {esSistema && <Badge tone="soft">Sistema</Badge>}
        </div>
      </div>

      <Input
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
        placeholder="Descripción (opcional): para qué es este rol"
        className="mt-2.5 h-10 text-sm"
        disabled={soloLectura}
      />

      {/* Módulos, como se ven en el menú lateral */}
      {esAdminRol ? (
        <p className="mt-4 flex items-center gap-2 rounded-xl bg-ink-50 px-3.5 py-3 text-sm text-ink-500">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          Acceso total: este rol ve todos los módulos, siempre. No se configura.
        </p>
      ) : (
        <div className="mt-4">
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-ink-900">Módulos del menú</p>
              <p className="text-xs text-ink-400">
                Marcá qué ítems del menú lateral puede ver este rol.
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <Badge tone="outline" className="tnum">
                {marcados.size} de {permisos.length}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMarcados(new Set(permisos.map((p) => p.codigo)))}
              >
                Todos
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setMarcados(new Set())}>
                Ninguno
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {permisos.map((permiso) => (
              <ModuloToggle
                key={permiso.codigo}
                permiso={permiso}
                activo={marcados.has(permiso.codigo)}
                onToggle={() => toggle(permiso.codigo)}
              />
            ))}
          </div>

          <p className="mt-2.5 text-xs leading-relaxed text-ink-400">
            Documentos lo ven todas las cuentas. Usuarios, Auditoría y Asistencia son solo de
            administradores: ningún rol los habilita.
          </p>
        </div>
      )}

      {/* Cuentas con este rol */}
      {rol && (
        <MiembrosDelRol rol={rol} usuarios={usuarios} soySuper={soySuper} miId={miId} onCambio={onListo} />
      )}

      {/* Rastro de auditoría */}
      {rol && (
        <p className="mt-4 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 border-t border-line pt-3 text-xs text-ink-400">
          <History className="h-3.5 w-3.5" />
          Creado{rol.creado_por ? ` por @${rol.creado_por}` : ''} el {fechaHora(rol.creado)}
          {rol.actualizado_por && (
            <>
              <span aria-hidden>·</span>
              Última edición por @{rol.actualizado_por} el {fechaHora(rol.actualizado)}
            </>
          )}
        </p>
      )}

      {/* Acciones */}
      <div className={cn('mt-4 flex items-center justify-between gap-2 border-t border-line pt-3.5', !rol && 'mt-5')}>
        <div>
          {rol && !esSistema && (!esAdminRol || soySuper) && (
            <Button variant="ghost" size="sm" onClick={handleEliminar} disabled={borrar.isPending}>
              <Trash2 className="h-4 w-4" />
              Eliminar
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {modoCreacion && (
            <Button variant="outline" onClick={onCancelar}>
              Cancelar
            </Button>
          )}
          {!soloLectura && (
            <Button onClick={handleGuardar} disabled={!sucio || guardar.isPending}>
              {guardar.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Guardando…
                </>
              ) : modoCreacion ? (
                'Crear rol'
              ) : (
                'Guardar cambios'
              )}
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}

// ===== Un módulo como tarjeta con interruptor =====

function ModuloToggle({
  permiso,
  activo,
  onToggle,
}: {
  permiso: Permiso
  activo: boolean
  onToggle: () => void
}) {
  // El mismo ícono y nombre que el ítem del sidebar; un permiso puede habilitar
  // más de un ítem (p. ej. Facturación también abre Clientes).
  const items = itemsPorPermiso.get(permiso.codigo) ?? []
  const Icono = items[0]?.icon ?? LayoutGrid
  const etiqueta = items.length ? items.map((it) => it.label).join(' · ') : permiso.nombre

  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      onClick={onToggle}
      className={cn(
        'flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
        activo
          ? 'border-ink-900 bg-ink-50'
          : 'border-line hover:border-ink-200 hover:bg-ink-50/50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900',
      )}
    >
      <span
        className={cn(
          'grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-colors',
          activo ? 'bg-ink-950 text-on-ink' : 'bg-ink-100 text-ink-500',
        )}
      >
        <Icono className="h-[1.1rem] w-[1.1rem]" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-sm font-medium', activo ? 'text-ink-950' : 'text-ink-600')}>
          {etiqueta}
        </span>
        {permiso.descripcion && (
          <span className="block truncate text-xs text-ink-400">{permiso.descripcion}</span>
        )}
      </span>
      {/* Interruptor decorativo: el botón entero es el control. */}
      <span
        aria-hidden
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors',
          activo ? 'border-ink-950 bg-ink-950' : 'border-line-strong bg-ink-100',
        )}
      >
        <span
          className={cn(
            'inline-block h-3.5 w-3.5 rounded-full bg-surface shadow-sm transition-transform',
            activo ? 'translate-x-[1.1rem]' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  )
}

// ===== Cuentas con el rol (asignar / quitar) =====

function MiembrosDelRol({
  rol,
  usuarios,
  soySuper,
  miId,
  onCambio,
}: {
  rol: Rol
  usuarios: UsuarioAdmin[]
  soySuper: boolean
  miId?: number
  onCambio: () => void
}) {
  const toast = useToast()
  const confirm = useConfirm()

  const miembros = usuarios.filter((u) => u.rol?.id === rol.id)

  // ¿Puedo cambiarle el rol a esta cuenta? Ni la propia (lo bloquea el backend),
  // ni superusuarios, ni cuentas de nivel admin si no soy superadmin.
  const puedoGestionar = (u: UsuarioAdmin) =>
    u.id !== miId && !u.is_superuser && (soySuper || !u.es_administrador)

  const candidatos = usuarios.filter((u) => u.rol?.id !== rol.id && puedoGestionar(u))

  const asignar = useMutation({
    mutationFn: (usuarioId: number) => actualizarUsuario(usuarioId, { rol: rol.id }),
    onSuccess: (u) => {
      toast.success(`Rol asignado a @${u.username}`)
      onCambio()
    },
    onError: (e) => toast.error('No se pudo asignar', e instanceof ApiError ? e.message : undefined),
  })

  const quitar = useMutation({
    mutationFn: (usuarioId: number) => actualizarUsuario(usuarioId, { rol: null }),
    onSuccess: (u) => {
      toast.success(`Rol quitado a @${u.username}`)
      onCambio()
    },
    onError: (e) => toast.error('No se pudo quitar', e instanceof ApiError ? e.message : undefined),
  })

  async function handleQuitar(u: UsuarioAdmin) {
    const ok = await confirm({
      title: `¿Quitarle el rol a @${u.username}?`,
      description: 'La cuenta quedará sin acceso a los módulos hasta asignarle otro rol.',
      confirmLabel: 'Quitar rol',
      tone: 'danger',
    })
    if (ok) quitar.mutate(u.id)
  }

  return (
    <div className="mt-4">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink-900">Cuentas con este rol</p>
          <p className="text-xs text-ink-400">
            El mismo rol puede asignarse a todas las cuentas que haga falta.
          </p>
        </div>
        <Badge tone="outline" className="tnum">
          {miembros.length} cuenta{miembros.length === 1 ? '' : 's'}
        </Badge>
      </div>

      {miembros.length > 0 ? (
        <ul className="space-y-1.5">
          {miembros.map((u) => (
            <li
              key={u.id}
              className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-ink-100 text-xs font-bold uppercase text-ink-900">
                {u.username.charAt(0)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 truncate text-sm font-medium text-ink-900">
                  <AtSign className="h-3 w-3 shrink-0 text-ink-400" />
                  <span className="truncate">{u.username}</span>
                  {u.id === miId && <Badge tone="soft">vos</Badge>}
                </span>
                {u.empleado && (
                  <span className="flex items-center gap-1 truncate text-xs text-ink-400">
                    <Briefcase className="h-3 w-3 shrink-0" /> {u.empleado.nombre_completo}
                  </span>
                )}
              </span>
              {puedoGestionar(u) ? (
                <button
                  type="button"
                  onClick={() => handleQuitar(u)}
                  disabled={quitar.isPending}
                  aria-label={`Quitar el rol a ${u.username}`}
                  title="Quitar el rol"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : (
                <Lock className="h-3.5 w-3.5 shrink-0 text-ink-300" aria-label="No podés gestionar esta cuenta" />
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-line-strong px-3.5 py-3 text-sm text-ink-400">
          Ninguna cuenta tiene este rol todavía.
        </p>
      )}

      {candidatos.length > 0 && (
        <div className="mt-2.5 flex items-center gap-2">
          <UserPlus className="h-4 w-4 shrink-0 text-ink-400" />
          <Select
            className="flex-1"
            placeholder={asignar.isPending ? 'Asignando…' : 'Asignar este rol a una cuenta…'}
            searchable
            searchPlaceholder="Buscar cuenta"
            disabled={asignar.isPending}
            value=""
            onChange={(v) => asignar.mutate(Number(v))}
            options={candidatos.map((u) => ({
              value: String(u.id),
              label: `@${u.username} — ${u.rol ? `hoy: ${u.rol.nombre}` : 'sin rol'}`,
            }))}
          />
        </div>
      )}
    </div>
  )
}
