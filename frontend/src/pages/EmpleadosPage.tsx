import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Mail, Pencil, Phone, Plus, Trash2, UserPlus, Users, Wallet } from 'lucide-react'
import type { Empleado, ModalidadHonorario } from '@/types'
import {
  actualizarEmpleado,
  costoMensualEstimado,
  crearEmpleado,
  type EmpleadoInput,
  eliminarEmpleado,
  listarEmpleados,
  listarPagos,
  registrarPago,
} from '@/services/empleados'
import { fecha, money, num, periodoLabel } from '@/lib/format'
import { ctStagger } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { ActivoDot } from '@/components/ui/StatusBadge'
import { useToast } from '@/components/ToastProvider'
import { useConfirm } from '@/components/ConfirmProvider'

const MODALIDADES: ModalidadHonorario[] = ['mensual', 'por_hora', 'comision']
const MODALIDAD_LABEL: Record<ModalidadHonorario, string> = {
  mensual: 'Mensual',
  por_hora: 'Por hora',
  comision: 'Comisión',
}

function honorarioTexto(e: Empleado): string {
  if (e.modalidad === 'comision') return `${num(e.honorario)}%`
  return `${money(e.honorario)}${e.modalidad === 'mensual' ? '/mes' : '/h'}`
}

const schema = z.object({
  nombre: z.string().trim().min(1, 'Requerido'),
  apellido: z.string().trim().min(1, 'Requerido'),
  puesto: z.string().trim().min(1, 'Requerido'),
  email: z.string().trim(),
  telefono: z.string().trim(),
  modalidad: z.enum(['mensual', 'por_hora', 'comision']),
  honorario: z.coerce.number({ invalid_type_error: 'Número' }).min(0, 'Inválido'),
  activo: z.boolean(),
  ingreso: z.string().min(1, 'Requerido'),
})
type FormData = z.infer<typeof schema>

