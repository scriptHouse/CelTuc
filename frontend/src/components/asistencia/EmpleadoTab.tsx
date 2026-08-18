import { useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  Palmtree,
  Scale,
  TriangleAlert,
  UserRoundSearch,
} from 'lucide-react'
import type {
  DiaLegajo,
  InconsistenciaJornada,
  LegajoAsistencia,
  MesLegajo,
} from '@/types'
import { legajoEmpleado } from '@/services/asistencia'
import { listarEmpleados } from '@/services/empleados'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatCard } from '@/components/ui/StatCard'
import { LineaDeTiempo } from '@/components/asistencia/LineaDeTiempo'
import {
  DIAS_SEMANA,
  ESTADO_INCONSISTENCIA,
  duracion,
  estadoDe,
  etiquetaFecha,
  fechaLocalISO,
  iconoInconsistencia,
  severidadDe,
} from '@/components/asistencia/constantes'
import { fecha as fechaCorta, num } from '@/lib/format'
import { cn, ctStagger } from '@/lib/utils'

type Modo = 'dia' | 'semana' | 'mes' | 'anio'

const MODOS: { value: Modo; label: string }[] = [
  { value: 'dia', label: 'Día' },
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mes' },
  { value: 'anio', label: 'Año' },
]

const MESES_LARGOS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

// --- Aritmética del período --------------------------------------------------

/** Lunes de la semana de `d` (la semana laboral acá arranca el lunes). */
function lunesDe(d: Date): Date {
  const copia = new Date(d)
  const desplazamiento = (copia.getDay() + 6) % 7 // domingo = 6
  copia.setDate(copia.getDate() - desplazamiento)
  return copia
}

function rangoDe(modo: Modo, ancla: Date): { desde: string; hasta: string } {
  const a = ancla.getFullYear()
  const m = ancla.getMonth()
  if (modo === 'dia') return { desde: fechaLocalISO(ancla), hasta: fechaLocalISO(ancla) }
  if (modo === 'semana') {
    const lunes = lunesDe(ancla)
    const domingo = new Date(lunes)
    domingo.setDate(domingo.getDate() + 6)
    return { desde: fechaLocalISO(lunes), hasta: fechaLocalISO(domingo) }
  }
  if (modo === 'mes') {
    return {
      desde: fechaLocalISO(new Date(a, m, 1)),
      hasta: fechaLocalISO(new Date(a, m + 1, 0)),
    }
  }
  return {
    desde: fechaLocalISO(new Date(a, 0, 1)),
    hasta: fechaLocalISO(new Date(a, 11, 31)),
  }
}

function mover(modo: Modo, ancla: Date, pasos: number): Date {
  const d = new Date(ancla)
  if (modo === 'dia') d.setDate(d.getDate() + pasos)
  else if (modo === 'semana') d.setDate(d.getDate() + pasos * 7)
  else if (modo === 'mes') d.setMonth(d.getMonth() + pasos, 1)
  else d.setFullYear(d.getFullYear() + pasos, 0, 1)
  return d
}

function etiquetaPeriodo(modo: Modo, ancla: Date): string {
  if (modo === 'dia') return etiquetaFecha(fechaLocalISO(ancla))
  if (modo === 'semana') {
    const { desde, hasta } = rangoDe('semana', ancla)
    return `${fechaCorta(desde)} al ${fechaCorta(hasta)}`
  }
  if (modo === 'mes') return `${MESES_LARGOS[ancla.getMonth()]} ${ancla.getFullYear()}`
  return String(ancla.getFullYear())
}

/** `-40` → `−40 m`; `125` → `+2 h 05 m`. El signo es la información. */
function saldo(minutos: number): string {
  if (minutos === 0) return '0'
  return `${minutos > 0 ? '+' : '−'}${duracion(Math.abs(minutos))}`
}

// --- Pantalla ----------------------------------------------------------------

/**
 * El legajo de asistencia: todo lo de una persona, al zoom que se quiera.
 *
 * La navegación es por período (← Agosto →) y no por dos campos de fecha: es
 * lo que uno hace de verdad — mirar un mes, compararlo con el anterior, abrir
 * un día puntual. El rango libre sigue disponible cambiando de modo.
 */
