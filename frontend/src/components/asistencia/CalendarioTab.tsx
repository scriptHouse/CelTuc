import { useEffect, useMemo, useRef, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleX,
  Loader2,
  MousePointerClick,
  PartyPopper,
  TriangleAlert,
} from 'lucide-react'
import type { DiaCalendario, JornadaAsistencia } from '@/types'
import { calendarioAsistencia, resumenAsistencia } from '@/services/asistencia'
import { listarEmpleados } from '@/services/empleados'
import { listarSucursales } from '@/services/sucursales'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatCard } from '@/components/ui/StatCard'
import { LineaDeTiempo } from '@/components/asistencia/LineaDeTiempo'
import {
  DIAS_SEMANA,
  ESTADO_DIA,
  ESTADO_INCONSISTENCIA,
  diaYNumero,
  duracion,
  estadoDe,
  estadoDiaDe,
  etiquetaFecha,
  horaDe,
  iconoInconsistencia,
  severidadDe,
} from '@/components/asistencia/constantes'
import { num } from '@/lib/format'
import { cn, ctStagger } from '@/lib/utils'

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

/** `Date` → `2026-08`, que es como el backend pide el mes. */
function claveMes(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * El mes de un vistazo, y el detalle de un día al tocarlo.
 *
 * El color de cada día es un semáforo —verde todo en orden, amarillo con
 * novedades, rojo nadie fichó— pero nunca viaja solo: cada estado trae su ícono
 * y su etiqueta, porque rojo y verde son justo el par que el daltonismo más
 * común no distingue.
 *
 * Debajo del color, una barra apilada muestra la composición real del día
 * (quiénes ficharon bien, quiénes con novedad, quiénes faltaron). El color dice
 * «mirá acá»; la barra dice cuánto.
 */
export function CalendarioTab() {
  const [ancla, setAncla] = useState(() => new Date())
  const [sucursal, setSucursal] = useState('')
  const [empleado, setEmpleado] = useState('')
  const [elegido, setElegido] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const { data: sucursales = [] } = useQuery({ queryKey: ['sucursales'], queryFn: listarSucursales })
  const { data: empleados = [] } = useQuery({ queryKey: ['empleados'], queryFn: listarEmpleados })

  const mes = claveMes(ancla)
  const filtros = {
    sucursal: sucursal ? Number(sucursal) : ('' as const),
    empleado: empleado ? Number(empleado) : ('' as const),
  }

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['asistencia', 'calendario', mes, sucursal, empleado],
    queryFn: () => calendarioAsistencia({ mes, ...filtros }),
    placeholderData: keepPreviousData,
  })

  // El detalle del día sale del resumen filtrado a esa fecha: es el MISMO
  // cálculo que pinta el color, así que no pueden contradecirse.
  const { data: detalle, isFetching: cargandoDetalle } = useQuery({
    queryKey: ['asistencia', 'calendario-dia', elegido, sucursal, empleado],
    queryFn: () => resumenAsistencia({ desde: elegido!, hasta: elegido!, ...filtros }),
    enabled: elegido !== null,
    placeholderData: keepPreviousData,
  })

  const porFecha = useMemo(
    () => new Map((data?.dias ?? []).map((d) => [d.fecha, d])),
    [data],
  )

  // Al cambiar de mes, el día elegido ya no está en pantalla.
  useEffect(() => setElegido(null), [mes])

  const elegirDia = (fecha: string) => {
    setElegido(fecha)
    // En pantalla chica el panel queda debajo del calendario: sin esto, tocar
    // un día parecería no hacer nada.
    if (window.matchMedia('(max-width: 1279px)').matches) {
      window.setTimeout(
        () => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
        80,
      )
    }
  }

  const resumen = data?.resumen

  return (
    <div>
      {/* --- Filtros y navegación del mes --- */}
      <Card className="mb-5 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <span className="mb-1.5 block text-sm font-medium text-ink-700">Mes</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Mes anterior"
                onClick={() => setAncla((a) => new Date(a.getFullYear(), a.getMonth() - 1, 1))}
                className="shrink-0 rounded-lg border border-line p-2 text-ink-500 transition-colors hover:border-line-strong hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-0 flex-1 truncate px-1 text-center text-sm font-semibold text-ink-950">
                {MESES[ancla.getMonth()]} {ancla.getFullYear()}
              </span>
              <button
                type="button"
                aria-label="Mes siguiente"
                onClick={() => setAncla((a) => new Date(a.getFullYear(), a.getMonth() + 1, 1))}
                className="shrink-0 rounded-lg border border-line p-2 text-ink-500 transition-colors hover:border-line-strong hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setAncla(new Date())}
                className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink-600 transition-colors hover:border-line-strong hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
              >
                Hoy
              </button>
            </div>
          </div>

          <Select
            label="Sucursal"
            value={sucursal}
            onChange={setSucursal}
            options={[
              { value: '', label: 'Todas' },
              ...sucursales.map((s) => ({ value: String(s.id), label: s.nombre })),
            ]}
          />
          <Select
            label="Empleado"
            value={empleado}
            onChange={setEmpleado}
            searchable
            options={[
              { value: '', label: 'Todos' },
              ...empleados.map((e) => ({ value: String(e.id), label: e.nombre_completo })),
            ]}
          />
        </div>
      </Card>

      {/* --- El mes en cuatro números --- */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Días perfectos"
          value={num(resumen?.perfectos ?? 0)}
          hint="fichó todo el mundo"
          icon={CircleCheck}
          className="ct-stagger-item"
          style={ctStagger(0)}
        />
        <StatCard
          label="Con novedades"
          value={num(resumen?.con_novedades ?? 0)}
          hint="ausencias o inconsistencias"
          icon={TriangleAlert}
          className="ct-stagger-item"
          style={ctStagger(1)}
        />
        <StatCard
          label="Sin marcaciones"
          value={num(resumen?.sin_marcaciones ?? 0)}
          hint="nadie fichó en todo el día"
          icon={CircleX}
          className="ct-stagger-item"
          style={ctStagger(2)}
        />
        <StatCard
          label="Horas del mes"
          value={duracion(resumen?.minutos_trabajados ?? 0)}
          hint={
            (resumen?.pendientes ?? 0) > 0
              ? `${num(resumen?.pendientes ?? 0)} por revisar`
              : 'sin pendientes'
          }
          icon={CalendarDays}
          className="ct-stagger-item"
          style={ctStagger(3)}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_23rem]">
        {/* --- El calendario --- */}
        {isLoading ? (
          <Skeleton className="h-[26rem] rounded-2xl" />
        ) : (
          <Grilla
            dias={data?.dias ?? []}
            porFecha={porFecha}
            ancla={ancla}
            elegido={elegido}
            cargando={isFetching}
            onElegir={elegirDia}
          />
        )}

        {/* --- El día elegido --- */}
        <div ref={panelRef} className="min-w-0 xl:sticky xl:top-4 xl:self-start">
          <PanelDelDia
            fecha={elegido}
            dia={elegido ? porFecha.get(elegido) : undefined}
            jornadas={detalle?.resultados ?? []}
            cargando={cargandoDetalle}
          />
        </div>
      </div>
    </div>
  )
}

