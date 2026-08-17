import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CalendarClock,
  Copy,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react'
import type { AsignacionTurno, TipoCicloTurno, TramoTurno, TurnoAsistencia } from '@/types'
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
import { DIAS_SEMANA, duracion, fechaLocalISO, hhmm } from '@/components/asistencia/constantes'
import { fecha as fechaCorta } from '@/lib/format'
import { cn, ctStagger } from '@/lib/utils'

const MAX_FRANJAS = 3

/** Un bloque horario dentro de un día del patrón. */
interface FranjaEditor {
  entrada: string
  salida: string
}

/** Un día del patrón: semanal (lunes…domingo) o rotativo (día 1…N). */
interface DiaEditor {
  activo: boolean
  franjas: FranjaEditor[]
}

const FRANJA_DEFECTO: FranjaEditor = { entrada: '09:00', salida: '18:00' }

function diaVacio(): DiaEditor {
  return { activo: false, franjas: [{ ...FRANJA_DEFECTO }] }
}

/**
 * Convierte los tramos guardados al editor conservando TODAS las franjas
 * (un día puede tener mañana y tarde: jornada partida).
 */
function tramosADias(tramos: TramoTurno[], cantidad: number): DiaEditor[] {
  return Array.from({ length: cantidad }, (_, indice) => {
    const franjas = tramos
      .filter((t) => t.indice_dia === indice)
      .sort((a, b) => a.hora_entrada.localeCompare(b.hora_entrada))
      .map((t) => ({ entrada: hhmm(t.hora_entrada), salida: hhmm(t.hora_salida) }))
    return franjas.length ? { activo: true, franjas } : diaVacio()
  })
}

function nombreDelDia(indice: number, tipo: TipoCicloTurno): string {
  return tipo === 'rotativo' ? `Día ${indice + 1}` : DIAS_SEMANA[indice].largo
}

/** Resumen legible del patrón de un turno, para la tarjeta del listado. */
function etiquetaPatron(turno: TurnoAsistencia): string {
  if (turno.tipo_ciclo !== 'rotativo') return 'Semanal'
  const trabajados = new Set(turno.tramos.map((t) => t.indice_dia)).size
  return `Rotativo · ciclo de ${turno.dias_ciclo} días (${trabajados} de trabajo)`
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
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-400">Horarios</h3>
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
            description="Un turno define qué horario le corresponde a cada empleado. Puede repetirse por semana o ser rotativo (2x2, 4x2, semana A / semana B)."
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
              <TarjetaTurno
                key={turno.id}
                turno={turno}
                indice={i}
                onEditar={() => setEditando(turno)}
                onBorrar={async () => {
                  const ok = await confirm({
                    title: `¿Eliminar «${turno.nombre}»?`,
                    description: 'Los días ya calculados dejan de compararse contra este horario.',
                    confirmLabel: 'Eliminar',
                    tone: 'danger',
                  })
                  if (ok === true) borrarTurno.mutate(turno.id)
                }}
              />
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
                      <td className="px-4 py-3 text-ink-600">
                        {a.turno_nombre}
                        {a.desfase_ciclo > 0 && (
                          <Badge tone="outline" className="ml-2 tnum">
                            desfase {a.desfase_ciclo}
                          </Badge>
                        )}
                      </td>
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
                              description: `${a.empleado_nombre} deja de tener «${a.turno_nombre}».`,
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
      <AsignarTurnoModal abierto={asignando} turnos={turnos} onClose={() => setAsignando(false)} />
    </div>
  )
}

// --- Tarjeta del listado -----------------------------------------------------

