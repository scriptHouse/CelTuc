import { useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  CalendarRange,
  Loader2,
  LogOut,
  MapPin,
  Timer,
  TriangleAlert,
  UserX,
} from 'lucide-react'
import type { JornadaAsistencia } from '@/types'
import { resumenAsistencia } from '@/services/asistencia'
import { listarEmpleados } from '@/services/empleados'
import { listarSucursales } from '@/services/sucursales'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatCard } from '@/components/ui/StatCard'
import { LineaDeTiempo } from '@/components/asistencia/LineaDeTiempo'
import {
  ESTADO_INCONSISTENCIA,
  duracion,
  estadoDe,
  etiquetaFecha,
  haceDias,
  iconoInconsistencia,
  severidadDe,
} from '@/components/asistencia/constantes'
import { num } from '@/lib/format'
import { cn, ctStagger } from '@/lib/utils'

type Rango = '7d' | '14d' | '30d'
const RANGOS: { value: Rango; label: string; dias: number }[] = [
  { value: '7d', label: '7 días', dias: 6 },
  { value: '14d', label: '14 días', dias: 13 },
  { value: '30d', label: '30 días', dias: 29 },
]

const ESTADOS_FILTRO = [
  { value: '', label: 'Todos los estados' },
  { value: 'ok', label: 'Presentes' },
  { value: 'tarde', label: 'Llegaron tarde' },
  { value: 'salida_temprana', label: 'Se retiraron antes' },
  { value: 'incompleta', label: 'Falta fichar salida' },
  { value: 'ausente', label: 'Ausentes' },
  { value: 'licencia', label: 'Con licencia' },
  { value: 'feriado', label: 'Feriados' },
  { value: 'con_parcial', label: 'Con salida parcial' },
  { value: 'otra_sucursal', label: 'Fichó en otra sucursal' },
]

