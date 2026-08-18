import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Loader2, MapPin, Pencil, Plus, Trash2 } from 'lucide-react'
import type { AsignacionSucursal } from '@/types'
import {
  actualizarAsignacionSucursal,
  crearAsignacionSucursal,
  eliminarAsignacionSucursal,
  listarAsignacionesSucursal,
} from '@/services/asistencia'
import { listarEmpleados } from '@/services/empleados'
import { listarSucursales } from '@/services/sucursales'
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
import { DIAS_SEMANA, fechaLocalISO } from '@/components/asistencia/constantes'
import { fecha as fechaCorta } from '@/lib/format'
import { cn, ctStagger } from '@/lib/utils'

/** `[0, 1]` → `Lun y Mar`. Vacío = todos los días. */
function etiquetaDias(dias: number[]): string {
  if (dias.length === 0 || dias.length === 7) return 'Todos los días'
  const nombres = [...dias]
    .sort((a, b) => a - b)
    .map((d) => DIAS_SEMANA.find((x) => x.valor === d)?.corto ?? String(d))
  if (nombres.length === 1) return nombres[0]
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}

/** Cuán específica es una fila: la más corta manda (igual que en el backend). */
function esExcepcion(a: AsignacionSucursal): boolean {
  return a.hasta !== null
}

/**
 * Dónde se espera a cada empleado, y qué día.
 *
 * `Empleado.sucursal` alcanza para quien siempre está en el mismo local. Esta
 * sección es para el resto: quien cubre otra sucursal unos días, o parte la
 * semana entre dos. Con esto cargado, el resumen puede avisar cuando alguien
 * fichó en un local que no era el suyo.
 */
