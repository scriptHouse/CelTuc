import { useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { CalendarRange, Loader2 } from 'lucide-react'
import type { ResumenDiaAsistencia } from '@/types'
import { resumenAsistencia } from '@/services/asistencia'
import { listarSucursales } from '@/services/sucursales'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { haceDias } from '@/components/asistencia/constantes'
import { cn } from '@/lib/utils'

type Rango = '7d' | '14d' | '30d'
const RANGOS: { value: Rango; label: string; dias: number }[] = [
  { value: '7d', label: '7 días', dias: 6 },
  { value: '14d', label: '14 días', dias: 13 },
  { value: '30d', label: '30 días', dias: 29 },
]

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

function duracion(minutos: number): string {
  if (minutos <= 0) return '—'
  const horas = Math.floor(minutos / 60)
  const resto = minutos % 60
  return horas > 0 ? `${horas} h ${String(resto).padStart(2, '0')} m` : `${resto} m`
}

function etiquetaFecha(iso: string): string {
  // `aaaa-mm-dd` es fecha LOCAL: parsear a mano para no correr un día.
  const [anio, mes, dia] = iso.split('-').map(Number)
  const fecha = new Date(anio, mes - 1, dia)
  const texto = fecha.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

export function ResumenTab() {
  const [rango, setRango] = useState<Rango>('7d')
  const [sucursal, setSucursal] = useState('')

  const { data: sucursales = [] } = useQuery({
    queryKey: ['sucursales'],
    queryFn: listarSucursales,
  })

  const dias = RANGOS.find((r) => r.value === rango)?.dias ?? 6
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['asistencia', 'resumen', rango, sucursal],
    queryFn: () =>
      resumenAsistencia({
        desde: haceDias(dias),
        sucursal: sucursal ? Number(sucursal) : '',
      }),
    placeholderData: keepPreviousData,
  })

  const porFecha = useMemo(() => {
    const grupos: { fecha: string; filas: ResumenDiaAsistencia[] }[] = []
    for (const fila of data?.resultados ?? []) {
      const ultimo = grupos[grupos.length - 1]
      if (ultimo && ultimo.fecha === fila.fecha) ultimo.filas.push(fila)
      else grupos.push({ fecha: fila.fecha, filas: [fila] })
    }
    return grupos
  }, [data])

  return (
    <div>
      <Card className="mb-5 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            {RANGOS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRango(r.value)}
                className={cn(
                  'rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900',
                  rango === r.value
                    ? 'border-ink-950 bg-ink-950 text-on-ink'
                    : 'border-line text-ink-500 hover:border-line-strong hover:text-ink-900',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="min-w-52">
            <Select
              placeholder="Todas las sucursales"
              value={sucursal}
              onChange={setSucursal}
              options={[
                { value: '', label: 'Todas las sucursales' },
                ...sucursales.map((s) => ({ value: String(s.id), label: s.nombre })),
              ]}
            />
          </div>
          {isFetching && !isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-400" />}
        </div>
      </Card>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      ) : porFecha.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="Sin días con fichadas en este rango"
          description="El resumen arma, por día y por empleado, la primera entrada, la última salida y la presencia estimada."
        />
      ) : (
        <div className="space-y-5">
          {porFecha.map((grupo) => (
            <section key={grupo.fecha}>
              <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-400">
                {etiquetaFecha(grupo.fecha)}
              </h3>
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-400">
                        <th className="px-4 py-2.5 font-semibold">Empleado</th>
                        <th className="px-4 py-2.5 font-semibold">Entrada</th>
                        <th className="px-4 py-2.5 font-semibold">Salida</th>
                        <th className="px-4 py-2.5 text-right font-semibold">Presencia</th>
                        <th className="px-4 py-2.5 text-right font-semibold">Fichadas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {grupo.filas.map((fila) => (
                        <tr key={`${fila.fecha}-${fila.empleado?.id ?? fila.numero_reloj}`}>
                          <td className="px-4 py-3">
                            <span className="font-medium text-ink-950">{fila.nombre}</span>
                            {fila.sin_mapear && (
                              <Badge tone="outline" className="ml-2 text-amber-600 dark:text-amber-400">
                                sin asignar
                              </Badge>
                            )}
                          </td>
                          <td className="tnum px-4 py-3 text-ink-600">{hora(fila.primera)}</td>
                          <td className="tnum px-4 py-3 text-ink-600">
                            {fila.ultima ? hora(fila.ultima) : '—'}
                          </td>
                          <td className="tnum px-4 py-3 text-right font-medium text-ink-900">
                            {duracion(fila.presencia_minutos)}
                          </td>
                          <td className="tnum px-4 py-3 text-right text-ink-600">{fila.fichadas}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
