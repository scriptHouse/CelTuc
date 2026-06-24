import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  AtSign,
  Briefcase,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Mail,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  UserCog,
  UserPlus,
  Wifi,
} from 'lucide-react'
import type { UsuarioAdmin } from '@/types'
import {
  actualizarUsuario,
  crearUsuario,
  eliminarUsuario,
  listarUsuarios,
} from '@/services/usuarios'
import { useAuth } from '@/store/auth'
import { ApiError } from '@/lib/api'
import { fecha, fechaHora } from '@/lib/format'
import { Presencia } from '@/components/ui/StatusBadge'
import { ctStagger } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ToastProvider'
import { useConfirm } from '@/components/ConfirmProvider'

const schema = z
  .object({
    username: z
      .string()
      .trim()
      .min(3, 'Mínimo 3 caracteres')
      .regex(/^[a-zA-Z0-9._-]+$/, 'Solo letras, números y . _ -'),
    email: z.string().trim().email('Email inválido'),
    password: z.string(),
    isStaff: z.boolean(),
    activo: z.boolean(),
    crearEmpleado: z.boolean(),
    empNombre: z.string().trim(),
    empApellido: z.string().trim(),
  })
  .superRefine((val, ctx) => {
    if (val.crearEmpleado && !val.empNombre) {
      ctx.addIssue({ path: ['empNombre'], code: z.ZodIssueCode.custom, message: 'Requerido' })
    }
  })
type FormData = z.infer<typeof schema>

function esAdmin(u: UsuarioAdmin): boolean {
  return u.is_superuser || u.is_staff
}

