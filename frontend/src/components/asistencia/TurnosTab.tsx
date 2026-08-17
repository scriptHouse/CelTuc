import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Copy, Loader2, Pencil, Plus, Trash2, UserPlus } from 'lucide-react'
import type { AsignacionTurno, TramoTurno, TurnoAsistencia } from '@/types'
import {
  actualizarTurno,
  crearAsignacion,
  crearTurno,
  eliminarAsignacion,
  eliminarTurno,
  listarAsignaciones,
  listarTurnos,
} from '@/services/asistencia'
import { listarEmpleados } from '@/services/empleados'
import { useConfirm } from '@/components/ConfirmProvider'
import { useToast } from '@/components/ToastProvider'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { DIAS_SEMANA, duracion, hhmm } from '@/components/asistencia/constantes'
import { fecha as fechaCorta } from '@/lib/format'
import { cn, ctStagger } from '@/lib/utils'

/** Fila del editor: un día de la semana, activo o no. */
interface DiaEditor {
  activo: boolean
  entrada: string
  salida: string
}

const DIA_VACIO: DiaEditor = { activo: false, entrada: '09:00', salida: '18:00' }

function tramosADias(tramos: TramoTurno[]): DiaEditor[] {
  return DIAS_SEMANA.map((d) => {
    const tramo = tramos.find((t) => t.dia_semana === d.valor)
    return tramo
      ? { activo: true, entrada: hhmm(tramo.hora_entrada), salida: hhmm(tramo.hora_salida) }
      : { ...DIA_VACIO }
  })
}

