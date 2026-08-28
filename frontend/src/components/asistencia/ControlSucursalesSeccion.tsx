import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, MapPinOff, Watch } from 'lucide-react'
import type { ControlSucursal } from '@/types'
import { actualizarControlSucursal, listarControlSucursales } from '@/services/asistencia'
import { useToast } from '@/components/ToastProvider'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { Switch } from '@/components/ui/Switch'
import { cn, ctStagger } from '@/lib/utils'

/**
 * Qué sucursales entran en el control de asistencia.
 *
 * Sirve para el depósito donde el horario no importa, el local que recién abre
 * o la sucursal en obra: se apaga el interruptor y esa gente deja de figurar
 * ausente todos los días.
 *
 * Lo que se apaga es el JUICIO, no el registro. Las fichadas se siguen
 * guardando y se pueden consultar; lo que deja de pasar es que el sistema
 * reporte ausencias, llegadas tarde e inconsistencias. Se dice explícito en
 * pantalla porque es justo lo que uno teme al tocar un interruptor así.
 */
export function ControlSucursalesSeccion() {
  const queryClient = useQueryClient()
  const toast = useToast()

  const { data: sucursales = [], isLoading } = useQuery({
    queryKey: ['asistencia', 'control-sucursales'],
    queryFn: listarControlSucursales,
  })

  const cambiar = useMutation({
    mutationFn: ({ id, controla }: { id: number; controla: boolean }) =>
      actualizarControlSucursal(id, { controla }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['asistencia'] })
      if (r.controla) toast.success(`${r.nombre} vuelve a controlarse`, r.detalle)
      else toast.info(`${r.nombre} deja de controlarse`, r.detalle)
    },
    onError: (e: Error) => toast.error('No se pudo cambiar', e.message),
  })

  const apagadas = sucursales.filter((s) => !s.controla).length

  return (
    <section>
      <div className="mb-2 px-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-400">
          Qué sucursales se controlan
        </h3>
        <p className="mt-0.5 text-xs text-ink-400">
          Apagá las que no llevan control horario. Sus fichadas se siguen
          registrando; lo que se apaga es el reporte de ausencias, llegadas tarde
          e inconsistencias.
        </p>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : (
        <Card className="divide-y divide-line">
          {sucursales.map((s, i) => (
            <Fila
              key={s.sucursal}
              sucursal={s}
              indice={i}
              guardando={cambiar.isPending}
              onCambiar={(controla) => cambiar.mutate({ id: s.sucursal, controla })}
            />
          ))}
        </Card>
      )}

      {apagadas > 0 && (
        <p className="mt-2 px-1 text-xs text-ink-400">
          {apagadas === 1 ? 'Hay 1 sucursal' : `Hay ${apagadas} sucursales`} sin
          control. Su gente no va a figurar en el Resumen ni en el Calendario.
        </p>
      )}
    </section>
  )
}

function Fila({
  sucursal,
  indice,
  guardando,
  onCambiar,
}: {
  sucursal: ControlSucursal
  indice: number
  guardando: boolean
  onCambiar: (controla: boolean) => void
}) {
  // Una sucursal prendida pero sin reloj tampoco se controla: no se le puede
  // pedir una marca a quien no tiene dónde marcarla. Conviene decirlo, porque
  // si no el interruptor prometería algo que no está pasando.
  const sinReloj = sucursal.controla && !sucursal.tiene_reloj

  return (
    <div
      className={cn(
        'ct-stagger-fade flex flex-wrap items-center justify-between gap-x-4 gap-y-2 p-4',
        !sucursal.controla && 'opacity-60',
      )}
      style={ctStagger(indice)}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-ink-50">
          <Building2 className="h-4 w-4 text-ink-500" strokeWidth={1.9} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="font-medium text-ink-950">{sucursal.nombre}</p>
          {sucursal.relojes.length > 0 ? (
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-400">
              <Watch className="h-3 w-3 shrink-0" strokeWidth={1.9} aria-hidden />
              {sucursal.relojes.join(' · ')}
            </p>
          ) : (
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-400">
              <MapPinOff className="h-3 w-3 shrink-0" strokeWidth={1.9} aria-hidden />
              Sin reloj cargado
            </p>
          )}
          {sinReloj && (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              Está prendida, pero sin reloj no se puede controlar. Cargale uno más
              arriba.
            </p>
          )}
          {!sucursal.controla && sucursal.motivo && (
            <p className="mt-1 text-xs text-ink-500">{sucursal.motivo}</p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        <span className="text-xs text-ink-500">
          {sucursal.controla ? 'Se controla' : 'Sin control'}
        </span>
        <Switch
          checked={sucursal.controla}
          disabled={guardando}
          onChange={onCambiar}
          aria-label={`${sucursal.controla ? 'Dejar de controlar' : 'Controlar'} ${sucursal.nombre}`}
        />
      </div>
    </div>
  )
}