// --- La grilla del mes -------------------------------------------------------

function Grilla({
  dias,
  porFecha,
  ancla,
  elegido,
  cargando,
  onElegir,
}: {
  dias: DiaCalendario[]
  porFecha: Map<string, DiaCalendario>
  ancla: Date
  elegido: string | null
  cargando: boolean
  onElegir: (fecha: string) => void
}) {
  // Los huecos del principio: cuántos días de la semana anterior hay que saltar
  // para que el 1 caiga en su columna (la semana arranca en lunes).
  const celdas = useMemo(() => {
    const primero = new Date(ancla.getFullYear(), ancla.getMonth(), 1)
    const huecos = (primero.getDay() + 6) % 7
    return [...Array<null>(huecos).fill(null), ...dias.map((d) => d.fecha)]
  }, [ancla, dias])

  return (
    <Card className="p-2 sm:p-4">
      <div className="mb-2 grid grid-cols-7 gap-1 sm:gap-2">
        {DIAS_SEMANA.map((d) => (
          <div
            key={d.valor}
            className="text-center text-[10px] font-semibold uppercase tracking-wide text-ink-400 sm:text-[11px]"
          >
            <span className="hidden sm:inline">{d.corto}</span>
            <span className="sm:hidden" aria-hidden>{d.corto.charAt(0)}</span>
            <span className="sr-only sm:hidden">{d.largo}</span>
          </div>
        ))}
      </div>

      <div className={cn('grid grid-cols-7 gap-1 sm:gap-2', cargando && 'opacity-60')}>
        {celdas.map((fecha, i) =>
          fecha === null ? (
            <div key={`hueco-${i}`} aria-hidden />
          ) : (
            <Celda
              key={fecha}
              dia={porFecha.get(fecha)!}
              elegido={fecha === elegido}
              onElegir={() => onElegir(fecha)}
            />
          ),
        )}
      </div>

      <Leyenda />
    </Card>
  )
}