export function EmpleadoTab() {
  const [empleadoId, setEmpleadoId] = useState('')
  const [modo, setModo] = useState<Modo>('mes')
  const [ancla, setAncla] = useState(() => new Date())

  const { data: empleados = [], isLoading: cargandoEmpleados } = useQuery({
    queryKey: ['empleados'],
    queryFn: listarEmpleados,
  })

  const rango = useMemo(() => rangoDe(modo, ancla), [modo, ancla])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['asistencia', 'legajo', empleadoId, rango.desde, rango.hasta],
    queryFn: () => legajoEmpleado(Number(empleadoId), rango),
    enabled: empleadoId !== '',
    placeholderData: keepPreviousData,
  })

  const abrirMes = (mes: MesLegajo) => {
    const [anio, numero] = mes.mes.split('-').map(Number)
    setAncla(new Date(anio, numero - 1, 1))
    setModo('mes')
  }

  const abrirDia = (fecha: string) => {
    const [anio, mes, dia] = fecha.split('-').map(Number)
    setAncla(new Date(anio, mes - 1, dia))
    setModo('dia')
  }

  const resumen = data?.resumen

  return (
    <div>
      <Card className="mb-5 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="Empleado"
            placeholder={cargandoEmpleados ? 'Cargando…' : 'Elegir empleado…'}
            searchable
            value={empleadoId}
            onChange={setEmpleadoId}
            options={empleados.map((e) => ({ value: String(e.id), label: e.nombre_completo }))}
          />
          <div>
            <span className="mb-1.5 block text-sm font-medium text-ink-700">Ver por</span>
            <div
              role="tablist"
              aria-label="Nivel de detalle"
              className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-ink-50 p-1"
            >
              {MODOS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  role="tab"
                  aria-selected={modo === m.value}
                  onClick={() => setModo(m.value)}
                  className={cn(
                    'flex-1 shrink-0 whitespace-nowrap rounded-lg px-2 py-1.5 text-sm font-medium transition-colors sm:px-3',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900',
                    modo === m.value
                      ? 'bg-surface text-ink-950 shadow-sm'
                      : 'text-ink-500 hover:text-ink-900',
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {empleadoId !== '' && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
            <div className="flex min-w-0 items-center gap-1">
              <button
                type="button"
                aria-label="Período anterior"
                onClick={() => setAncla((a) => mover(modo, a, -1))}
                className="rounded-lg border border-line p-2 text-ink-500 transition-colors hover:border-line-strong hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="truncate px-2 text-sm font-semibold text-ink-950">
                {etiquetaPeriodo(modo, ancla)}
              </span>
              <button
                type="button"
                aria-label="Período siguiente"
                onClick={() => setAncla((a) => mover(modo, a, 1))}
                className="rounded-lg border border-line p-2 text-ink-500 transition-colors hover:border-line-strong hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-400" />}
              <button
                type="button"
                onClick={() => setAncla(new Date())}
                className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink-600 transition-colors hover:border-line-strong hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
              >
                Hoy
              </button>
            </div>
          </div>
        )}
      </Card>

      {empleadoId === '' ? (
        <EmptyState
          icon={UserRoundSearch}
          title="Elegí un empleado"
          description="Vas a ver todas sus jornadas, sus horas contra las esperadas y lo que quedó pendiente de revisar — por día, por semana, por mes o por año."
        />
      ) : isLoading || !data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      ) : (
        <div className="space-y-5">
          <Encabezado data={data} />

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Horas trabajadas"
              value={duracion(resumen!.minutos_trabajados)}
              hint={
                resumen!.minutos_esperados
                  ? `de ${duracion(resumen!.minutos_esperados)} esperadas`
                  : 'sin horario esperado'
              }
              icon={Clock}
              className="ct-stagger-item"
              style={ctStagger(0)}
            />
            <StatCard
              label="Saldo del período"
              value={saldo(resumen!.saldo_minutos)}
              hint={resumen!.saldo_minutos >= 0 ? 'a favor' : 'en contra'}
              icon={Scale}
              className="ct-stagger-item"
              style={ctStagger(1)}
            />
            <StatCard
              label="Días trabajados"
              value={num(resumen!.dias_trabajados)}
              hint={`${num(resumen!.ausencias)} ausencias · ${num(resumen!.dias_licencia)} de licencia`}
              icon={CalendarDays}
              className="ct-stagger-item"
              style={ctStagger(2)}
            />
            <StatCard
              label="A revisar"
              value={num(resumen!.pendientes)}
              hint={
                resumen!.dias_tarde > 0
                  ? `${num(resumen!.dias_tarde)} días tarde · ${duracion(resumen!.minutos_tarde)}`
                  : 'sin pendientes'
              }
              icon={TriangleAlert}
              className="ct-stagger-item"
              style={ctStagger(3)}
            />
          </div>

          {modo === 'anio' ? (
            <VistaAnual meses={data.por_mes} onAbrirMes={abrirMes} />
          ) : modo === 'mes' ? (
            <Calendario dias={data.dias} ancla={ancla} onAbrirDia={abrirDia} />
          ) : null}

          {data.con_detalle && data.jornadas.length > 0 && (
            <DetalleJornadas data={data} />
          )}

          {data.inconsistencias.length > 0 && <ListaInconsistencias data={data} />}
          {data.licencias.length > 0 && <ListaLicencias data={data} />}

          {data.dias.length === 0 && (
            <EmptyState
              icon={CalendarDays}
              title="Sin movimientos en este período"
              description="No hay fichadas ni días con turno esperado. Probá con otro período o revisá que tenga un turno asignado."
            />
          )}
        </div>
      )}
    </div>
  )
}