export function UsuariosPage() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const yo = useAuth((s) => s.usuario)

  const { data: usuarios = [], isLoading } = useQuery({
    queryKey: ['usuarios'],
    queryFn: listarUsuarios,
  })

  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<UsuarioAdmin | null>(null)

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ['usuarios'] })
    queryClient.invalidateQueries({ queryKey: ['empleados'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const stats = useMemo(() => {
    return {
      total: usuarios.length,
      admins: usuarios.filter(esAdmin).length,
      conEmpleado: usuarios.filter((u) => u.empleado).length,
      enLinea: usuarios.filter((u) => u.en_linea).length,
    }
  }, [usuarios])

  const crear = useMutation({
    mutationFn: crearUsuario,
    onSuccess: () => {
      invalidar()
      toast.success('Usuario creado')
    },
    onError: (e) => toast.error('No se pudo crear', e instanceof ApiError ? e.message : undefined),
  })
  const actualizar = useMutation({
    mutationFn: ({ id, input }: { id: number; input: Parameters<typeof actualizarUsuario>[1] }) =>
      actualizarUsuario(id, input),
    onSuccess: () => {
      invalidar()
      toast.success('Usuario actualizado')
    },
    onError: (e) => toast.error('No se pudo guardar', e instanceof ApiError ? e.message : undefined),
  })
  const borrar = useMutation({
    mutationFn: (id: number) => eliminarUsuario(id),
    onSuccess: () => {
      invalidar()
      toast.success('Usuario eliminado')
    },
    onError: (e) => toast.error('No se pudo eliminar', e instanceof ApiError ? e.message : undefined),
  })

  function abrirNuevo() {
    setEditando(null)
    setModalOpen(true)
  }
  function abrirEditar(u: UsuarioAdmin) {
    setEditando(u)
    setModalOpen(true)
  }

  async function handleEliminar(u: UsuarioAdmin) {
    const ok = await confirm({
      title: `¿Eliminar la cuenta @${u.username}?`,
      description: u.empleado
        ? `El empleado ${u.empleado.nombre_completo} se mantiene, pero sin acceso al sistema.`
        : 'La cuenta no podrá volver a iniciar sesión.',
      confirmLabel: 'Eliminar',
      tone: 'danger',
    })
    if (ok) borrar.mutate(u.id)
  }

  async function handleGuardar(values: FormData) {
    try {
      if (editando) {
        await actualizar.mutateAsync({
          id: editando.id,
          input: {
            username: values.username,
            email: values.email,
            is_active: values.activo,
            is_staff: values.isStaff,
            password: values.password || undefined,
          },
        })
      } else {
        await crear.mutateAsync({
          username: values.username,
          email: values.email,
          password: values.password,
          is_staff: values.isStaff,
          empleado: values.crearEmpleado
            ? { nombre: values.empNombre, apellido: values.empApellido }
            : null,
        })
      }
      setModalOpen(false)
    } catch {
      /* error notificado por la mutación; dejamos el modal abierto */
    }
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        icon={UserCog}
        eyebrow="Accesos"
        title="Usuarios"
        subtitle="Cuentas que pueden iniciar sesión en el sistema."
        className="ct-rise"
        actions={
          <Button onClick={abrirNuevo}>
            <Plus className="h-4 w-4" />
            Nuevo usuario
          </Button>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard className="ct-stagger-item" style={ctStagger(0)} label="Cuentas" value={String(stats.total)} icon={UserCog} />
        <StatCard className="ct-stagger-item" style={ctStagger(1)} label="En línea" value={String(stats.enLinea)} hint="Activos ahora" icon={Wifi} />
        <StatCard className="ct-stagger-item" style={ctStagger(2)} label="Administradores" value={String(stats.admins)} icon={ShieldCheck} />
        <StatCard
          className="ct-stagger-item"
          style={ctStagger(3)}
          label="Vinculadas a empleado"
          value={String(stats.conEmpleado)}
          icon={Briefcase}
        />
      </div>

      {isLoading ? (
        <GridSkeleton />
      ) : usuarios.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="Sin cuentas"
          description="Creá la primera cuenta de acceso."
          action={
            <Button onClick={abrirNuevo}>
              <Plus className="h-4 w-4" />
              Nuevo usuario
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {usuarios.map((u, i) => {
            const protegido = u.id === yo?.id || u.is_superuser
            return (
              <Card key={u.id} className="ct-stagger-item flex flex-col p-4" style={ctStagger(i)}>
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-ink-100 text-sm font-bold uppercase text-ink-900">
                    {u.username.charAt(0)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate font-semibold text-ink-900">
                      <AtSign className="h-3.5 w-3.5 shrink-0 text-ink-400" />
                      <span className="truncate">{u.username}</span>
                    </p>
                    <p className="flex items-center gap-1.5 truncate text-sm text-ink-500">
                      <Mail className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{u.email}</span>
                    </p>
                  </div>
                  {esAdmin(u) && (
                    <Badge tone="solid">
                      <ShieldCheck className="h-3 w-3" />
                      {u.is_superuser ? 'Dueño' : 'Admin'}
                    </Badge>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  {u.empleado ? (
                    <Badge tone="soft">
                      <Briefcase className="h-3 w-3" />
                      {u.empleado.nombre_completo}
                    </Badge>
                  ) : (
                    <span className="text-ink-400">Sin empleado vinculado</span>
                  )}
                  {!u.is_active && <Badge tone="soft">Inactivo</Badge>}
                </div>

                <div className="mt-3 flex flex-col gap-1 rounded-xl bg-canvas/50 px-3 py-2.5">
                  <Presencia enLinea={u.en_linea} ultimaActividad={u.ultima_actividad} />
                  <span className="tnum text-xs text-ink-400">
                    Último ingreso: {fechaHora(u.last_login)}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
                  <span className="tnum text-xs text-ink-400">Alta: {fecha(u.date_joined)}</span>
                  <div className="flex items-center gap-2">
                    <IconBtn label="Editar" onClick={() => abrirEditar(u)}>
                      <Pencil className="h-4 w-4" />
                    </IconBtn>
                    {!protegido && (
                      <IconBtn label="Eliminar" onClick={() => handleEliminar(u)}>
                        <Trash2 className="h-4 w-4" />
                      </IconBtn>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <UsuarioFormModal
        open={modalOpen}
        usuario={editando}
        esYoMismo={Boolean(editando && editando.id === yo?.id)}
        saving={crear.isPending || actualizar.isPending}
        onClose={() => setModalOpen(false)}
        onSubmit={handleGuardar}
      />
    </div>
  )
}

// ===== Modal de alta/edición =====

function UsuarioFormModal({
  open,
  usuario,
  esYoMismo,
  saving,
  onClose,
  onSubmit,
}: {
  open: boolean
  usuario: UsuarioAdmin | null
  esYoMismo: boolean
  saving: boolean
  onClose: () => void
  onSubmit: (values: FormData) => Promise<void>
}) {
  const esEdicion = Boolean(usuario)
  const [showPassword, setShowPassword] = useState(false)

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
      username: '',
      email: '',
      password: '',
      isStaff: false,
      activo: true,
      crearEmpleado: false,
      empNombre: '',
      empApellido: '',
    },
  })

  useEffect(() => {
    if (!open) return
    setShowPassword(false)
    reset({
      username: usuario?.username ?? '',
      email: usuario?.email ?? '',
      password: '',
      isStaff: usuario?.is_staff ?? false,
      activo: usuario?.is_active ?? true,
      crearEmpleado: false,
      empNombre: '',
      empApellido: '',
    })
  }, [open, usuario, reset])

  const isStaff = watch('isStaff')
  const activo = watch('activo')
  const crearEmpleado = watch('crearEmpleado')

  const internalSubmit = (values: FormData) => {
    if (!esEdicion && !values.password) {
      setError('password', { message: 'La contraseña es obligatoria' })
      return
    }
    return onSubmit(values)
  }

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-lg font-semibold text-ink-950">
          {esEdicion ? 'Editar usuario' : 'Nuevo usuario'}
        </h2>
      </div>
      <form onSubmit={handleSubmit(internalSubmit)} className="space-y-4 overflow-y-auto px-5 py-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
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
            label={esEdicion ? 'Nueva contraseña (opcional)' : 'Contraseña'}
            error={errors.password?.message}
          >
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <Input
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder={esEdicion ? 'Dejar vacío para no cambiarla' : '••••••••'}
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

        {/* Permisos */}
        <div className="space-y-2 rounded-2xl border border-line bg-canvas/40 p-4">
          <Check
            label="Puede administrar (gestiona empleados y usuarios)"
            checked={isStaff}
            disabled={esYoMismo}
            onChange={(v) => setValue('isStaff', v)}
          />
          {esEdicion && (
            <Check
              label="Cuenta activa"
              checked={activo}
              disabled={esYoMismo}
              onChange={(v) => setValue('activo', v)}
            />
          )}
          {esYoMismo && (
            <p className="text-xs text-ink-400">No podés cambiar tus propios permisos ni desactivarte.</p>
          )}
        </div>

        {/* Crear empleado (solo al crear una cuenta nueva) */}
        {!esEdicion && (
          <div className="rounded-2xl border border-line bg-canvas/40 p-4">
            <Check
              label="Crear también su empleado"
              checked={crearEmpleado}
              onChange={(v) => setValue('crearEmpleado', v, { shouldValidate: true })}
              icon={Briefcase}
              hint="Carga al equipo a esta persona, vinculada a esta cuenta."
            />
            {crearEmpleado && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Campo label="Nombre" error={errors.empNombre?.message}>
                  <Input placeholder="Lucas" {...register('empNombre')} />
                </Campo>
                <Campo label="Apellido (opcional)">
                  <Input placeholder="Gómez" {...register('empApellido')} />
                </Campo>
              </div>
            )}
          </div>
        )}

        {esEdicion && usuario?.empleado && (
          <p className="flex items-center gap-1.5 text-xs text-ink-400">
            <Briefcase className="h-3.5 w-3.5" />
            Empleado vinculado: <span className="font-medium text-ink-600">{usuario.empleado.nombre_completo}</span>
          </p>
        )}

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
            ) : esEdicion ? (
              'Guardar cambios'
            ) : (
              'Crear usuario'
            )}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ===== Subcomponentes =====

function Check({
  label,
  checked,
  onChange,
  disabled,
  icon: Icon,
  hint,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  icon?: typeof Briefcase
  hint?: string
}) {
  return (
    <label className={`flex items-start gap-3 ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-line-strong accent-ink-950"
      />
      <span>
        <span className="flex items-center gap-1.5 text-sm font-medium text-ink-900">
          {Icon && <Icon className="h-4 w-4" />} {label}
        </span>
        {hint && <span className="mt-0.5 block text-xs text-ink-400">{hint}</span>}
      </span>
    </label>
  )
}

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