export function SucursalesSeccion() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()

  const [editando, setEditando] = useState<AsignacionSucursal | null | 'nueva'>(null)

  const { data: asignaciones = [], isLoading } = useQuery({
    queryKey: ['asistencia', 'sucursales-empleado'],
    queryFn: () => listarAsignacionesSucursal(),
  })

  const borrar = useMutation({
    mutationFn: (id: number) => eliminarAsignacionSucursal(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asistencia'] })
      toast.success(
        'Asignación eliminada',
        'Esos días vuelven a esperarse en la sucursal de siempre del empleado.',
      )
    },
    onError: (e: Error) => toast.error('No se pudo eliminar', e.message),
  })

  const { fijas, excepciones } = useMemo(() => {
    const f: AsignacionSucursal[] = []
    const e: AsignacionSucursal[] = []
    for (const a of asignaciones) (esExcepcion(a) ? e : f).push(a)
    return { fijas: f, excepciones: e }
  }, [asignaciones])

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3 px-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-400">
          Dónde trabaja cada uno
        </h3>
        <Button size="sm" variant="outline" onClick={() => setEditando('nueva')}>
          <Plus className="h-4 w-4" />
          Asignar sucursal
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-32 rounded-2xl" />
      ) : asignaciones.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Cada uno trabaja en su sucursal de siempre"
          description="Alcanza mientras nadie rote. Cargá una asignación cuando alguien tenga que estar en otro local: unos días para cubrir a un compañero, o partiendo la semana entre dos sucursales."
          action={
            <Button onClick={() => setEditando('nueva')}>
              <Plus className="h-4 w-4" />
              Asignar sucursal
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {[
            { titulo: 'Asignaciones vigentes', filas: fijas },
            { titulo: 'Excepciones con fecha de fin', filas: excepciones },
          ]
            .filter((g) => g.filas.length > 0)
            .map((grupo) => (
              <div key={grupo.titulo}>
                {excepciones.length > 0 && fijas.length > 0 && (
                  <p className="mb-1.5 px-1 text-[11px] font-medium uppercase tracking-wide text-ink-400">
                    {grupo.titulo}
                  </p>
                )}
                <Card className="overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-400">
                          <th className="px-4 py-2.5 font-semibold">Empleado</th>
                          <th className="px-4 py-2.5 font-semibold">Sucursal</th>
                          <th className="px-4 py-2.5 font-semibold">Días</th>
                          <th className="px-4 py-2.5 font-semibold">Vigencia</th>
                          <th className="w-20 px-2 py-2.5" aria-label="Acciones" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {grupo.filas.map((a, i) => (
                          <tr key={a.id} className="ct-stagger-fade" style={ctStagger(i)}>
                            <td className="px-4 py-3 font-medium text-ink-950">
                              {a.empleado_nombre}
                              {a.motivo && (
                                <span className="block text-xs font-normal text-ink-400">
                                  {a.motivo}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-ink-600">
                              <span className="inline-flex items-center gap-1.5">
                                <MapPin className="h-3.5 w-3.5 text-ink-400" strokeWidth={1.85} />
                                {a.sucursal_nombre}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-ink-600">
                              {a.todos_los_dias ? (
                                <span className="text-ink-400">Todos</span>
                              ) : (
                                etiquetaDias(a.dias_semana)
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
                                aria-label={`Editar la sucursal de ${a.empleado_nombre}`}
                                onClick={() => setEditando(a)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Eliminar la asignación de ${a.empleado_nombre}`}
                                onClick={async () => {
                                  const ok = await confirm({
                                    title: '¿Eliminar la asignación?',
                                    description: `${a.empleado_nombre} deja de esperarse en ${a.sucursal_nombre}.`,
                                    confirmLabel: 'Eliminar',
                                    tone: 'danger',
                                  })
                                  if (ok === true) borrar.mutate(a.id)
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
              </div>
            ))}
        </div>
      )}

      <AsignarSucursalModal
        asignacion={editando === 'nueva' ? null : editando}
        abierto={editando !== null}
        onClose={() => setEditando(null)}
      />
    </section>
  )
}

// --- Alta y edición ----------------------------------------------------------

function AsignarSucursalModal({
  asignacion,
  abierto,
  onClose,
}: {
  asignacion: AsignacionSucursal | null
  abierto: boolean
  onClose: () => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()

  const [empleado, setEmpleado] = useState('')
  const [sucursal, setSucursal] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [dias, setDias] = useState<number[]>([])
  const [motivo, setMotivo] = useState('')

  const { data: empleados = [] } = useQuery({
    queryKey: ['empleados'],
    queryFn: listarEmpleados,
    enabled: abierto,
  })
  const { data: sucursales = [] } = useQuery({
    queryKey: ['sucursales'],
    queryFn: listarSucursales,
    enabled: abierto,
  })

  useEffect(() => {
    if (!abierto) return
    setEmpleado(asignacion ? String(asignacion.empleado) : '')
    setSucursal(asignacion ? String(asignacion.sucursal) : '')
    setDesde(asignacion ? asignacion.desde : fechaLocalISO(new Date()))
    setHasta(asignacion?.hasta ?? '')
    setDias(asignacion ? asignacion.dias_semana : [])
    setMotivo(asignacion?.motivo ?? '')
  }, [abierto, asignacion])

  const guardar = useMutation({
    mutationFn: () => {
      const datos = {
        empleado: Number(empleado),
        sucursal: Number(sucursal),
        desde,
        hasta: hasta || null,
        dias_semana: dias,
        motivo: motivo.trim(),
      }
      return asignacion
        ? actualizarAsignacionSucursal(asignacion.id, datos)
        : crearAsignacionSucursal(datos)
    },
    onSuccess: (a) => {
      queryClient.invalidateQueries({ queryKey: ['asistencia'] })
      toast.success(
        asignacion ? 'Asignación actualizada' : 'Sucursal asignada',
        `${a.empleado_nombre} se espera en ${a.sucursal_nombre}.`,
      )
      onClose()
    },
    onError: (e: Error) => toast.error('No se pudo guardar', e.message),
  })

  const alternarDia = (valor: number) =>
    setDias((previos) =>
      previos.includes(valor) ? previos.filter((d) => d !== valor) : [...previos, valor],
    )

  const nombreSucursal = sucursales.find((s) => String(s.id) === sucursal)?.nombre ?? 'esa sucursal'
  const valido = empleado !== '' && sucursal !== '' && desde !== ''

  return (
    <Modal open={abierto} onClose={onClose} size="md">
      <div className="min-h-0 overflow-y-auto p-5 sm:p-6">
        <h3 className="text-lg font-semibold text-ink-950">
          {asignacion ? 'Editar asignación' : 'Asignar sucursal'}
        </h3>
        <p className="mt-1 text-sm text-ink-500">
          Dónde se espera a esta persona. Sirve para quien rota entre locales: con esto cargado, el
          resumen avisa si fichó en una sucursal que no era la suya.
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
            label="Sucursal"
            placeholder="Elegir sucursal…"
            value={sucursal}
            onChange={setSucursal}
            options={sucursales.map((s) => ({ value: String(s.id), label: s.nombre }))}
          />

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">
              Días <span className="font-normal text-ink-400">(ninguno = todos)</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {DIAS_SEMANA.map((d) => {
                const activo = dias.includes(d.valor)
                return (
                  <button
                    key={d.valor}
                    type="button"
                    aria-pressed={activo}
                    onClick={() => alternarDia(d.valor)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900',
                      activo
                        ? 'border-ink-950 bg-ink-950 text-on-ink'
                        : 'border-line bg-surface text-ink-500 hover:border-line-strong hover:text-ink-900',
                    )}
                  >
                    {d.corto}
                  </button>
                )
              })}
            </div>
            <p className="mt-1.5 text-[11px] text-ink-400">
              Para partir la semana entre dos locales, cargá dos asignaciones: una con los días de
              una sucursal y otra con los de la otra.
            </p>
          </div>

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

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">
              Motivo <span className="font-normal text-ink-400">(opcional)</span>
            </label>
            <Input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Cubre la licencia de Mili"
              maxLength={200}
            />
          </div>

          <div className="rounded-xl border border-line bg-ink-50 p-3 text-xs text-ink-500">
            <p className="font-medium text-ink-700">
              {hasta
                ? `Del ${fechaCorta(desde)} al ${fechaCorta(hasta)}`
                : `Desde el ${fechaCorta(desde)}, sin fecha de fin`}
              {' · '}
              {etiquetaDias(dias)} en {nombreSucursal}.
            </p>
            <p className="mt-1">
              Las asignaciones se pueden superponer a propósito:{' '}
              <strong>gana siempre la más puntual</strong>. Un reemplazo de tres días le gana a la
              regla permanente, y al terminar, todo vuelve solo a como estaba.
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => guardar.mutate()} disabled={!valido || guardar.isPending}>
            {guardar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