export function ResumenTab() {
  const [rango, setRango] = useState<Rango>('7d')
  const [sucursal, setSucursal] = useState('')
  const [empleado, setEmpleado] = useState('')
  const [estado, setEstado] = useState('')

  const { data: sucursales = [] } = useQuery({ queryKey: ['sucursales'], queryFn: listarSucursales })
  const { data: empleados = [] } = useQuery({ queryKey: ['empleados'], queryFn: listarEmpleados })

  const dias = RANGOS.find((r) => r.value === rango)?.dias ?? 6
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['asistencia', 'resumen', rango, sucursal, empleado],
    queryFn: () =>
      resumenAsistencia({
        desde: haceDias(dias),
        sucursal: sucursal ? Number(sucursal) : '',
        empleado: empleado ? Number(empleado) : '',
      }),
    placeholderData: keepPreviousData,
  })

  const filtradas = useMemo(() => {
    const todas = data?.resultados ?? []
    if (!estado) return todas
    if (estado === 'con_parcial') return todas.filter((j) => j.salidas_parciales.length > 0)
    if (estado === 'otra_sucursal') return todas.filter((j) => j.fichada_en_otra_sucursal)
    return todas.filter((j) => j.estado === estado)
  }, [data, estado])

  const porFecha = useMemo(() => {
    const grupos: { fecha: string; filas: JornadaAsistencia[] }[] = []
    for (const fila of filtradas) {
      const ultimo = grupos[grupos.length - 1]
      if (ultimo && ultimo.fecha === fila.fecha) ultimo.filas.push(fila)
      else grupos.push({ fecha: fila.fecha, filas: [fila] })
    }
    return grupos
  }, [filtradas])

  const resumen = data?.resumen
  const porEstado = resumen?.por_estado ?? {}
  const trabajadosEnFeriado = (data?.resultados ?? []).filter((j) => j.trabajo_en_feriado).length

  return (
    <div>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Horas trabajadas"
          value={duracion(resumen?.minutos_trabajados ?? 0)}
          hint={
            resumen?.minutos_esperados
              ? `de ${duracion(resumen.minutos_esperados)} esperadas`
              : 'sin turnos cargados'
          }
          icon={Timer}
          className="ct-stagger-item"
          style={ctStagger(0)}
        />
        <StatCard
          label="Salidas parciales"
          value={num(resumen?.con_salida_parcial ?? 0)}
          hint="jornadas con idas y vueltas"
          icon={LogOut}
          className="ct-stagger-item"
          style={ctStagger(1)}
        />
        <StatCard
          label="Ausencias"
          value={num(porEstado.ausente ?? 0)}
          hint="sin fichar y sin licencia"
          icon={UserX}
          className="ct-stagger-item"
          style={ctStagger(2)}
        />
        <StatCard
          label="A revisar"
          value={num(resumen?.pendientes ?? 0)}
          hint={
            (resumen?.inconsistencias ?? 0) > 0
              ? `de ${num(resumen?.inconsistencias ?? 0)} inconsistencias del período`
              : trabajadosEnFeriado > 0
                ? `${trabajadosEnFeriado} trabajaron en feriado`
                : 'sin inconsistencias pendientes'
          }
          icon={TriangleAlert}
          className="ct-stagger-item"
          style={ctStagger(3)}
        />
      </div>

      <Card className="mb-5 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Select
            placeholder="Todas las sucursales"
            value={sucursal}
            onChange={setSucursal}
            options={[
              { value: '', label: 'Todas las sucursales' },
              ...sucursales.map((s) => ({ value: String(s.id), label: s.nombre })),
            ]}
          />
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
          <Select
            placeholder="Todos los estados"
            value={estado}
            onChange={setEstado}
            options={ESTADOS_FILTRO}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
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
          {isFetching && !isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-400" />}
          <span className="ml-auto tnum text-xs text-ink-400">
            {num(filtradas.length)} jornada{filtradas.length === 1 ? '' : 's'}
          </span>
        </div>
      </Card>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : porFecha.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="Sin jornadas en este filtro"
          description="Acá se arma, día por día y persona por persona, a qué hora entró, si salió y volvió, y cuánto trabajó realmente."
        />
      ) : (
        <div className="space-y-5">
          {porFecha.map((grupo) => (
            <section key={grupo.fecha}>
              <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-400">
                {etiquetaFecha(grupo.fecha)}
              </h3>
              <Card className="divide-y divide-line overflow-hidden">
                {grupo.filas.map((fila, i) => (
                  <FilaJornada key={`${fila.fecha}-${fila.nombre}`} jornada={fila} indice={i} />
                ))}
              </Card>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

// --- Fila de una persona en un día -------------------------------------------

function FilaJornada({ jornada, indice }: { jornada: JornadaAsistencia; indice: number }) {
  const info = estadoDe(jornada.estado)
  const Icono = info.icon
  const conTramos = jornada.tramos.length > 0

  return (
    <div className="ct-stagger-fade p-4" style={ctStagger(indice)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-medium text-ink-950">
            {jornada.nombre}
            {jornada.sin_mapear && (
              <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-amber-600 dark:text-amber-400">
                sin asignar
              </span>
            )}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-ink-400">
            {jornada.turno ? (
              <span>
                {jornada.turno}
                {jornada.horario_esperado ? ` · ${jornada.horario_esperado}` : ''}
              </span>
            ) : (
              <span>Sin turno asignado</span>
            )}
            {jornada.sucursal_esperada && (
              <span className="inline-flex items-center gap-1">
                <span aria-hidden>·</span>
                <MapPin className="h-3 w-3" strokeWidth={2} aria-hidden />
                {jornada.sucursal_esperada.nombre}
              </span>
            )}
          </p>
        </div>

        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
            info.tono,
          )}
        >
          <Icono className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          {info.label}
        </span>
      </div>

      {jornada.inconsistencias.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {jornada.inconsistencias.map((inc) => {
            const Icono = iconoInconsistencia(inc.tipo)
            const resuelta = inc.estado !== 'pendiente'
            return (
              <span
                key={inc.clave}
                title={inc.motivo || inc.detalle || inc.tipo_display}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium',
                  resuelta
                    ? ESTADO_INCONSISTENCIA[inc.estado].tono
                    : severidadDe(inc.severidad).tono,
                  resuelta && 'line-through decoration-1',
                )}
              >
                <Icono className="h-3 w-3" strokeWidth={2} aria-hidden />
                {inc.tipo_display}
                {inc.minutos > 0 && <span className="tnum">· {duracion(inc.minutos)}</span>}
              </span>
            )
          })}
        </div>
      )}

      {conTramos && <LineaDeTiempo jornada={jornada} />}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {conTramos && (
          <span className="tnum text-ink-600">
            Trabajó <strong className="font-semibold text-ink-900">{duracion(jornada.minutos_trabajados)}</strong>
            {jornada.minutos_esperados > 0 && ` de ${duracion(jornada.minutos_esperados)}`}
          </span>
        )}
        {jornada.salidas_parciales.length > 0 && (
          <span className="tnum text-ink-500">
            {jornada.salidas_parciales.length} salida
            {jornada.salidas_parciales.length === 1 ? '' : 's'} parcial
            {jornada.salidas_parciales.length === 1 ? '' : 'es'} ({duracion(jornada.minutos_fuera)} fuera)
          </span>
        )}
        {jornada.llegada_tarde_minutos > 0 && (
          <span className="tnum text-amber-600 dark:text-amber-400">
            {duracion(jornada.llegada_tarde_minutos)} tarde
          </span>
        )}
        {jornada.salida_temprana_minutos > 0 && (
          <span className="tnum text-amber-600 dark:text-amber-400">
            se fue {duracion(jornada.salida_temprana_minutos)} antes
          </span>
        )}
        {jornada.fichada_en_otra_sucursal && (
          <span className="inline-flex items-center gap-1 font-medium text-orange-600 dark:text-orange-400">
            <MapPin className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            fichó en {jornada.sucursales_fichadas.map((s) => s.nombre).join(' y ')}
          </span>
        )}
        {jornada.feriado && (
          <span className="font-medium text-violet-700 dark:text-violet-300">
            {jornada.feriado.nombre}
            {jornada.trabajo_en_feriado && ' · se trabajó igual'}
          </span>
        )}
        {jornada.licencia && (
          <span className="text-sky-700 dark:text-sky-300">
            {jornada.licencia.tipo_display}
            {jornada.licencia.jornada_completa
              ? ` (${jornada.licencia.desde} a ${jornada.licencia.hasta})`
              : ` de ${jornada.licencia.hora_desde} a ${jornada.licencia.hora_hasta}`}
            {jornada.licencia.observacion ? ` · ${jornada.licencia.observacion}` : ''}
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * Barra proporcional del día: bloques oscuros = presente, huecos claros =
 * salidas parciales. Es la forma más rápida de ver que alguien se fue y volvió.
 */
