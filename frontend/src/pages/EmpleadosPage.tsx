import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  AtSign,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Mail,
  Pencil,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react'
import type { Empleado, Rol } from '@/types'
import {
  actualizarEmpleado,
  type AccesoInput,
  crearEmpleado,
  definirAcceso,
  type EmpleadoInput,
  eliminarEmpleado,
  listarEmpleados,
  quitarAcceso,
} from '@/services/empleados'
import { listarRoles } from '@/services/roles'
import { useAuth } from '@/store/auth'
import { esAdmin } from '@/lib/permisos'
import { ApiError } from '@/lib/api'
import { fecha } from '@/lib/format'
import { ctStagger } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { RolesManager } from '@/components/RolesManager'
import { useToast } from '@/components/ToastProvider'
import { useConfirm } from '@/components/ConfirmProvider'

const schema = z
  .object({
    nombre: z.string().trim().min(1, 'Requerido'),
    apellido: z.string().trim(),
    tieneAcceso: z.boolean(),
    username: z.string().trim(),
    email: z.string().trim(),
    password: z.string(),
    /** Id del rol como string (lo maneja el Select); '' = sin rol. */
    rolId: z.string(),
  })
  .superRefine((val, ctx) => {
    if (!val.tieneAcceso) return
    if (val.username.length < 3) {
      ctx.addIssue({ path: ['username'], code: z.ZodIssueCode.custom, message: 'Mínimo 3 caracteres' })
    } else if (!/^[a-zA-Z0-9._-]+$/.test(val.username)) {
      ctx.addIssue({ path: ['username'], code: z.ZodIssueCode.custom, message: 'Solo letras, números y . _ -' })
    }
    if (!val.email) {
      ctx.addIssue({ path: ['email'], code: z.ZodIssueCode.custom, message: 'Requerido para el acceso' })
    }
  })
type FormData = z.infer<typeof schema>

function iniciales(e: Empleado): string {
  return `${e.nombre.charAt(0)}${e.apellido.charAt(0)}`.toUpperCase() || 'E'
}