function TarjetaTurno({
  turno,
  indice,
  onEditar,
  onBorrar,
}: {
  turno: TurnoAsistencia
  indice: number
  onEditar: () => void
  onBorrar: () => void
}) {
  const rotativo = turno.tipo_ciclo === 'rotativo'
  const cantidad = rotativo ? turno.dias_ciclo : 7

  return (
    <Card className="ct-stagger-item p-4" style={ctStagger(indice)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="flex items-center gap-2 font-semibold text-ink-950">
            {turno.nombre}
            {rotativo && (
              <Badge tone="soft" className="gap-1">
                <RefreshCw className="h-3 w-3" aria-hidden />
                rotativo
              </Badge>
            )}
          </h4>
          <p className="tnum mt-0.5 text-xs text-ink-400">
            {etiquetaPatron(turno)} · {duracion(turno.minutos_semanales)} por vuelta ·{' '}
            {turno.empleados_asignados} empleado{turno.empleados_asignados === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!turno.activo && <Badge tone="outline">Inactivo</Badge>}
          <Button variant="ghost" size="icon" aria-label={`Editar ${turno.nombre}`} onClick={onEditar}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label={`Eliminar ${turno.nombre}`} onClick={onBorrar}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div
        className="mt-3 grid gap-1"
        style={{ gridTemplateColumns: `repeat(${Math.min(cantidad, 7)}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: cantidad }, (_, i) => {
          const franjas = turno.tramos
            .filter((t) => t.indice_dia === i)
            .sort((a, b) => a.hora_entrada.localeCompare(b.hora_entrada))
          const trabaja = franjas.length > 0
          return (
            <div
              key={i}
              className={cn(
                'rounded-lg border px-1 py-1.5 text-center',
                trabaja ? 'border-line bg-ink-50' : 'border-dashed border-line',
              )}
              title={
                trabaja
                  ? franjas.map((t) => `${hhmm(t.hora_entrada)}-${hhmm(t.hora_salida)}`).join(' / ')
                  : 'Franco'
              }
            >
              <p className={cn('text-[11px] font-medium', trabaja ? 'text-ink-900' : 'text-ink-300')}>
                {rotativo ? i + 1 : DIAS_SEMANA[i].corto}
              </p>
              {trabaja ? (
                franjas.map((t, k) => (
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
        Tolerancia: {turno.tolerancia_entrada} min al entrar · {turno.tolerancia_salida} min al salir
        {rotativo && turno.fecha_inicio_ciclo
          ? ` · ciclo desde ${fechaCorta(turno.fecha_inicio_ciclo)}`
          : ''}
      </p>
    </Card>
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
  const [tipoCiclo, setTipoCiclo] = useState<TipoCicloTurno>('semanal')
  const [diasCiclo, setDiasCiclo] = useState('4')
  const [inicioCiclo, setInicioCiclo] = useState('')
  const [dias, setDias] = useState<DiaEditor[]>(() => DIAS_SEMANA.map(diaVacio))
  const [tolEntrada, setTolEntrada] = useState('10')
  const [tolSalida, setTolSalida] = useState('10')
  const [antirebote, setAntirebote] = useState('2')

  const cantidad = tipoCiclo === 'rotativo' ? Math.max(2, Math.min(60, Number(diasCiclo) || 2)) : 7

  useEffect(() => {
    if (!abierto) return
    const tipo = turno?.tipo_ciclo ?? 'semanal'
    const largo = tipo === 'rotativo' ? (turno?.dias_ciclo ?? 4) : 7
    setNombre(turno?.nombre ?? '')
    setTipoCiclo(tipo)
    setDiasCiclo(String(turno?.dias_ciclo ?? 4))
    setInicioCiclo(turno?.fecha_inicio_ciclo ?? fechaLocalISO(new Date()))
    setDias(
      turno
        ? tramosADias(turno.tramos, largo)
        : DIAS_SEMANA.map((d) => ({
            activo: d.valor <= 4,
            franjas: [{ ...FRANJA_DEFECTO }],
          })),
    )
    setTolEntrada(String(turno?.tolerancia_entrada ?? 10))
    setTolSalida(String(turno?.tolerancia_salida ?? 10))
    setAntirebote(String(turno?.minutos_antirebote ?? 2))
  }, [abierto, turno])

  // Al cambiar el largo del patrón, conservamos lo que ya estaba cargado.
  useEffect(() => {
    setDias((prev) => {
      if (prev.length === cantidad) return prev
      const siguiente = Array.from({ length: cantidad }, (_, i) => prev[i] ?? diaVacio())
      return siguiente
    })
  }, [cantidad])

  const cambiarDia = (indice: number, cambios: Partial<DiaEditor>) =>
    setDias((prev) => prev.map((d, i) => (i === indice ? { ...d, ...cambios } : d)))

  const cambiarFranja = (dia: number, franja: number, cambios: Partial<FranjaEditor>) =>
    setDias((prev) =>
      prev.map((d, i) =>
        i === dia
          ? { ...d, franjas: d.franjas.map((fr, k) => (k === franja ? { ...fr, ...cambios } : fr)) }
          : d,
      ),
    )

  const agregarFranja = (dia: number) =>
    setDias((prev) =>
      prev.map((d, i) =>
        i === dia && d.franjas.length < MAX_FRANJAS
          ? { ...d, franjas: [...d.franjas, { entrada: '17:00', salida: '21:00' }] }
          : d,
      ),
    )

  const quitarFranja = (dia: number, franja: number) =>
    setDias((prev) =>
      prev.map((d, i) =>
        i === dia && d.franjas.length > 1
          ? { ...d, franjas: d.franjas.filter((_, k) => k !== franja) }
          : d,
      ),
    )

  const copiarATodos = () => {
    const primero = dias.find((d) => d.activo)
    if (!primero) return
    setDias((prev) =>
      prev.map((d) =>
        d.activo ? { ...d, franjas: primero.franjas.map((fr) => ({ ...fr })) } : d,
      ),
    )
    toast.info('Horario copiado', 'Se aplicó a todos los días activos del patrón.')
  }

  const guardar = useMutation({
    mutationFn: () => {
      const tramos: TramoTurno[] = dias.flatMap((d, indice) =>
        d.activo
          ? d.franjas.map((fr) => ({
              indice_dia: indice,
              hora_entrada: fr.entrada,
              hora_salida: fr.salida,
            }))
          : [],
      )
      const cuerpo = {
        nombre: nombre.trim(),
        tipo_ciclo: tipoCiclo,
        dias_ciclo: cantidad,
        fecha_inicio_ciclo: tipoCiclo === 'rotativo' ? inicioCiclo : null,
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
  const valido =
    nombre.trim() !== '' && algunDia && (tipoCiclo === 'semanal' || inicioCiclo !== '')

  const totalMinutos = useMemo(
    () =>
      dias.reduce((total, d) => {
        if (!d.activo) return total
        return (
          total +
          d.franjas.reduce((suma, fr) => {
            const [he, me] = fr.entrada.split(':').map(Number)
            const [hs, ms] = fr.salida.split(':').map(Number)
            const inicio = he * 60 + me
            const fin = hs * 60 + ms
            return suma + (fin > inicio ? fin - inicio : fin + 24 * 60 - inicio)
          }, 0)
        )
      }, 0),
    [dias],
  )

  return (
    <Modal open={abierto} onClose={onClose} size="lg">
      <div className="p-5 sm:p-6">
        <h3 className="text-lg font-semibold text-ink-950">
          {turno ? `Editar «${turno.nombre}»` : 'Nuevo turno'}
        </h3>
        <p className="mt-1 text-sm text-ink-500">
          Marcá los días que se trabaja y su horario. Los días sin marcar son franco.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Nombre del turno</label>
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Comercio 9 a 18"
            />
          </div>
          <Select
            label="Se repite"
            value={tipoCiclo}
            onChange={(v) => setTipoCiclo(v as TipoCicloTurno)}
            options={[
              { value: 'semanal', label: 'Cada semana (lunes a domingo)' },
              { value: 'rotativo', label: 'Cada N días (rotativo)' },
            ]}
          />
        </div>

        {tipoCiclo === 'rotativo' && (
          <div className="mt-3 grid gap-3 rounded-xl border border-line bg-ink-50 p-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-700">
                Días del ciclo
              </label>
              <Input
                type="number"
                min={2}
                max={60}
                value={diasCiclo}
                onChange={(e) => setDiasCiclo(e.target.value)}
                className="tnum"
              />
              <p className="mt-1 text-[11px] text-ink-400">
                2x2 → 4 · 4x2 → 6 · semana A/B → 14
              </p>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-700">
                El ciclo arranca el
              </label>
              <Input
                type="date"
                value={inicioCiclo}
                onChange={(e) => setInicioCiclo(e.target.value)}
                className="tnum"
              />
              <p className="mt-1 text-[11px] text-ink-400">Ese día es el «Día 1» del patrón.</p>
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm font-medium text-ink-700">
            Patrón {tipoCiclo === 'rotativo' ? `de ${cantidad} días` : 'semanal'}
          </p>
          <div className="flex items-center gap-2">
            <span className="tnum text-xs text-ink-400">{duracion(totalMinutos)} por vuelta</span>
            <Button variant="ghost" size="sm" onClick={copiarATodos} disabled={!algunDia}>
              <Copy className="h-3.5 w-3.5" />
              Copiar a todos
            </Button>
          </div>
        </div>

        <div className="mt-2 max-h-80 space-y-1.5 overflow-y-auto pr-1">
          {dias.map((dia, i) => (
            <div
              key={i}
              className={cn(
                'rounded-xl border px-3 py-2',
                dia.activo ? 'border-line bg-surface' : 'border-dashed border-line bg-ink-50',
              )}
            >
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex w-28 shrink-0 cursor-pointer select-none items-center gap-2 text-sm text-ink-700">
                  <input
                    type="checkbox"
                    checked={dia.activo}
                    onChange={(e) => cambiarDia(i, { activo: e.target.checked })}
                    className="h-4 w-4 rounded border-line-strong accent-ink-950"
                  />
                  {nombreDelDia(i, tipoCiclo)}
                </label>

                {dia.activo ? (
                  <div className="flex flex-1 flex-col gap-1.5">
                    {dia.franjas.map((fr, k) => (
                      <div key={k} className="flex items-center gap-2">
                        <Input
                          type="time"
                          value={fr.entrada}
                          onChange={(e) => cambiarFranja(i, k, { entrada: e.target.value })}
                          className="tnum h-9 w-32"
                        />
                        <span className="text-ink-400">a</span>
                        <Input
                          type="time"
                          value={fr.salida}
                          onChange={(e) => cambiarFranja(i, k, { salida: e.target.value })}
                          className="tnum h-9 w-32"
                        />
                        {dia.franjas.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Quitar franja"
                            onClick={() => quitarFranja(i, k)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                    {dia.franjas.length < MAX_FRANJAS && (
                      <button
                        type="button"
                        onClick={() => agregarFranja(i)}
                        className="self-start text-xs font-medium text-ink-500 underline-offset-4 hover:text-ink-900 hover:underline"
                      >
                        + Agregar franja (cierra al mediodía)
                      </button>
                    )}
                  </div>
                ) : (
                  <span className="text-sm text-ink-400">Franco</span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <CampoNumero etiqueta="Tolerancia al entrar (min)" valor={tolEntrada} onChange={setTolEntrada} />
          <CampoNumero etiqueta="Tolerancia al salir (min)" valor={tolSalida} onChange={setTolSalida} />
          <CampoNumero etiqueta="Anti-rebote (min)" valor={antirebote} onChange={setAntirebote} />
        </div>
        <p className="mt-1.5 text-[11px] text-ink-400">
          Anti-rebote: si el reloj lee el mismo rostro dos veces seguidas dentro de esos minutos, se
          cuenta una sola vez. Evita que una relectura invierta entrada y salida.
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

function CampoNumero({
  etiqueta,
  valor,
  onChange,
}: {
  etiqueta: string
  valor: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-ink-700">{etiqueta}</label>
      <Input
        type="number"
        inputMode="numeric"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="tnum"
      />
    </div>
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
  const [turnoId, setTurnoId] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [desfase, setDesfase] = useState('0')

  const { data: empleados = [] } = useQuery({
    queryKey: ['empleados'],
    queryFn: listarEmpleados,
    enabled: abierto,
  })

  const turnoElegido = turnos.find((t) => String(t.id) === turnoId)
  const esRotativo = turnoElegido?.tipo_ciclo === 'rotativo'

  useEffect(() => {
    if (!abierto) return
    setEmpleado('')
    setTurnoId(turnos[0] ? String(turnos[0].id) : '')
    setDesde(fechaLocalISO(new Date()))
    setHasta('')
    setDesfase('0')
  }, [abierto, turnos])

  const guardar = useMutation({
    mutationFn: () =>
      crearAsignacion({
        empleado: Number(empleado),
        turno: Number(turnoId),
        desde,
        hasta: hasta || null,
        desfase_ciclo: esRotativo ? Number(desfase) || 0 : 0,
      }),
    onSuccess: (a) => {
      queryClient.invalidateQueries({ queryKey: ['asistencia'] })
      toast.success('Turno asignado', `${a.empleado_nombre} trabaja en «${a.turno_nombre}».`)
      onClose()
    },
    onError: (e: Error) => toast.error('No se pudo asignar', e.message),
  })

  const valido = empleado !== '' && turnoId !== '' && desde !== ''

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
            value={turnoId}
            onChange={setTurnoId}
            options={turnos.map((t) => ({
              value: String(t.id),
              label: t.tipo_ciclo === 'rotativo' ? `${t.nombre} (rotativo)` : t.nombre,
            }))}
          />

          {esRotativo && (
            <div className="rounded-xl border border-line bg-ink-50 p-3">
              <label className="mb-1.5 block text-sm font-medium text-ink-700">
                Desfase en el ciclo
              </label>
              <Input
                type="number"
                min={0}
                max={(turnoElegido?.dias_ciclo ?? 1) - 1}
                value={desfase}
                onChange={(e) => setDesfase(e.target.value)}
                className="tnum"
              />
              <p className="mt-1 text-[11px] text-ink-400">
                Corre el patrón N días para esta persona. En un 2x2, poner <strong>2</strong> deja a
                dos empleados en fases opuestas: uno entra cuando el otro descansa.
              </p>
            </div>
          )}

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
