import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  AtSign,
  Briefcase,
  Download,
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
import { listarRoles } from '@/services/roles'
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
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ToastProvider'
import { useConfirm } from '@/components/ConfirmProvider'
import { ExportarTablaModal, type GestorExport } from '@/components/exportar/ExportarTablaModal'

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
    /** Id del rol como string ('' = sin rol), para el Select. */
    rolId: z.string(),
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
  return u.es_administrador ?? (u.is_superuser || u.is_staff)
}

function nivelDe(u: UsuarioAdmin): string {
  if (u.is_superuser) return 'Superadmin'
  return esAdmin(u) ? 'Admin' : 'Empleado'
}

/** Qué se puede exportar de las cuentas (botón «Exportar»). */
const GESTOR_EXPORT_USUARIOS: GestorExport<UsuarioAdmin> = {
  id: 'usuarios',
  titulo: 'Usuarios',
  nombreArchivo: 'usuarios-{fecha}',
  columnas: [
    { id: 'username', label: 'Usuario', tipo: 'texto', peso: 20, valor: (u) => u.username },
    { id: 'email', label: 'Email', tipo: 'texto', peso: 26, valor: (u) => u.email },
    { id: 'nivel', label: 'Nivel', tipo: 'texto', peso: 12, valor: nivelDe },
    { id: 'rol', label: 'Rol', tipo: 'texto', peso: 18, valor: (u) => u.rol?.nombre ?? '' },
    {
      id: 'empleado',
      label: 'Empleado vinculado',
      corto: 'Empleado',
      tipo: 'texto',
      peso: 22,
      valor: (u) => u.empleado?.nombre_completo ?? '',
    },
    { id: 'activa', label: 'Activa', tipo: 'texto', peso: 8, valor: (u) => (u.is_active ? 'Sí' : 'No') },
    {
      id: 'ultimo_ingreso',
      label: 'Último ingreso',
      corto: 'Últ. ingreso',
      tipo: 'fechahora',
      peso: 17,
      valor: (u) => u.last_login,
    },
    { id: 'alta', label: 'Alta', tipo: 'fecha', peso: 12, valor: (u) => u.date_joined },
    {
      id: 'en_linea',
      label: 'En línea ahora',
      corto: 'En línea',
      tipo: 'texto',
      peso: 9,
      opcional: true,
      valor: (u) => (u.en_linea ? 'Sí' : 'No'),
    },
    {
      id: 'id',
      label: 'ID interno',
      corto: 'ID',
      tipo: 'entero',
      peso: 8,
      opcional: true,
      valor: (u) => u.id,
    },
  ],
  grupos: [
    { id: 'nivel', label: 'Nivel', valor: nivelDe },
    { id: 'rol', label: 'Rol', valor: (u) => u.rol?.nombre ?? (esAdmin(u) ? 'Administradores' : 'Sin rol') },
  ],
}

export function UsuariosPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const yo = useAuth((s) => s.usuario)
  // Solo el superadministrador (dueño) edita o elimina cuentas de nivel administrador;
  // crear administradores lo puede hacer cualquier admin.
  const soySuper = Boolean(yo?.is_superuser)

  const { data: usuarios = [], isLoading } = useQuery({
    queryKey: ['usuarios'],
    queryFn: listarUsuarios,
  })

  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<UsuarioAdmin | null>(null)
  const [exportarAbierto, setExportarAbierto] = useState(false)

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
    const rol = values.rolId ? Number(values.rolId) : null
    try {
      if (editando) {
        await actualizar.mutateAsync({
          id: editando.id,
          input: {
            username: values.username,
            email: values.email,
            is_active: values.activo,
            is_staff: values.isStaff,
            // El backend no deja tocarse el propio rol: no se manda ni el actual.
            ...(editando.id === yo?.id ? {} : { rol }),
            password: values.password || undefined,
          },
        })
      } else {
        await crear.mutateAsync({
          username: values.username,
          email: values.email,
          password: values.password,
          is_staff: values.isStaff,
          rol,
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
          <>
            <Button variant="outline" onClick={() => setExportarAbierto(true)} disabled={usuarios.length === 0}>
              <Download className="h-4 w-4" />
              Exportar
            </Button>
            <Button variant="outline" onClick={() => navigate('/usuarios/roles')}>
              <ShieldCheck className="h-4 w-4" />
              Roles y permisos
            </Button>
            <Button onClick={abrirNuevo}>
              <Plus className="h-4 w-4" />
              Nuevo usuario
            </Button>
          </>
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
            // Un admin común no puede gestionar cuentas de nivel admin (salvo la propia).
            const puedoGestionar = soySuper || !esAdmin(u) || u.id === yo?.id
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
                      {u.is_superuser ? 'Superadmin' : 'Admin'}
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
                  {/* Rol solo en cuentas comunes: a los admins no los limita. */}
                  {!esAdmin(u) &&
                    (u.rol ? (
                      <Badge tone="outline">{u.rol.nombre}</Badge>
                    ) : (
                      <Badge tone="outline" className="text-ink-400">Sin rol</Badge>
                    ))}
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
                    {puedoGestionar && (
                      <IconBtn label="Editar" onClick={() => abrirEditar(u)}>
                        <Pencil className="h-4 w-4" />
                      </IconBtn>
                    )}
                    {puedoGestionar && !protegido && (
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
      <ExportarTablaModal
        abierto={exportarAbierto}
        onCerrar={() => setExportarAbierto(false)}
        gestor={GESTOR_EXPORT_USUARIOS}
        filasVista={usuarios}
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

  // Catálogo de roles para el selector (define qué módulos ve la cuenta).
  const { data: roles = [] } = useQuery({
    queryKey: ['roles'],
    queryFn: listarRoles,
    enabled: open,
  })

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
      rolId: '',
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
      rolId: usuario?.rol ? String(usuario.rol.id) : '',
      crearEmpleado: false,
      empNombre: '',
      empApellido: '',
    })
  }, [open, usuario, reset])

  const isStaff = watch('isStaff')
  const activo = watch('activo')
  const rolId = watch('rolId')
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
        <div className="space-y-3 rounded-2xl border border-line bg-canvas/40 p-4">
          <div>
            <Select
              label="Rol (módulos que ve la cuenta)"
              placeholder="Sin rol — sin acceso a módulos"
              searchable
              searchPlaceholder="Buscar rol"
              disabled={esYoMismo}
              value={rolId}
              onChange={(v) => setValue('rolId', v)}
              options={[
                { value: '', label: 'Sin rol — sin acceso a módulos' },
                ...roles.map((r) => ({
                  value: String(r.id),
                  label: r.es_admin ? `${r.nombre} (admin: ve todo)` : r.nombre,
                })),
              ]}
            />
            {isStaff && !esYoMismo && (
              <p className="mt-1.5 text-xs text-ink-400">
                Esta cuenta administra: ve todos los módulos, el rol no la limita.
              </p>
            )}
          </div>
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
            <p className="text-xs text-ink-400">
              No podés cambiar tu propio rol ni tus permisos, ni desactivarte.
            </p>
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