export function EmpleadosPage() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const usuario = useAuth((s) => s.usuario)
  const admin = esAdmin(usuario)

  const { data: empleados = [], isLoading } = useQuery({
    queryKey: ['empleados'],
    queryFn: listarEmpleados,
  })

  // Los roles sólo los necesita (y puede leer) un administrador, para el selector
  // del formulario y el editor de roles.
  const { data: roles = [] } = useQuery({
    queryKey: ['roles'],
    queryFn: listarRoles,
    enabled: admin,
  })

  const [modalOpen, setModalOpen] = useState(false)
  const [rolesOpen, setRolesOpen] = useState(false)
  const [editando, setEditando] = useState<Empleado | null>(null)

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ['empleados'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const stats = useMemo(() => {
    const conAcceso = empleados.filter((e) => e.puede_loguear).length
    return { total: empleados.length, conAcceso }
  }, [empleados])

  const guardar = useMutation({
    mutationFn: async (p: {
      id?: number
      input: EmpleadoInput
      acceso: AccesoInput | null
      yaTeniaAcceso: boolean
    }) => {
      let emp = p.id ? await actualizarEmpleado(p.id, p.input) : await crearEmpleado(p.input)
      if (p.acceso) emp = await definirAcceso(emp.id, p.acceso)
      else if (p.yaTeniaAcceso) emp = await quitarAcceso(emp.id)
      return emp
    },
    onSuccess: () => {
      invalidar()
      toast.success('Empleado guardado')
    },
    onError: (e) => toast.error('No se pudo guardar', e instanceof ApiError ? e.message : undefined),
  })

  const borrar = useMutation({
    mutationFn: (id: number) => eliminarEmpleado(id),
    onSuccess: () => {
      invalidar()
      toast.success('Empleado eliminado')
    },
    onError: (e) => toast.error('No se pudo eliminar', e instanceof ApiError ? e.message : undefined),
  })

  function abrirNuevo() {
    setEditando(null)
    setModalOpen(true)
  }
  function abrirEditar(e: Empleado) {
    setEditando(e)
    setModalOpen(true)
  }

  async function handleEliminar(e: Empleado) {
    const ok = await confirm({
      title: `¿Eliminar a ${e.nombre_completo}?`,
      description: e.usuario
        ? 'También se eliminará su cuenta para iniciar sesión.'
        : 'Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar',
      tone: 'danger',
    })
    if (ok) borrar.mutate(e.id)
  }

  async function handleGuardar(values: FormData) {
    const input: EmpleadoInput = { nombre: values.nombre, apellido: values.apellido }
    const acceso: AccesoInput | null = values.tieneAcceso
      ? {
          username: values.username,
          email: values.email,
          password: values.password || undefined,
          rol_id: values.rolId ? Number(values.rolId) : null,
        }
      : null
    try {
      await guardar.mutateAsync({
        id: editando?.id,
        input,
        acceso,
        yaTeniaAcceso: Boolean(editando?.usuario),
      })
      setModalOpen(false)
    } catch {
      /* el error ya se notificó en la mutación; dejamos el modal abierto */
    }
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        icon={Users}
        eyebrow="Equipo"
        title="Empleados"
        subtitle="El equipo de CelTuc y quién puede iniciar sesión."
        className="ct-rise"
        actions={
          admin ? (
            <>
              <Button variant="outline" onClick={() => setRolesOpen(true)}>
                <SlidersHorizontal className="h-4 w-4" />
                Roles
              </Button>
              <Button onClick={abrirNuevo}>
                <Plus className="h-4 w-4" />
                Nuevo empleado
              </Button>
            </>
          ) : undefined
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3">
        <StatCard className="ct-stagger-item" style={ctStagger(0)} label="Empleados" value={String(stats.total)} icon={Users} />
        <StatCard
          className="ct-stagger-item"
          style={ctStagger(1)}
          label="Con acceso al sistema"
          value={String(stats.conAcceso)}
          hint="Pueden iniciar sesión"
          icon={ShieldCheck}
        />
      </div>

      {isLoading ? (
        <GridSkeleton />
      ) : empleados.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="Sin empleados"
          description={admin ? 'Sumá al primer integrante del equipo.' : 'Todavía no hay empleados cargados.'}
          action={
            admin ? (
              <Button onClick={abrirNuevo}>
                <Plus className="h-4 w-4" />
                Nuevo empleado
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {empleados.map((e, i) => (
            <Card key={e.id} className="ct-stagger-item flex flex-col p-4" style={ctStagger(i)}>
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-ink-100 text-sm font-bold text-ink-900">
                  {iniciales(e)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink-900">{e.nombre_completo}</p>
                  {e.usuario ? (
                    <p className="flex items-center gap-1.5 truncate text-sm text-ink-500">
                      <AtSign className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{e.usuario.username}</span>
                    </p>
                  ) : (
                    <p className="truncate text-sm text-ink-400">Sin acceso al sistema</p>
                  )}
                </div>
                {e.usuario?.rol && (
                  <Badge tone={e.usuario.rol.es_admin ? 'solid' : 'soft'}>
                    <ShieldCheck className="h-3 w-3" />
                    {e.usuario.rol.nombre}
                  </Badge>
                )}
                {!e.usuario?.rol && e.puede_loguear && (
                  <Badge tone="soft">
                    <ShieldCheck className="h-3 w-3" />
                    Acceso
                  </Badge>
                )}
              </div>

              {e.usuario?.email && (
                <p className="mt-3 flex items-center gap-1.5 truncate text-xs text-ink-400">
                  <Mail className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{e.usuario.email}</span>
                </p>
              )}

              <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
                <span className="tnum text-xs text-ink-400">Alta: {fecha(e.creado)}</span>
                {admin && (
                  <div className="flex items-center gap-2">
                    <IconBtn label="Editar" onClick={() => abrirEditar(e)}>
                      <Pencil className="h-4 w-4" />
                    </IconBtn>
                    <IconBtn label="Eliminar" onClick={() => handleEliminar(e)}>
                      <Trash2 className="h-4 w-4" />
                    </IconBtn>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <EmpleadoFormModal
        open={modalOpen}
        empleado={editando}
        roles={roles}
        saving={guardar.isPending}
        onClose={() => setModalOpen(false)}
        onSubmit={handleGuardar}
      />

      <RolesManager open={rolesOpen} onClose={() => setRolesOpen(false)} />
    </div>
  )
}

// ===== Modal de alta/edición =====

function EmpleadoFormModal({
  open,
  empleado,
  roles,
  saving,
  onClose,
  onSubmit,
}: {
  open: boolean
  empleado: Empleado | null
  roles: Rol[]
  saving: boolean
  onClose: () => void
  onSubmit: (values: FormData) => Promise<void>
}) {
  const yaTieneAcceso = Boolean(empleado?.usuario)
  const [showPassword, setShowPassword] = useState(false)

  // Rol "Empleado" del sistema: valor por defecto al crear un acceso nuevo.
  const rolPorDefecto = useMemo(
    () => roles.find((r) => r.nombre.toLowerCase() === 'empleado') ?? roles.find((r) => !r.es_admin) ?? roles[0],
    [roles],
  )

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    setError,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      nombre: '', apellido: '', tieneAcceso: false, username: '', email: '', password: '', rolId: '',
    },
  })

  useEffect(() => {
    if (!open) return
    setShowPassword(false)
    reset({
      nombre: empleado?.nombre ?? '',
      apellido: empleado?.apellido ?? '',
      tieneAcceso: Boolean(empleado?.usuario),
      username: empleado?.usuario?.username ?? '',
      email: empleado?.usuario?.email ?? '',
      password: '',
      rolId: empleado?.usuario?.rol?.id
        ? String(empleado.usuario.rol.id)
        : rolPorDefecto
          ? String(rolPorDefecto.id)
          : '',
    })
  }, [open, empleado, reset, rolPorDefecto])

  const tieneAcceso = watch('tieneAcceso')
  const rolId = watch('rolId')

  const internalSubmit = (values: FormData) => {
    // La contraseña solo es obligatoria al CREAR un acceso nuevo (al editar uno
    // existente, vacío = no cambiarla).
    if (values.tieneAcceso && !yaTieneAcceso && !values.password) {
      setError('password', { message: 'Requerida para crear el acceso' })
      return
    }
    return onSubmit(values)
  }

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-lg font-semibold text-ink-950">
          {empleado ? 'Editar empleado' : 'Nuevo empleado'}
        </h2>
      </div>
      <form onSubmit={handleSubmit(internalSubmit)} className="space-y-4 overflow-y-auto px-5 py-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Nombre" error={errors.nombre?.message}>
            <Input placeholder="Lucas" autoFocus {...register('nombre')} />
          </Campo>
          <Campo label="Apellido (opcional)" error={errors.apellido?.message}>
            <Input placeholder="Gómez" {...register('apellido')} />
          </Campo>
        </div>

        {/* Acceso al sistema */}
        <div className="rounded-2xl border border-line bg-canvas/40 p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={tieneAcceso}
              onChange={(ev) => setValue('tieneAcceso', ev.target.checked, { shouldValidate: true })}
              className="mt-0.5 h-4 w-4 rounded border-line-strong accent-ink-950"
            />
            <span>
              <span className="flex items-center gap-1.5 text-sm font-medium text-ink-900">
                <KeyRound className="h-4 w-4" /> Puede iniciar sesión
              </span>
              <span className="mt-0.5 block text-xs text-ink-400">
                Crea una cuenta para que este empleado entre al sistema (con email o usuario).
              </span>
            </span>
          </label>

          {tieneAcceso && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Select
                  label="Rol"
                  placeholder="Elegí un rol"
                  value={rolId}
                  onChange={(v) => setValue('rolId', v)}
                  options={roles.map((r) => ({
                    value: String(r.id),
                    label: r.es_admin ? `${r.nombre} · acceso total` : r.nombre,
                  }))}
                />
                <p className="mt-1.5 text-xs text-ink-400">
                  Define a qué módulos entra este empleado. Configurá los roles con el botón “Roles”.
                </p>
              </div>
              <Campo label="Nombre de usuario" error={errors.username?.message}>
                <div className="relative">
                  <AtSign className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                  <Input
                    placeholder="lgomez"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className="pl-10 text-base sm:text-sm"
                    {...register('username')}
                  />
                </div>
              </Campo>
              <Campo label="Email" error={errors.email?.message}>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                  <Input
                    type="email"
                    placeholder="lucas@celtuc.com"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className="pl-10 text-base sm:text-sm"
                    {...register('email')}
                  />
                </div>
              </Campo>
              <Campo
                label={yaTieneAcceso ? 'Nueva contraseña (opcional)' : 'Contraseña'}
                error={errors.password?.message}
              >
                <div className="relative sm:col-span-2">
                  <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder={yaTieneAcceso ? 'Dejar vacío para no cambiarla' : '••••••••'}
                    className="pl-10 pr-11 text-base sm:text-sm"
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-ink-400 transition-colors hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </Campo>
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2.5 pt-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Guardando…
              </>
            ) : empleado ? (
              'Guardar cambios'
            ) : (
              'Agregar empleado'
            )}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ===== Subcomponentes =====

function IconBtn({ children, label, onClick }: { children: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
    >
      {children}
    </button>
  )
}

function Campo({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-ink-500">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-ink-700">{error}</p>}
    </div>
  )
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-11 w-11 rounded-2xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <Skeleton className="mt-4 h-9 w-full" />
        </div>
      ))}
    </div>
  )
}
