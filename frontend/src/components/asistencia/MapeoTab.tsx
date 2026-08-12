import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link2, Pencil, Trash2, UserRoundPlus, UserRoundSearch } from 'lucide-react'
import { eliminarMapeo, listarMapeos, numerosSinMapear } from '@/services/asistencia'
import { useConfirm } from '@/components/ConfirmProvider'
import { useToast } from '@/components/ToastProvider'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  AsignarNumeroModal,
  type DatosAsignacion,
} from '@/components/asistencia/AsignarNumeroModal'
import { num, tiempoRelativo } from '@/lib/format'
import { ctStagger } from '@/lib/utils'

/**
 * Vincula los números cargados en el reloj con los empleados del sistema.
 * Arriba: números detectados en fichadas que todavía no apuntan a nadie.
 * Abajo: las asignaciones vigentes.
 */
export function MapeoTab() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const [asignando, setAsignando] = useState<DatosAsignacion | null>(null)

  const { data: pendientes, isLoading: cargandoPendientes } = useQuery({
    queryKey: ['asistencia', 'sin-mapear'],
    queryFn: numerosSinMapear,
  })
  const { data: mapeos = [], isLoading: cargandoMapeos } = useQuery({
    queryKey: ['asistencia', 'mapeos'],
    queryFn: listarMapeos,
  })

  const borrar = useMutation({
    mutationFn: (id: number) => eliminarMapeo(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asistencia'] })
      toast.success('Asignación eliminada', 'Las próximas fichadas de ese número quedarán sin asignar.')
    },
    onError: (e: Error) => toast.error('No se pudo eliminar', e.message),
  })

  const sinAsignar = pendientes?.resultados ?? []

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-2 flex items-center justify-between gap-3 px-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-400">
            Números sin asignar
          </h3>
          <Button variant="outline" size="sm" onClick={() => setAsignando({})}>
            <UserRoundPlus className="h-4 w-4" />
            Asignar a mano
          </Button>
        </div>
        {cargandoPendientes ? (
          <Skeleton className="h-24 rounded-2xl" />
        ) : sinAsignar.length === 0 ? (
          <Card className="p-5">
            <p className="text-sm text-ink-500">
              Todo al día: cada número que fichó ya apunta a un empleado.
            </p>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sinAsignar.map((n, i) => (
              <Card key={`${n.dispositivo.id}-${n.numero_reloj}`} className="ct-stagger-item p-4" style={ctStagger(i)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="tnum text-base font-semibold text-ink-950">Nº {n.numero_reloj}</p>
                    <p className="truncate text-xs text-ink-400">
                      {n.nombre_reloj ? `«${n.nombre_reloj}» · ` : ''}
                      {n.dispositivo.nombre}
                    </p>
                  </div>
                  <Badge tone="soft" className="tnum shrink-0">
                    {num(n.cantidad)}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-ink-400">Última fichada {tiempoRelativo(n.ultima)}</p>
                <Button
                  size="sm"
                  className="mt-3 w-full"
                  onClick={() =>
                    setAsignando({ numero: n.numero_reloj, dispositivoId: n.dispositivo.id })
                  }
                >
                  <UserRoundPlus className="h-4 w-4" />
                  Asignar empleado
                </Button>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-400">
          Asignaciones vigentes
        </h3>
        {cargandoMapeos ? (
          <Skeleton className="h-32 rounded-2xl" />
        ) : mapeos.length === 0 ? (
          <EmptyState
            icon={UserRoundSearch}
            title="Sin asignaciones todavía"
            description="Cuando llegue la primera fichada, el número del reloj va a aparecer arriba para vincularlo con un empleado."
          />
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-400">
                    <th className="px-4 py-2.5 font-semibold">Nº reloj</th>
                    <th className="px-4 py-2.5 font-semibold">Empleado</th>
                    <th className="px-4 py-2.5 font-semibold">Alcance</th>
                    <th className="w-24 px-2 py-2.5" aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {mapeos.map((m, i) => (
                    <tr key={m.id} className="ct-stagger-fade" style={ctStagger(i)}>
                      <td className="tnum px-4 py-3 font-semibold text-ink-950">{m.numero_reloj}</td>
                      <td className="px-4 py-3 text-ink-900">
                        <span className="inline-flex items-center gap-1.5">
                          <Link2 className="h-3.5 w-3.5 text-ink-300" aria-hidden />
                          {m.empleado_nombre}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-ink-600">
                        {m.dispositivo_nombre ?? 'Todos los relojes'}
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Editar asignación ${m.numero_reloj}`}
                            onClick={() => setAsignando({ mapeo: m })}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Eliminar asignación ${m.numero_reloj}`}
                            onClick={async () => {
                              const ok = await confirm({
                                title: '¿Eliminar la asignación?',
                                description: `Las fichadas ya asignadas a ${m.empleado_nombre} no cambian; las próximas de ese número quedarán sin asignar.`,
                                confirmLabel: 'Eliminar',
                                tone: 'danger',
                              })
                              if (ok === true) borrar.mutate(m.id)
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
        )}
      </section>

      <AsignarNumeroModal datos={asignando} onClose={() => setAsignando(null)} />
    </div>
  )
}
