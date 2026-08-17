import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Palmtree, Pencil, Plus, Trash2 } from 'lucide-react'
import type { LicenciaAsistencia, TipoLicencia } from '@/types'
import {
  actualizarLicencia,
  crearLicencia,
  eliminarLicencia,
  listarLicencias,
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
import { Textarea } from '@/components/ui/Textarea'
import { FeriadosSeccion } from '@/components/asistencia/FeriadosSeccion'
import { TIPOS_LICENCIA, duracion, fechaLocalISO, hhmm } from '@/components/asistencia/constantes'
import { fecha as fechaCorta } from '@/lib/format'
import { cn, ctStagger } from '@/lib/utils'

const TONO_TIPO: Record<TipoLicencia, string> = {
  vacaciones: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300',
  enfermedad: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-300',
  especial: 'border-line bg-ink-50 text-ink-700',
  franco: 'border-line bg-ink-50 text-ink-700',
  suspension: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300',
  otro: 'border-line bg-ink-50 text-ink-700',
}

/** Minutos entre dos horas `HH:MM`. */
function minutosFranja(desde: string, hasta: string): number {
  const [hd, md] = desde.split(':').map(Number)
  const [hh, mh] = hasta.split(':').map(Number)
  return hh * 60 + mh - (hd * 60 + md)
}

/** ¿La licencia está corriendo hoy? */
function vigenteHoy(l: LicenciaAsistencia): boolean {
  const hoy = fechaLocalISO(new Date())
  return l.desde <= hoy && hoy <= l.hasta
}

export function LicenciasTab() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()

  const [editando, setEditando] = useState<LicenciaAsistencia | null | 'nueva'>(null)
  const [tipo, setTipo] = useState('')
  const [empleado, setEmpleado] = useState('')

  const { data: licencias = [], isLoading } = useQuery({
    queryKey: ['asistencia', 'licencias', tipo, empleado],
    queryFn: () =>
      listarLicencias({ tipo, empleado: empleado ? Number(empleado) : '' }),
  })
  const { data: empleados = [] } = useQuery({ queryKey: ['empleados'], queryFn: listarEmpleados })

  const borrar = useMutation({
    mutationFn: (id: number) => eliminarLicencia(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asistencia'] })
      toast.success('Licencia eliminada', 'Esos días vuelven a contarse como ausencia.')
    },
    onError: (e: Error) => toast.error('No se pudo eliminar', e.message),
  })

  const { vigentes, resto } = useMemo(() => {
    const v: LicenciaAsistencia[] = []
    const r: LicenciaAsistencia[] = []
    for (const l of licencias) (vigenteHoy(l) ? v : r).push(l)
    return { vigentes: v, resto: r }
  }, [licencias])

  return (
    <div className="space-y-6">
      <FeriadosSeccion />

      <div className="border-t border-line pt-6">
        <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-400">
          Licencias
        </h3>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-52 flex-1">
            <Select
              placeholder="Todos los empleados"
              searchable
              value={empleado}
              onChange={setEmpleado}
              options={[
                { value: '', label: 'Todos los empleados' },
                ...empleados.map((e) => ({ value: String(e.id), label: e.nombre_completo })),
              ]}
            />
          </div>
          <div className="min-w-48 flex-1">
            <Select
              placeholder="Todos los tipos"
              value={tipo}
              onChange={setTipo}
              options={[{ value: '', label: 'Todos los tipos' }, ...TIPOS_LICENCIA]}
            />
          </div>
          <Button onClick={() => setEditando('nueva')}>
            <Plus className="h-4 w-4" />
            Cargar licencia
          </Button>
        </div>
      </Card>

      {isLoading ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : licencias.length === 0 ? (
        <EmptyState
          icon={Palmtree}
          title="Sin licencias cargadas"
          description="Cargá vacaciones, enfermedad o francos para que esos días no cuenten como ausencia en el resumen."
          action={
            <Button onClick={() => setEditando('nueva')}>
              <Plus className="h-4 w-4" />
              Cargar la primera
            </Button>
          }
        />
      ) : (
        <>
          {vigentes.length > 0 && (
            <section>
              <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-400">
                En curso ahora
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {vigentes.map((l, i) => (
                  <TarjetaLicencia
                    key={l.id}
                    licencia={l}
                    indice={i}
                    destacada
                    onEditar={() => setEditando(l)}
                    onBorrar={async () => {
                      const ok = await confirm({
                        title: '¿Eliminar la licencia?',
                        description: `${l.empleado_nombre} · ${l.tipo_display}. Esos días vuelven a contarse como ausencia.`,
                        confirmLabel: 'Eliminar',
                        tone: 'danger',
                      })
                      if (ok === true) borrar.mutate(l.id)
                    }}
                  />
                ))}
              </div>
            </section>
          )}

          {resto.length > 0 && (
            <section>
              <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-400">
                {vigentes.length > 0 ? 'Otras' : 'Licencias'}
              </h3>
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-400">
                        <th className="px-4 py-2.5 font-semibold">Empleado</th>
                        <th className="px-4 py-2.5 font-semibold">Tipo</th>
                        <th className="px-4 py-2.5 font-semibold">Período</th>
                        <th className="px-4 py-2.5 text-right font-semibold">Días</th>
                        <th className="w-24 px-2 py-2.5" aria-label="Acciones" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {resto.map((l, i) => (
                        <tr key={l.id} className="ct-stagger-fade" style={ctStagger(i)}>
                          <td className="px-4 py-3 font-medium text-ink-950">
                            {l.empleado_nombre}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={cn(
                                'inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium',
                                TONO_TIPO[l.tipo],
                              )}
                            >
                              {l.tipo_display}
                            </span>
                          </td>
                          <td className="tnum px-4 py-3 text-ink-600">
                            {fechaCorta(l.desde)} → {fechaCorta(l.hasta)}
                            {!l.jornada_completa && l.hora_desde && (
                              <span className="ml-2 text-xs text-ink-400">
                                {hhmm(l.hora_desde)}–{hhmm(l.hora_hasta ?? '')}
                              </span>
                            )}
                          </td>
                          <td className="tnum px-4 py-3 text-right text-ink-900">
                            {l.jornada_completa ? l.dias : 'parcial'}
                          </td>
                          <td className="px-2 py-3">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Editar licencia de ${l.empleado_nombre}`}
                                onClick={() => setEditando(l)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Eliminar licencia de ${l.empleado_nombre}`}
                                onClick={async () => {
                                  const ok = await confirm({
                                    title: '¿Eliminar la licencia?',
                                    description: `${l.empleado_nombre} · ${l.tipo_display}. Esos días vuelven a contarse como ausencia.`,
                                    confirmLabel: 'Eliminar',
                                    tone: 'danger',
                                  })
                                  if (ok === true) borrar.mutate(l.id)
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </section>
          )}
        </>
      )}

      <LicenciaModal
        licencia={editando === 'nueva' ? null : editando}
        abierto={editando !== null}
        onClose={() => setEditando(null)}
      />
    </div>
  )
}

function TarjetaLicencia({
  licencia,
  indice,
  destacada,
  onEditar,
  onBorrar,
}: {
  licencia: LicenciaAsistencia
  indice: number
  destacada?: boolean
  onEditar: () => void
  onBorrar: () => void
}) {
  return (
    <Card
      className={cn('ct-stagger-item p-4', destacada && 'ring-1 ring-sky-200 dark:ring-sky-900')}
      style={ctStagger(indice)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink-950">{licencia.empleado_nombre}</p>
          <span
            className={cn(
              'mt-1 inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium',
              TONO_TIPO[licencia.tipo],
            )}
          >
            {licencia.tipo_display}
          </span>
        </div>
        <Badge tone="soft" className="tnum shrink-0">
          {licencia.jornada_completa ? `${licencia.dias} d` : 'parcial'}
        </Badge>
      </div>
      <p className="tnum mt-2 text-xs text-ink-500">
        {fechaCorta(licencia.desde)} → {fechaCorta(licencia.hasta)}
      </p>
      {!licencia.jornada_completa && licencia.hora_desde && (
        <p className="tnum mt-0.5 text-xs text-ink-400">
          Solo de {hhmm(licencia.hora_desde)} a {hhmm(licencia.hora_hasta ?? '')}
        </p>
      )}
      {licencia.observacion && (
        <p className="mt-1 line-clamp-2 text-xs text-ink-400">{licencia.observacion}</p>
      )}
      <div className="mt-3 flex justify-end gap-1">
        <Button variant="ghost" size="icon" aria-label="Editar" onClick={onEditar}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Eliminar" onClick={onBorrar}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  )
}

function LicenciaModal({
  licencia,
  abierto,
  onClose,
}: {
  licencia: LicenciaAsistencia | null
  abierto: boolean
  onClose: () => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()

  const [empleado, setEmpleado] = useState('')
  const [tipo, setTipo] = useState<TipoLicencia>('vacaciones')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [completa, setCompleta] = useState(true)
  const [horaDesde, setHoraDesde] = useState('09:00')
  const [horaHasta, setHoraHasta] = useState('13:00')
  const [observacion, setObservacion] = useState('')

  const { data: empleados = [] } = useQuery({
    queryKey: ['empleados'],
    queryFn: listarEmpleados,
    enabled: abierto,
  })

  useEffect(() => {
    if (!abierto) return
    const hoy = fechaLocalISO(new Date())
    setEmpleado(licencia ? String(licencia.empleado) : '')
    setTipo(licencia?.tipo ?? 'vacaciones')
    setDesde(licencia?.desde ?? hoy)
    setHasta(licencia?.hasta ?? hoy)
    setCompleta(licencia?.jornada_completa ?? true)
    setHoraDesde(hhmm(licencia?.hora_desde ?? '') || '09:00')
    setHoraHasta(hhmm(licencia?.hora_hasta ?? '') || '13:00')
    setObservacion(licencia?.observacion ?? '')
  }, [abierto, licencia])

  const guardar = useMutation({
    mutationFn: () => {
      const cuerpo = {
        empleado: Number(empleado),
        tipo,
        desde,
        hasta,
        jornada_completa: completa,
        hora_desde: completa ? null : horaDesde,
        hora_hasta: completa ? null : horaHasta,
        observacion: observacion.trim(),
      }
      return licencia ? actualizarLicencia(licencia.id, cuerpo) : crearLicencia(cuerpo)
    },
    onSuccess: (l) => {
      queryClient.invalidateQueries({ queryKey: ['asistencia'] })
      toast.success(
        licencia ? 'Licencia actualizada' : 'Licencia cargada',
        `${l.empleado_nombre}: ${l.dias} día${l.dias === 1 ? '' : 's'} de ${l.tipo_display.toLowerCase()}.`,
      )
      onClose()
    },
    onError: (e: Error) => toast.error('No se pudo guardar', e.message),
  })

  const franjaValida = completa || horaHasta > horaDesde
  const valido =
    empleado !== '' && desde !== '' && hasta !== '' && hasta >= desde && franjaValida

  return (
    <Modal open={abierto} onClose={onClose} size="md">
      <div className="p-5 sm:p-6">
        <h3 className="text-lg font-semibold text-ink-950">
          {licencia ? 'Editar licencia' : 'Cargar licencia'}
        </h3>
        <p className="mt-1 text-sm text-ink-500">
          Durante estos días la persona no va a figurar como ausente en el resumen.
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
            label="Tipo"
            value={tipo}
            onChange={(v) => setTipo(v as TipoLicencia)}
            options={TIPOS_LICENCIA}
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
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Hasta</label>
              <Input
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                className="tnum"
              />
            </div>
          </div>
          {desde && hasta && hasta < desde && (
            <p className="text-xs text-red-600 dark:text-red-400">
              La fecha «hasta» no puede ser anterior a «desde».
            </p>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Alcance del día</label>
            <div className="flex gap-1.5">
              {[
                { valor: true, label: 'Día completo' },
                { valor: false, label: 'Por horas' },
              ].map((opcion) => (
                <button
                  key={String(opcion.valor)}
                  type="button"
                  onClick={() => setCompleta(opcion.valor)}
                  className={cn(
                    'rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900',
                    completa === opcion.valor
                      ? 'border-ink-950 bg-ink-950 text-on-ink'
                      : 'border-line text-ink-500 hover:border-line-strong hover:text-ink-900',
                  )}
                >
                  {opcion.label}
                </button>
              ))}
            </div>
          </div>

          {!completa && (
            <div className="rounded-xl border border-line bg-ink-50 p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-ink-700">Desde</label>
                  <Input
                    type="time"
                    value={horaDesde}
                    onChange={(e) => setHoraDesde(e.target.value)}
                    className="tnum"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-ink-700">Hasta</label>
                  <Input
                    type="time"
                    value={horaHasta}
                    onChange={(e) => setHoraHasta(e.target.value)}
                    className="tnum"
                  />
                </div>
              </div>
              {franjaValida ? (
                <p className="mt-2 text-[11px] text-ink-400">
                  Se descuentan {duracion(minutosFranja(horaDesde, horaHasta))} del horario
                  esperado. El resto del día se sigue esperando: si no viene, figura ausente.
                </p>
              ) : (
                <p className="mt-2 text-[11px] text-red-600 dark:text-red-400">
                  La hora «hasta» tiene que ser posterior a «desde».
                </p>
              )}
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">
              Observación <span className="font-normal text-ink-400">(opcional)</span>
            </label>
            <Textarea
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              rows={2}
              placeholder="Certificado médico, licencia por estudio…"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => guardar.mutate()} disabled={!valido || guardar.isPending}>
            {guardar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {licencia ? 'Guardar cambios' : 'Cargar licencia'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
