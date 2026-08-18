import type { JornadaAsistencia } from '@/types'
import { duracion, horaDe } from '@/components/asistencia/constantes'
import { cn } from '@/lib/utils'

/**
 * El día dibujado a escala: bloques llenos donde estuvo y rayados donde se fue.
 *
 * Vale más que la lista de horas porque muestra la forma de la jornada de un
 * vistazo — un hueco largo al mediodía se ve antes de leer ningún número.
 */
export function LineaDeTiempo({ jornada }: { jornada: JornadaAsistencia }) {
  const inicio = jornada.primera ? new Date(jornada.primera).getTime() : 0
  const fin = jornada.ultima ? new Date(jornada.ultima).getTime() : 0
  const total = fin - inicio

  if (!inicio || total <= 0) {
    // Un solo fichaje (jornada abierta): no hay rango que dibujar.
    return (
      <p className="tnum mt-3 text-xs text-ink-500">
        Fichó a las {jornada.primera ? horaDe(jornada.primera) : '—'} y no volvió a fichar.
      </p>
    )
  }

  const bloques: { tipo: 'presente' | 'fuera'; pct: number; minutos: number }[] = []
  jornada.tramos.forEach((tramo, i) => {
    const desde = new Date(tramo.entrada).getTime()
    const hasta = tramo.salida ? new Date(tramo.salida).getTime() : desde
    bloques.push({ tipo: 'presente', pct: ((hasta - desde) / total) * 100, minutos: tramo.minutos })
    const hueco = jornada.salidas_parciales[i]
    if (hueco) {
      bloques.push({
        tipo: 'fuera',
        pct: ((hueco.minutos * 60_000) / total) * 100,
        minutos: hueco.minutos,
      })
    }
  })

  return (
    <div className="mt-3">
      <div
        className="flex h-7 w-full overflow-hidden rounded-lg border border-line"
        role="img"
        aria-label={`Presencia de ${jornada.nombre}: ${duracion(jornada.minutos_trabajados)} trabajadas`}
      >
        {bloques.map((b, i) => (
          <div
            key={i}
            style={{ width: `${Math.max(b.pct, 1.5)}%` }}
            title={
              b.tipo === 'presente'
                ? `Presente ${duracion(b.minutos)}`
                : `Fuera ${duracion(b.minutos)}`
            }
            className={cn(
              'flex items-center justify-center overflow-hidden text-[10px] font-medium transition-colors',
              b.tipo === 'presente'
                ? 'bg-ink-900 text-on-ink'
                : 'bg-ink-100 text-ink-500 [background-image:repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(0,0,0,0.06)_4px,rgba(0,0,0,0.06)_8px)]',
            )}
          >
            {b.pct > 12 ? duracion(b.minutos) : ''}
          </div>
        ))}
      </div>
      <div className="tnum mt-1 flex justify-between text-[11px] text-ink-400">
        <span>{jornada.primera ? horaDe(jornada.primera) : ''}</span>
        <span>{jornada.ultima ? horaDe(jornada.ultima) : ''}</span>
      </div>
    </div>
  )
}