export function EmpleadosPage() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()

  const { data: empleados = [], isLoading } = useQuery({
    queryKey: ['empleados'],
    queryFn: listarEmpleados,
  })
  const { data: pagos = [] } = useQuery({ queryKey: ['pagos'], queryFn: () => listarPagos() })

  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Empleado | null>(null)
  const [pagoDe, setPagoDe] = useState<Empleado | null>(null)

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ['empleados'] })
    queryClient.invalidateQueries({ queryKey: ['pagos'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const crear = useMutation({
    mutationFn: (input: EmpleadoInput) => crearEmpleado(input),
    onSuccess: () => {
      invalidar()
      toast.success('Empleado agregado')
    },
  })
  const actualizar = useMutation({
    mutationFn: ({ id, input }: { id: string; input: EmpleadoInput }) => actualizarEmpleado(id, input),
    onSuccess: () => {
      invalidar()
      toast.success('Empleado actualizado')
    },
  })
  const borrar = useMutation({
    mutationFn: (id: string) => eliminarEmpleado(id),
    onSuccess: () => {
      invalidar()
      toast.success('Empleado eliminado')
    },
  })
  const pagar = useMutation({
    mutationFn: (input: { empleadoId: string; monto: number; nota?: string }) => registrarPago(input),
    onSuccess: () => {
      invalidar()
      toast.success('Pago registrado')
    },
  })

  const stats = useMemo(() => {
    const activos = empleados.filter((e) => e.activo)
    const masa = activos.reduce((a, e) => a + costoMensualEstimado(e), 0)
    return { activos: activos.length, total: empleados.length, masa }
  }, [empleados])

  const nombreEmpleado = (id: string) => {
    const e = empleados.find((x) => x.id === id)
    return e ? `${e.nombre} ${e.apellido}` : 'Empleado'
  }

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
      title: `¿Eliminar a ${e.nombre} ${e.apellido}?`,
      description: 'Se quitarán también sus pagos registrados.',
      confirmLabel: 'Eliminar',
      tone: 'danger',
    })
    if (ok) borrar.mutate(e.id)
  }

  async function handleSubmit(values: FormData) {
    const input: EmpleadoInput = { ...values, ingreso: new Date(`${values.ingreso}T00:00:00`).toISOString() }
    if (editando) {
      await actualizar.mutateAsync({ id: editando.id, input })
    } else {
      await crear.mutateAsync(input)
    }
    setModalOpen(false)
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        icon={Users}
        eyebrow="Equipo"
        title="Empleados"
        subtitle="El equipo de CelTuc y sus honorarios."
        className="ct-rise"
        actions={
          <Button onClick={abrirNuevo}>
            <Plus className="h-4 w-4" />
            Nuevo empleado
          </Button>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard className="ct-stagger-item" style={ctStagger(0)} label="Activos" value={num(stats.activos)} icon={Users} />
        <StatCard className="ct-stagger-item" style={ctStagger(1)} label="Total" value={num(stats.total)} icon={Users} />
        <StatCard
          className="ct-stagger-item lg:col-span-2"
          style={ctStagger(2)}
          label="Masa de honorarios (mes est.)"
          value={money(stats.masa)}
          hint="Mensuales + por hora (las comisiones son variables)"
          icon={Wallet}
        />
      </div>

      {isLoading ? (
        <GridSkeleton />
      ) : empleados.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="Sin empleados"
          description="Sumá al primer integrante del equipo."
          action={
            <Button onClick={abrirNuevo}>
              <Plus className="h-4 w-4" />
              Nuevo empleado
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {empleados.map((e, i) => (
            <Card key={e.id} className="ct-stagger-item flex flex-col p-4" style={ctStagger(i)}>
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-ink-100 text-sm font-bold text-ink-900">
                  {e.nombre.charAt(0)}
                  {e.apellido.charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink-900">
                    {e.nombre} {e.apellido}
                  </p>
                  <p className="truncate text-sm text-ink-500">{e.puesto}</p>
                </div>
                <ActivoDot activo={e.activo} />
              </div>

              <div className="mt-3 space-y-1 text-xs text-ink-400">
                {e.email && (
                  <p className="flex items-center gap-1.5 truncate">
                    <Mail className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{e.email}</span>
                  </p>
                )}
                {e.telefono && (
                  <p className="flex items-center gap-1.5 truncate">
                    <Phone className="h-3.5 w-3.5 shrink-0" /> {e.telefono}
                  </p>
                )}
                <p className="tnum">Ingreso: {fecha(e.ingreso)}</p>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
                <Badge tone="soft">{MODALIDAD_LABEL[e.modalidad]}</Badge>
                <span className="tnum text-sm font-semibold text-ink-900">{honorarioTexto(e)}</span>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setPagoDe(e)}>
                  <Wallet className="h-4 w-4" />
                  Registrar pago
                </Button>
                <IconBtn label="Editar" onClick={() => abrirEditar(e)}>
                  <Pencil className="h-4 w-4" />
                </IconBtn>
                <IconBtn label="Eliminar" onClick={() => handleEliminar(e)}>
                  <Trash2 className="h-4 w-4" />
                </IconBtn>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Pagos recientes */}
      {pagos.length > 0 && (
        <Card className="ct-rise mt-5 overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="text-base font-semibold text-ink-900">Pagos recientes</h2>
            <Wallet className="h-4 w-4 text-ink-300" />
          </div>
          <ul className="divide-y divide-line">
            {pagos.slice(0, 8).map((p, i) => (
              <li key={p.id} className="ct-stagger-fade flex items-center gap-3 px-5 py-3.5" style={ctStagger(i)}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900">{nombreEmpleado(p.empleadoId)}</p>
                  <p className="truncate text-xs text-ink-400">
                    {periodoLabel(p.periodo)} · {fecha(p.fecha)}
                    {p.nota ? ` · ${p.nota}` : ''}
                  </p>
                </div>
                <span className="tnum shrink-0 text-sm font-semibold text-ink-900">{money(p.monto)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <EmpleadoFormModal
        open={modalOpen}
        empleado={editando}
        saving={crear.isPending || actualizar.isPending}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmit}
      />

      <PagoModal
        empleado={pagoDe}
        saving={pagar.isPending}
        onClose={() => setPagoDe(null)}
        onSubmit={async (monto, nota) => {
          if (!pagoDe) return
          await pagar.mutateAsync({ empleadoId: pagoDe.id, monto, nota })
          setPagoDe(null)
        }}
      />
    </div>
  )
}

// ===== Subcomponentes =====

function EmpleadoFormModal({
  open,
  empleado,
  saving,
  onClose,
  onSubmit,
}: {
  open: boolean
  empleado: Empleado | null
  saving: boolean
  onClose: () => void
  onSubmit: (values: FormData) => Promise<void>
}) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      nombre: '',
      apellido: '',
      puesto: '',
      email: '',
      telefono: '',
      modalidad: 'mensual',
      honorario: 0,
      activo: true,
      ingreso: new Date().toISOString().slice(0, 10),
    },
  })

  useEffect(() => {
    if (!open) return
    if (empleado) {
      reset({
        nombre: empleado.nombre,
        apellido: empleado.apellido,
        puesto: empleado.puesto,
        email: empleado.email,
        telefono: empleado.telefono,
        modalidad: empleado.modalidad,
        honorario: empleado.honorario,
        activo: empleado.activo,
        ingreso: empleado.ingreso.slice(0, 10),
      })
    } else {
      reset({
        nombre: '',
        apellido: '',
        puesto: '',
        email: '',
        telefono: '',
        modalidad: 'mensual',
        honorario: 0,
        activo: true,
        ingreso: new Date().toISOString().slice(0, 10),
      })
    }
  }, [open, empleado, reset])

  const modalidad = watch('modalidad')
  const activo = watch('activo')
  const honorarioLabel =
    modalidad === 'comision' ? 'Comisión (%)' : modalidad === 'por_hora' ? 'Valor hora (ARS)' : 'Honorario mensual (ARS)'

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-lg font-semibold text-ink-950">
          {empleado ? 'Editar empleado' : 'Nuevo empleado'}
        </h2>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 overflow-y-auto px-5 py-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Nombre" error={errors.nombre?.message}>
            <Input placeholder="Lucas" {...register('nombre')} />
          </Campo>
          <Campo label="Apellido" error={errors.apellido?.message}>
            <Input placeholder="Gómez" {...register('apellido')} />
          </Campo>
          <Campo label="Puesto" error={errors.puesto?.message}>
            <Input placeholder="Vendedor" {...register('puesto')} />
          </Campo>
          <Campo label="Fecha de ingreso" error={errors.ingreso?.message}>
            <Input type="date" {...register('ingreso')} />
          </Campo>
          <Campo label="Email">
            <Input type="email" placeholder="lucas@celtuc.com" {...register('email')} />
          </Campo>
          <Campo label="Teléfono">
            <Input placeholder="381 5 123-456" {...register('telefono')} />
          </Campo>
          <Campo label="Modalidad">
            <Select
              options={MODALIDADES.map((m) => ({ value: m, label: MODALIDAD_LABEL[m] }))}
              value={modalidad}
              onChange={(v) => setValue('modalidad', v as ModalidadHonorario, { shouldValidate: true })}
            />
          </Campo>
          <Campo label={honorarioLabel} error={errors.honorario?.message}>
            <Input type="number" inputMode="numeric" min={0} step="0.01" {...register('honorario')} />
          </Campo>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={activo}
            onChange={(e) => setValue('activo', e.target.checked)}
            className="h-4 w-4 rounded border-line-strong accent-ink-950"
          />
          Empleado activo
        </label>

        <div className="flex flex-col-reverse gap-2.5 pt-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Guardando…' : empleado ? 'Guardar cambios' : 'Agregar empleado'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function PagoModal({
  empleado,
  saving,
  onClose,
  onSubmit,
}: {
  empleado: Empleado | null
  saving: boolean
  onClose: () => void
  onSubmit: (monto: number, nota?: string) => Promise<void>
}) {
  const [monto, setMonto] = useState(0)
  const [nota, setNota] = useState('')

  useEffect(() => {
    if (empleado) {
      const sugerido = costoMensualEstimado(empleado) || empleado.honorario
      setMonto(sugerido)
      setNota('')
    }
  }, [empleado])

  return (
    <Modal open={Boolean(empleado)} onClose={onClose} size="sm">
      {empleado && (
        <>
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-lg font-semibold text-ink-950">Registrar pago</h2>
            <p className="text-xs text-ink-400">
              {empleado.nombre} {empleado.apellido} · {MODALIDAD_LABEL[empleado.modalidad]}
            </p>
          </div>
          <div className="space-y-4 px-5 py-5">
            <Campo label="Monto (ARS)">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                step="0.01"
                value={monto}
                onChange={(e) => setMonto(Number(e.target.value))}
              />
            </Campo>
            <Campo label="Nota (opcional)">
              <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Sueldo, adelanto, etc." />
            </Campo>
          </div>
          <div className="flex flex-col-reverse gap-2.5 border-t border-line px-5 py-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => onSubmit(monto, nota.trim() || undefined)} disabled={saving || monto <= 0}>
              {saving ? 'Registrando…' : 'Registrar pago'}
            </Button>
          </div>
        </>
      )}
    </Modal>
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