/**
 * Un día.
 *
 * Tres capas de lectura, de lejos a cerca: el color del fondo, la barra con la
 * composición, y los números. En pantalla chica sobreviven las dos primeras,
 * que son las que se leen de un vistazo.
 */
function Celda({
  dia,
  elegido,
  onElegir,
}: {
  dia: DiaCalendario
  elegido: boolean
  onElegir: () => void
}) {
  const info = estadoDiaDe(dia.estado)
  const Icono = info.icon
  const numero = Number(dia.fecha.slice(8))
  const mudo = dia.estado === 'sin_actividad' || dia.estado === 'futuro'

  const detalle = [
    `${diaYNumero(dia.fecha)}: ${info.label}`,
    dia.esperados > 0 ? `${dia.presentes} de ${dia.esperados} ficharon` : null,
    dia.ausentes > 0 ? `${dia.ausentes} sin fichar` : null,
    dia.con_novedad > 0 ? `${dia.con_novedad} con novedades` : null,
    dia.feriado ? `Feriado: ${dia.feriado.nombre}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <button
      type="button"
      onClick={onElegir}
      title={detalle}
      aria-label={detalle}
      aria-pressed={elegido}
      className={cn(
        'flex min-h-[3.5rem] flex-col gap-1 rounded-lg border p-1 text-left transition-all sm:min-h-[5.25rem] sm:gap-1.5 sm:p-2',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900',
        info.celda,
        dia.es_hoy && 'ring-1 ring-ink-950 ring-offset-1 ring-offset-canvas',
        elegido && 'ring-2 ring-ink-950 ring-offset-1 ring-offset-canvas',
      )}
    >
      <span className="flex w-full items-center justify-between gap-0.5">
        <span
          className={cn(
            'tnum text-[11px] font-semibold sm:text-xs',
            mudo ? 'text-ink-400' : 'text-ink-900',
          )}
        >
          {numero}
        </span>
        {!mudo && (
          <Icono
            className={cn(
              'h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5',
              dia.estado === 'verde' && 'text-emerald-600 dark:text-emerald-400',
              dia.estado === 'amarillo' && 'text-amber-600 dark:text-amber-400',
              dia.estado === 'rojo' && 'text-red-600 dark:text-red-400',
            )}
            strokeWidth={2.2}
            aria-hidden
          />
        )}
      </span>

      <BarraDelDia dia={dia} />

      {/* `min-w-0` en los dos niveles: sin eso el truncado no recorta nada y el
          nombre de un feriado largo se derrama sobre los días vecinos. */}
      <span className="mt-auto hidden w-full min-w-0 text-[10px] leading-tight text-ink-500 sm:block">
        {dia.feriado ? (
          <span className="flex min-w-0 items-center gap-1 text-violet-700 dark:text-violet-300">
            <PartyPopper className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">{dia.feriado.nombre}</span>
          </span>
        ) : dia.estado !== 'futuro' && dia.esperados > 0 ? (
          <span className="tnum">
            {dia.presentes} de {dia.esperados}
          </span>
        ) : (
          ''
        )}
      </span>
    </button>
  )
}

/**
 * La composición del día en una barra.
 *
 * Se separan los tramos con un hueco del color del fondo en vez de un borde:
 * a esta altura (6 px) una línea divisoria se comería el dato.
 */
function BarraDelDia({ dia }: { dia: DiaCalendario }) {
  if (dia.estado === 'futuro' || dia.esperados === 0) {
    return <span className="block h-1.5 rounded-full bg-ink-100 dark:bg-ink-800" aria-hidden />
  }

  const bien = Math.max(0, dia.presentes - dia.con_novedad)
  const tramos = [
    { n: bien, clase: 'bg-emerald-500' },
    { n: dia.con_novedad, clase: 'bg-amber-500' },
    { n: dia.ausentes, clase: 'bg-red-500' },
  ].filter((t) => t.n > 0)

  return (
    <span className="flex h-1.5 w-full gap-[2px] overflow-hidden" aria-hidden>
      {tramos.map((t, i) => (
        <span
          key={i}
          className={cn('block rounded-full', t.clase)}
          style={{ width: `${(t.n / dia.esperados) * 100}%` }}
        />
      ))}
    </span>
  )
}

function Leyenda() {
  const estados = ['verde', 'amarillo', 'rojo', 'sin_actividad'] as const

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3">
      {estados.map((clave) => {
        const info = ESTADO_DIA[clave]
        const Icono = info.icon
        return (
          <span
            key={clave}
            title={info.ayuda}
            className="inline-flex items-center gap-1.5 text-[11px] text-ink-500"
          >
            <Icono className="h-3.5 w-3.5 text-ink-400" strokeWidth={2} aria-hidden />
            <span className={cn('h-1.5 w-3 rounded-full', info.punto)} aria-hidden />
            {info.label}
          </span>
        )
      })}
    </div>
  )
}

// --- El día elegido ----------------------------------------------------------

function PanelDelDia({
  fecha,
  dia,
  jornadas,
  cargando,
}: {
  fecha: string | null
  dia: DiaCalendario | undefined
  jornadas: JornadaAsistencia[]
  cargando: boolean
}) {
  if (fecha === null || dia === undefined) {
    return (
      <Card className="flex h-full min-h-[14rem] flex-col items-center justify-center p-6 text-center">
        <MousePointerClick className="h-7 w-7 text-ink-300" strokeWidth={1.7} aria-hidden />
        <p className="mt-3 text-sm font-medium text-ink-700">Tocá un día</p>
        <p className="mt-1 max-w-[22rem] text-xs text-ink-400">
          Vas a ver todas las marcaciones de esa fecha: quién fichó, a qué hora y
          qué quedó por revisar.
        </p>
      </Card>
    )
  }

  const info = estadoDiaDe(dia.estado)
  const Icono = info.icon

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-ink-950">{etiquetaFecha(fecha)}</h3>
            <p className="mt-0.5 text-xs text-ink-400">{info.ayuda}</p>
          </div>
          {cargando && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-ink-400" />}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs font-medium text-ink-700">
            <Icono className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            {info.label}
          </span>
          {dia.feriado && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300">
              <PartyPopper className="h-3.5 w-3.5" aria-hidden />
              {dia.feriado.nombre}
            </span>
          )}
        </div>

        {dia.esperados > 0 && (
          <dl className="tnum mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-line py-1.5">
              <dt className="text-[10px] uppercase tracking-wide text-ink-400">Ficharon</dt>
              <dd className="text-sm font-semibold text-ink-950">
                {dia.presentes}
                <span className="text-ink-400">/{dia.esperados}</span>
              </dd>
            </div>
            <div className="rounded-lg border border-line py-1.5">
              <dt className="text-[10px] uppercase tracking-wide text-ink-400">Novedades</dt>
              <dd className="text-sm font-semibold text-ink-950">{dia.con_novedad}</dd>
            </div>
            <div className="rounded-lg border border-line py-1.5">
              <dt className="text-[10px] uppercase tracking-wide text-ink-400">Sin fichar</dt>
              <dd className="text-sm font-semibold text-ink-950">{dia.ausentes}</dd>
            </div>
          </dl>
        )}
      </div>

      {jornadas.length === 0 ? (
        <div className="p-6">
          <EmptyState
            icon={CalendarDays}
            title="Sin marcaciones ese día"
            description={
              dia.esperados > 0
                ? 'Se esperaba gente y no fichó nadie. Revisá el Panel: suele ser el reloj sin conexión, no el equipo ausente.'
                : 'Nadie tenía que trabajar y nadie fichó.'
            }
          />
        </div>
      ) : (
        <div className="max-h-[32rem] divide-y divide-line overflow-y-auto">
          {jornadas.map((jornada, i) => (
            <FilaPersona key={`${jornada.nombre}-${i}`} jornada={jornada} indice={i} />
          ))}
        </div>
      )}
    </Card>
  )
}

/** Una persona en el día: su estado, sus marcaciones y lo que quedó pendiente. */
function FilaPersona({ jornada, indice }: { jornada: JornadaAsistencia; indice: number }) {
  const info = estadoDe(jornada.estado)
  const Icono = info.icon

  // Las marcaciones tal como entraron: entrada, salida, entrada, salida…
  const marcas = jornada.tramos.flatMap((t) =>
    [t.entrada, t.salida].filter((x): x is string => Boolean(x)),
  )

  return (
    <div className="ct-stagger-fade p-3.5" style={ctStagger(indice)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink-950">{jornada.nombre}</p>
          <p className="mt-0.5 truncate text-[11px] text-ink-400">
            {jornada.horario_esperado || 'Sin horario esperado'}
            {jornada.sucursal_esperada ? ` · ${jornada.sucursal_esperada.nombre}` : ''}
          </p>
        </div>
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
            info.tono,
          )}
        >
          <Icono className="h-3 w-3" strokeWidth={2} aria-hidden />
          {info.label}
        </span>
      </div>

      {marcas.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {marcas.map((m, i) => (
            <span
              key={i}
              className="tnum rounded-md border border-line bg-ink-50 px-1.5 py-0.5 text-[11px] text-ink-700"
            >
              {horaDe(m)}
            </span>
          ))}
        </div>
      )}

      {jornada.tramos.length > 0 && <LineaDeTiempo jornada={jornada} />}

      {jornada.minutos_trabajados > 0 && (
        <p className="tnum mt-2 text-[11px] text-ink-500">
          Trabajó{' '}
          <strong className="font-semibold text-ink-900">
            {duracion(jornada.minutos_trabajados)}
          </strong>
          {jornada.minutos_esperados > 0 && ` de ${duracion(jornada.minutos_esperados)}`}
        </p>
      )}

      {jornada.inconsistencias.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {jornada.inconsistencias.map((inc) => {
            const IconoInc = iconoInconsistencia(inc.tipo)
            const resuelta = inc.estado !== 'pendiente'
            return (
              <span
                key={inc.clave}
                title={inc.motivo || inc.detalle || inc.tipo_display}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium',
                  resuelta
                    ? ESTADO_INCONSISTENCIA[inc.estado].tono
                    : severidadDe(inc.severidad).tono,
                  resuelta && 'line-through decoration-1',
                )}
              >
                <IconoInc className="h-2.5 w-2.5" strokeWidth={2.2} aria-hidden />
                {inc.tipo_display}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