export function TurnosTab() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()

  const [editando, setEditando] = useState<TurnoAsistencia | null | 'nuevo'>(null)
  const [asignando, setAsignando] = useState(false)

  const { data: turnos = [], isLoading } = useQuery({
    queryKey: ['asistencia', 'turnos'],
    queryFn: listarTurnos,
  })
  const { data: asignaciones = [] } = useQuery({
    queryKey: ['asistencia', 'asignaciones'],
    queryFn: () => listarAsignaciones(),
  })

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ['asistencia'] })

  const borrarTurno = useMutation({
    mutationFn: (id: number) => eliminarTurno(id),
    onSuccess: () => {
      invalidar()
      toast.success('Turno eliminado')
    },
    onError: (e: Error) => toast.error('No se pudo eliminar', e.message),
  })

  const borrarAsignacion = useMutation({
    mutationFn: (id: number) => eliminarAsignacion(id),
    onSuccess: () => {
      invalidar()
      toast.success('Asignación eliminada')
    },
    onError: (e: Error) => toast.error('No se pudo eliminar', e.message),
  })

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-2 flex items-center justify-between gap-3 px-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-400">
            Horarios
          </h3>
          <Button size="sm" onClick={() => setEditando('nuevo')}>
            <Plus className="h-4 w-4" />
            Nuevo turno
          </Button>
        </div>

        {isLoading ? (
          <Skeleton className="h-32 rounded-2xl" />
        ) : turnos.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="Sin turnos cargados"
            description="Un turno define qué horario le corresponde a cada empleado. Sin turno, las fichadas se muestran pero no se puede saber si alguien llegó tarde o faltó."
            action={
              <Button onClick={() => setEditando('nuevo')}>
                <Plus className="h-4 w-4" />
                Crear el primero
              </Button>
            }
          />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {turnos.map((turno, i) => (
              <Card key={turno.id} className="ct-stagger-item p-4" style={ctStagger(i)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="font-semibold text-ink-950">{turno.nombre}</h4>
                    <p className="tnum mt-0.5 text-xs text-ink-400">
                      {duracion(turno.minutos_semanales)} por semana ·{' '}
                      {turno.empleados_asignados} empleado
                      {turno.empleados_asignados === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {!turno.activo && <Badge tone="outline">Inactivo</Badge>}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Editar ${turno.nombre}`}
                      onClick={() => setEditando(turno)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Eliminar ${turno.nombre}`}
                      onClick={async () => {
                        const ok = await confirm({
                          title: `¿Eliminar «${turno.nombre}»?`,
                          description:
                            'Los días ya calculados con este horario dejan de compararse contra él.',
                          confirmLabel: 'Eliminar',
                          tone: 'danger',
                        })
                        if (ok === true) borrarTurno.mutate(turno.id)
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-7 gap-1">
                  {DIAS_SEMANA.map((d) => {
                    const tramos = turno.tramos.filter((t) => t.dia_semana === d.valor)
                    const trabaja = tramos.length > 0
                    return (
                      <div
                        key={d.valor}
                        className={cn(
                          'rounded-lg border px-1 py-1.5 text-center',
                          trabaja ? 'border-line bg-ink-50' : 'border-dashed border-line',
                        )}
                        title={
                          trabaja
                            ? tramos.map((t) => `${hhmm(t.hora_entrada)}-${hhmm(t.hora_salida)}`).join(' / ')
                            : 'Franco'
                        }
                      >
                        <p
                          className={cn(
                            'text-[11px] font-medium',
                            trabaja ? 'text-ink-900' : 'text-ink-300',
                          )}
                        >
                          {d.corto}
                        </p>
                        {trabaja ? (
                          tramos.map((t, k) => (
                            <p key={k} className="tnum text-[10px] leading-tight text-ink-500">
                              {hhmm(t.hora_entrada)}
                            </p>
                          ))
                        ) : (
                          <p className="text-[10px] text-ink-300">—</p>
                        )}
                      </div>
                    )
                  })}
                </div>

                <p className="mt-2 text-[11px] text-ink-400">
                  Tolerancia: {turno.tolerancia_entrada} min al entrar ·{' '}
                  {turno.tolerancia_salida} min al salir
                </p>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between gap-3 px-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-400">
            Quién trabaja en qué turno
          </h3>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAsignando(true)}
            disabled={turnos.length === 0}
          >
            <UserPlus className="h-4 w-4" />
            Asignar turno
          </Button>
        </div>

        {asignaciones.length === 0 ? (
          <Card className="p-5">
            <p className="text-sm text-ink-500">
              Todavía no asignaste turnos. Mientras tanto, las fichadas se registran igual pero no
              se comparan contra ningún horario.
            </p>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-400">
                    <th className="px-4 py-2.5 font-semibold">Empleado</th>
                    <th className="px-4 py-2.5 font-semibold">Turno</th>
                    <th className="px-4 py-2.5 font-semibold">Vigencia</th>
                    <th className="w-12 px-2 py-2.5" aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {asignaciones.map((a: AsignacionTurno, i) => (
                    <tr key={a.id} className="ct-stagger-fade" style={ctStagger(i)}>
                      <td className="px-4 py-3 font-medium text-ink-950">{a.empleado_nombre}</td>
                      <td className="px-4 py-3 text-ink-600">{a.turno_nombre}</td>
                      <td className="tnum px-4 py-3 text-ink-600">
                        desde {fechaCorta(a.desde)}
                        {a.hasta ? ` hasta ${fechaCorta(a.hasta)}` : ''}
                        {a.vigente && (
                          <Badge tone="soft" className="ml-2">
                            vigente
                          </Badge>
                        )}
                      </td>
                      <td className="px-2 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Eliminar asignación de ${a.empleado_nombre}`}
                          onClick={async () => {
                            const ok = await confirm({
                              title: '¿Eliminar la asignación?',
                              description: `${a.empleado_nombre} deja de tener «${a.turno_nombre}». Sus días pasan a no compararse contra ningún horario.`,
                              confirmLabel: 'Eliminar',
                              tone: 'danger',
                            })
                            if (ok === true) borrarAsignacion.mutate(a.id)
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      <TurnoModal
        turno={editando === 'nuevo' ? null : editando}
        abierto={editando !== null}
        onClose={() => setEditando(null)}
      />
      <AsignarTurnoModal
        abierto={asignando}
        turnos={turnos}
        onClose={() => setAsignando(false)}
      />
    </div>
  )
}

// --- Modal de turno ----------------------------------------------------------

function TurnoModal({
  turno,
  abierto,
  onClose,
}: {
  turno: TurnoAsistencia | null
  abierto: boolean
  onClose: () => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()

  const [nombre, setNombre] = useState('')
  const [dias, setDias] = useState<DiaEditor[]>(DIAS_SEMANA.map(() => ({ ...DIA_VACIO })))
  const [tolEntrada, setTolEntrada] = useState('10')
  const [tolSalida, setTolSalida] = useState('10')
  const [antirebote, setAntirebote] = useState('2')

  useEffect(() => {
    if (!abierto) return
    setNombre(turno?.nombre ?? '')
    setDias(
      turno
        ? tramosADias(turno.tramos)
        : DIAS_SEMANA.map((d) => ({ ...DIA_VACIO, activo: d.valor <= 4 })),
    )
    setTolEntrada(String(turno?.tolerancia_entrada ?? 10))
    setTolSalida(String(turno?.tolerancia_salida ?? 10))
    setAntirebote(String(turno?.minutos_antirebote ?? 2))
  }, [abierto, turno])

  const cambiar = (indice: number, cambios: Partial<DiaEditor>) =>
    setDias((prev) => prev.map((d, i) => (i === indice ? { ...d, ...cambios } : d)))

  const copiarATodos = () => {
    const primero = dias.find((d) => d.activo)
    if (!primero) return
    setDias((prev) =>
      prev.map((d) => (d.activo ? { ...d, entrada: primero.entrada, salida: primero.salida } : d)),
    )
    toast.info('Horario copiado', 'Se aplicó a todos los días activos.')
  }

  const guardar = useMutation({
    mutationFn: () => {
      const tramos: TramoTurno[] = dias
        .map((d, i) => ({ d, i }))
        .filter(({ d }) => d.activo)
        .map(({ d, i }) => ({
          dia_semana: i,
          hora_entrada: d.entrada,
          hora_salida: d.salida,
        }))
      const cuerpo = {
        nombre: nombre.trim(),
        tramos,
        tolerancia_entrada: Number(tolEntrada) || 0,
        tolerancia_salida: Number(tolSalida) || 0,
        minutos_antirebote: Number(antirebote) || 0,
      }
      return turno ? actualizarTurno(turno.id, cuerpo) : crearTurno(cuerpo)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asistencia'] })
      toast.success(turno ? 'Turno actualizado' : 'Turno creado')
      onClose()
    },
    onError: (e: Error) => toast.error('No se pudo guardar', e.message),
  })

  const algunDia = dias.some((d) => d.activo)
  const valido = nombre.trim() !== '' && algunDia

  return (
    <Modal open={abierto} onClose={onClose} size="lg">
      <div className="p-5 sm:p-6">
        <h3 className="text-lg font-semibold text-ink-950">
          {turno ? `Editar «${turno.nombre}»` : 'Nuevo turno'}
        </h3>
        <p className="mt-1 text-sm text-ink-500">
          Marcá los días que se trabaja y su horario. Los días sin marcar son franco.
        </p>

        <div className="mt-5">
          <label className="mb-1.5 block text-sm font-medium text-ink-700">Nombre del turno</label>
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Comercio 9 a 18"
          />
        </div>

        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm font-medium text-ink-700">Horario semanal</p>
          <Button variant="ghost" size="sm" onClick={copiarATodos} disabled={!algunDia}>
            <Copy className="h-3.5 w-3.5" />
            Copiar a todos
          </Button>
        </div>

        <div className="mt-2 space-y-1.5">
          {DIAS_SEMANA.map((d, i) => (
            <div
              key={d.valor}
              className={cn(
                'flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2',
                dias[i].activo ? 'border-line bg-surface' : 'border-dashed border-line bg-ink-50',
              )}
            >
              <label className="flex w-28 shrink-0 cursor-pointer select-none items-center gap-2 text-sm text-ink-700">
                <input
                  type="checkbox"
                  checked={dias[i].activo}
                  onChange={(e) => cambiar(i, { activo: e.target.checked })}
                  className="h-4 w-4 rounded border-line-strong accent-ink-950"
                />
                {d.largo}
              </label>
              {dias[i].activo ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="time"
                    value={dias[i].entrada}
                    onChange={(e) => cambiar(i, { entrada: e.target.value })}
                    className="tnum h-9 w-32"
                  />
                  <span className="text-ink-400">a</span>
                  <Input
                    type="time"
                    value={dias[i].salida}
                    onChange={(e) => cambiar(i, { salida: e.target.value })}
                    className="tnum h-9 w-32"
                  />
                </div>
              ) : (
                <span className="text-sm text-ink-400">Franco</span>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-700">
              Tolerancia al entrar (min)
            </label>
            <Input
              type="number"
              value={tolEntrada}
              onChange={(e) => setTolEntrada(e.target.value)}
              className="tnum"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-700">
              Tolerancia al salir (min)
            </label>
            <Input
              type="number"
              value={tolSalida}
              onChange={(e) => setTolSalida(e.target.value)}
              className="tnum"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-700">
              Anti-rebote (min)
            </label>
            <Input
              type="number"
              value={antirebote}
              onChange={(e) => setAntirebote(e.target.value)}
              className="tnum"
            />
          </div>
        </div>
        <p className="mt-1.5 text-[11px] text-ink-400">
          Anti-rebote: si el reloj lee el mismo rostro dos veces seguidas dentro de esos minutos,
          se cuenta una sola vez. Evita que una relectura invierta entrada y salida.
        </p>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => guardar.mutate()} disabled={!valido || guardar.isPending}>
            {guardar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {turno ? 'Guardar cambios' : 'Crear turno'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// --- Modal de asignación -----------------------------------------------------

function AsignarTurnoModal({
  abierto,
  turnos,
  onClose,
}: {
  abierto: boolean
  turnos: TurnoAsistencia[]
  onClose: () => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()

  const [empleado, setEmpleado] = useState('')
  const [turno, setTurno] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  const { data: empleados = [] } = useQuery({
    queryKey: ['empleados'],
    queryFn: listarEmpleados,
    enabled: abierto,
  })

  useEffect(() => {
    if (!abierto) return
    setEmpleado('')
    setTurno(turnos[0] ? String(turnos[0].id) : '')
    const hoy = new Date()
    setDesde(
      `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`,
    )
    setHasta('')
  }, [abierto, turnos])

  const guardar = useMutation({
    mutationFn: () =>
      crearAsignacion({
        empleado: Number(empleado),
        turno: Number(turno),
        desde,
        hasta: hasta || null,
      }),
    onSuccess: (a) => {
      queryClient.invalidateQueries({ queryKey: ['asistencia'] })
      toast.success('Turno asignado', `${a.empleado_nombre} trabaja en «${a.turno_nombre}».`)
      onClose()
    },
    onError: (e: Error) => toast.error('No se pudo asignar', e.message),
  })

  const valido = empleado !== '' && turno !== '' && desde !== ''

  return (
    <Modal open={abierto} onClose={onClose} size="md">
      <div className="p-5 sm:p-6">
        <h3 className="text-lg font-semibold text-ink-950">Asignar turno</h3>
        <p className="mt-1 text-sm text-ink-500">
          Desde esa fecha, los días del empleado se comparan contra este horario.
        </p>

        <div className="mt-5 space-y-4">
          <Select
            label="Empleado"
            placeholder="Elegir empleado…"
            searchable
            value={empleado}
            onChange={setEmpleado}
            options={empleados.map((e) => ({ value: String(e.id), label: e.nombre_completo }))}
          />
          <Select
            label="Turno"
            placeholder="Elegir turno…"
            value={turno}
            onChange={setTurno}
            options={turnos.map((t) => ({ value: String(t.id), label: t.nombre }))}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Desde</label>
              <Input
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                className="tnum"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">
                Hasta <span className="font-normal text-ink-400">(opcional)</span>
              </label>
              <Input
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                className="tnum"
              />
            </div>
          </div>
          <p className="text-xs text-ink-400">
            Dejá «hasta» vacío si es el turno actual. Para cambiarle el turno a alguien, cerrá el
            anterior con una fecha y creá uno nuevo: así el histórico se sigue calculando bien.
          </p>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => guardar.mutate()} disabled={!valido || guardar.isPending}>
            {guardar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Asignar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