// --- Encabezado --------------------------------------------------------------

function Encabezado({ data }: { data: LegajoAsistencia }) {
  const { empleado } = data
  return (
    <Card className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 p-4">
      <div className="min-w-0">
        <h2 className="truncate text-lg font-semibold text-ink-950">{empleado.nombre}</h2>
        <p className="mt-0.5 text-xs text-ink-400">
          {[empleado.sucursal, empleado.turno_vigente].filter(Boolean).join(' · ') ||
            'Sin sucursal ni turno asignado'}
        </p>
      </div>
      <p className="tnum text-xs text-ink-400">
        {fechaCorta(data.desde)} — {fechaCorta(data.hasta)}
      </p>
    </Card>
  )
}

// --- Vista anual: doce meses comparables -------------------------------------

function VistaAnual({
  meses,
  onAbrirMes,
}: {
  meses: MesLegajo[]
  onAbrirMes: (mes: MesLegajo) => void
}) {
  const tope = Math.max(
    1,
    ...meses.map((m) => Math.max(m.minutos_trabajados, m.minutos_esperados)),
  )

  if (meses.length === 0) return null

  return (
    <section>
      <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-400">
        Mes a mes
      </h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {meses.map((mes, i) => (
          <button
            key={mes.mes}
            type="button"
            onClick={() => onAbrirMes(mes)}
            className="ct-stagger-fade rounded-2xl border border-line bg-surface p-4 text-left transition-colors hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
            style={ctStagger(i)}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium text-ink-950">{mes.etiqueta_corta}</span>
              <span className="tnum text-sm text-ink-600">
                {duracion(mes.minutos_trabajados)}
              </span>
            </div>

            <div
              className="mt-2.5 flex h-2.5 w-full overflow-hidden rounded-full bg-ink-100"
              role="img"
              aria-label={`${duracion(mes.minutos_trabajados)} de ${duracion(mes.minutos_esperados)} esperadas`}
            >
              <div
                className="bg-ink-900"
                style={{ width: `${(mes.minutos_trabajados / tope) * 100}%` }}
              />
            </div>
            <div className="mt-1 h-1 w-full">
              <div
                className="h-full border-r-2 border-ink-400"
                style={{ width: `${(mes.minutos_esperados / tope) * 100}%` }}
                title={`Esperadas: ${duracion(mes.minutos_esperados)}`}
              />
            </div>

            <p className="tnum mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-ink-400">
              <span className={mes.saldo_minutos < 0 ? 'text-amber-600 dark:text-amber-400' : ''}>
                {saldo(mes.saldo_minutos)}
              </span>
              {mes.ausencias > 0 && <span>{mes.ausencias} ausencias</span>}
              {mes.dias_tarde > 0 && <span>{mes.dias_tarde} tarde</span>}
              {mes.pendientes > 0 && (
                <span className="text-amber-600 dark:text-amber-400">
                  {mes.pendientes} a revisar
                </span>
              )}
            </p>
          </button>
        ))}
      </div>
    </section>
  )
}

// --- Calendario del mes ------------------------------------------------------

function Calendario({
  dias,
  ancla,
  onAbrirDia,
}: {
  dias: DiaLegajo[]
  ancla: Date
  onAbrirDia: (fecha: string) => void
}) {
  const porFecha = useMemo(() => new Map(dias.map((d) => [d.fecha, d])), [dias])

  const celdas = useMemo(() => {
    const anio = ancla.getFullYear()
    const mes = ancla.getMonth()
    const primero = new Date(anio, mes, 1)
    const huecos = (primero.getDay() + 6) % 7 // lunes primero
    const ultimo = new Date(anio, mes + 1, 0).getDate()
    const lista: (string | null)[] = Array(huecos).fill(null)
    for (let d = 1; d <= ultimo; d++) lista.push(fechaLocalISO(new Date(anio, mes, d)))
    return lista
  }, [ancla])

  const hoy = fechaLocalISO(new Date())

  return (
    <section>
      <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-400">
        Calendario
      </h3>
      <Card className="p-2 sm:p-4">
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {DIAS_SEMANA.map((d) => (
            <div
              key={d.valor}
              className="pb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-ink-400 sm:text-[11px]"
            >
              <span className="hidden sm:inline">{d.corto}</span>
              <span className="sm:hidden">{d.corto.charAt(0)}</span>
            </div>
          ))}

          {celdas.map((fecha, i) => {
            if (fecha === null) return <div key={`hueco-${i}`} />
            const dia = porFecha.get(fecha)
            const numero = Number(fecha.slice(8))
            const info = dia ? estadoDe(dia.estado) : null

            return (
              <button
                key={fecha}
                type="button"
                disabled={!dia}
                onClick={() => onAbrirDia(fecha)}
                title={dia ? `${dia.estado_display} · ${duracion(dia.minutos_trabajados)}` : ''}
                className={cn(
                  'flex min-h-[3.25rem] flex-col items-start gap-0.5 rounded-lg border p-1 text-left transition-colors sm:min-h-[4.5rem] sm:gap-1 sm:p-2',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900',
                  dia
                    ? 'border-line bg-surface hover:border-line-strong'
                    : 'border-transparent bg-ink-50/60',
                  fecha === hoy && 'ring-1 ring-ink-950',
                )}
              >
                <span className="tnum flex w-full min-w-0 items-center justify-between gap-1 text-[11px] font-medium text-ink-600">
                  {numero}
                  {info && <span className={cn('h-1.5 w-1.5 rounded-full', info.punto)} />}
                </span>
                {dia && dia.minutos_trabajados > 0 && (
                  <span className="tnum hidden text-[11px] text-ink-900 sm:block">
                    {duracion(dia.minutos_trabajados)}
                  </span>
                )}
                {dia && dia.pendientes > 0 && (
                  <span className="tnum text-[10px] font-medium text-amber-600 dark:text-amber-400">
                    {dia.pendientes} ⚠
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-line pt-3 text-[11px] text-ink-500">
          {['ok', 'tarde', 'ausente', 'licencia', 'feriado'].map((estado) => {
            const info = estadoDe(estado)
            return (
              <span key={estado} className="inline-flex items-center gap-1.5">
                <span className={cn('h-1.5 w-1.5 rounded-full', info.punto)} />
                {info.label}
              </span>
            )
          })}
        </div>
      </Card>
    </section>
  )
}

// --- Detalle de las jornadas -------------------------------------------------

function DetalleJornadas({ data }: { data: LegajoAsistencia }) {
  return (
    <section>
      <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-400">
        Día por día
      </h3>
      <Card className="divide-y divide-line">
        {[...data.jornadas].reverse().map((jornada, i) => {
          const info = estadoDe(jornada.estado)
          const Icono = info.icon
          return (
            <div key={jornada.fecha} className="ct-stagger-fade p-4" style={ctStagger(i)}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink-950">{etiquetaFecha(jornada.fecha)}</p>
                  <p className="mt-0.5 text-xs text-ink-400">
                    {jornada.horario_esperado || 'Sin horario esperado'}
                    {jornada.sucursal_esperada ? ` · ${jornada.sucursal_esperada.nombre}` : ''}
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

              {jornada.tramos.length > 0 && <LineaDeTiempo jornada={jornada} />}

              <div className="tnum mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500">
                {jornada.minutos_trabajados > 0 && (
                  <span>
                    Trabajó{' '}
                    <strong className="font-semibold text-ink-900">
                      {duracion(jornada.minutos_trabajados)}
                    </strong>
                    {jornada.minutos_esperados > 0 &&
                      ` de ${duracion(jornada.minutos_esperados)}`}
                  </span>
                )}
                {jornada.minutos_fuera > 0 && (
                  <span>{duracion(jornada.minutos_fuera)} fuera</span>
                )}
              </div>

              {jornada.inconsistencias.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {jornada.inconsistencias.map((inc) => (
                    <ChipInconsistencia key={inc.clave} inc={inc} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </Card>
    </section>
  )
}

function ChipInconsistencia({ inc }: { inc: InconsistenciaJornada }) {
  const Icono = iconoInconsistencia(inc.tipo)
  const resuelta = inc.estado !== 'pendiente'
  return (
    <span
      title={inc.motivo || inc.detalle || inc.tipo_display}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium',
        resuelta ? ESTADO_INCONSISTENCIA[inc.estado].tono : severidadDe(inc.severidad).tono,
        resuelta && 'line-through decoration-1',
      )}
    >
      <Icono className="h-3 w-3" strokeWidth={2} aria-hidden />
      {inc.tipo_display}
      {inc.minutos > 0 && <span className="tnum">· {duracion(inc.minutos)}</span>}
    </span>
  )
}

// --- Inconsistencias y licencias del período ---------------------------------

function ListaInconsistencias({ data }: { data: LegajoAsistencia }) {
  return (
    <section>
      <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-400">
        Inconsistencias del período ({data.inconsistencias.length})
      </h3>
      <Card className="divide-y divide-line">
        {data.inconsistencias.map((inc, i) => (
          <div
            key={`${inc.clave}-${i}`}
            className="ct-stagger-fade flex flex-wrap items-center justify-between gap-x-4 gap-y-2 p-3.5"
            style={ctStagger(i)}
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="tnum w-16 shrink-0 text-xs text-ink-400">
                {fechaCorta(inc.fecha)}
              </span>
              <ChipInconsistencia inc={inc} />
            </div>
            {inc.motivo && (
              <p className="min-w-0 flex-1 truncate text-xs text-ink-500 sm:text-right">
                {inc.motivo}
              </p>
            )}
          </div>
        ))}
      </Card>
    </section>
  )
}

function ListaLicencias({ data }: { data: LegajoAsistencia }) {
  return (
    <section>
      <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-400">
        Licencias del período
      </h3>
      <Card className="divide-y divide-line">
        {data.licencias.map((licencia, i) => (
          <div
            key={licencia.id}
            className="ct-stagger-fade flex flex-wrap items-center justify-between gap-x-4 gap-y-1 p-3.5"
            style={ctStagger(i)}
          >
            <span className="inline-flex items-center gap-2 font-medium text-ink-950">
              <Palmtree className="h-4 w-4 text-ink-400" strokeWidth={1.9} aria-hidden />
              {licencia.tipo_display}
            </span>
            <span className="tnum text-xs text-ink-500">
              {fechaCorta(licencia.desde)} al {fechaCorta(licencia.hasta)} · {licencia.dias}{' '}
              {licencia.dias === 1 ? 'día' : 'días'}
              {!licencia.jornada_completa && licencia.hora_desde
                ? ` · ${licencia.hora_desde.slice(0, 5)} a ${(licencia.hora_hasta ?? '').slice(0, 5)}`
                : ''}
            </span>
          </div>
        ))}
      </Card>
    </section>
  )
}
