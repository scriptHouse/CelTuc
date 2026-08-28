import { useEffect, useMemo, useState } from 'react'
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { ChevronRight, Fingerprint, Loader2, Search, UserRoundPlus } from 'lucide-react'
import type { FichadaAsistencia } from '@/types'
import { detalleFichada, listarFichadas } from '@/services/asistencia'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  AsignarNumeroModal,
  type DatosAsignacion,
} from '@/components/asistencia/AsignarNumeroModal'
import { haceDias, metodoDe, tipoDe } from '@/components/asistencia/constantes'
import { num } from '@/lib/format'
import { cn, ctStagger } from '@/lib/utils'

const LIMITE = 40

type Rango = 'hoy' | '7d' | '30d' | 'todo'
const RANGOS: { value: Rango; label: string }[] = [
  { value: 'hoy', label: 'Hoy' },
  { value: '7d', label: '7 días' },
  { value: '30d', label: '30 días' },
  { value: 'todo', label: 'Todo' },
]

function desdeDelRango(rango: Rango): string | undefined {
  if (rango === 'hoy') return haceDias(0)
  if (rango === '7d') return haceDias(6)
  if (rango === '30d') return haceDias(29)
  return undefined
}

const TIPOS_FILTRO = [
  { value: '', label: 'Todos los tipos' },
  { value: 'check_in', label: 'Entradas' },
  { value: 'check_out', label: 'Salidas' },
  { value: 'break_out', label: 'Salida a descanso' },
  { value: 'break_in', label: 'Vuelta de descanso' },
  { value: 'overtime_in', label: 'Entrada extra' },
  { value: 'overtime_out', label: 'Salida extra' },
  { value: 'unknown', label: 'Sin clasificar' },
]

const MAPEO_FILTRO = [
  { value: '', label: 'Todas' },
  { value: 'mapeada', label: 'Con empleado' },
  { value: 'sin_mapear', label: 'Sin asignar' },
]

function etiquetaDia(iso: string): string {
  const dia = new Date(iso)
  const hoy = new Date()
  const ayer = new Date()
  ayer.setDate(hoy.getDate() - 1)
  const mismo = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  if (mismo(dia, hoy)) return 'Hoy'
  if (mismo(dia, ayer)) return 'Ayer'
  const texto = dia.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

export function FichadasTab() {
  const [busqueda, setBusqueda] = useState('')
  const [q, setQ] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setQ(busqueda.trim()), 350)
    return () => clearTimeout(timer)
  }, [busqueda])

  const [sucursal, setSucursal] = useState('')
  const [dispositivo, setDispositivo] = useState('')
  const [tipo, setTipo] = useState('')
  const [mapeo, setMapeo] = useState('')
  const [rango, setRango] = useState<Rango>('7d')
  const [detalleId, setDetalleId] = useState<number | null>(null)
  const [asignando, setAsignando] = useState<DatosAsignacion | null>(null)

  const { data, isLoading, isFetching, isFetchingNextPage, fetchNextPage, hasNextPage } =
    useInfiniteQuery({
      queryKey: ['asistencia', 'fichadas', q, sucursal, dispositivo, tipo, mapeo, rango],
      queryFn: ({ pageParam }) =>
        listarFichadas({
          q,
          sucursal: sucursal ? Number(sucursal) : '',
          dispositivo: dispositivo ? Number(dispositivo) : '',
          tipo,
          mapeo,
          desde: desdeDelRango(rango),
          limit: LIMITE,
          offset: pageParam,
        }),
      initialPageParam: 0,
      getNextPageParam: (ultima, paginas) => {
        const cargadas = paginas.reduce((n, p) => n + p.resultados.length, 0)
        return cargadas < ultima.total ? cargadas : undefined
      },
      placeholderData: keepPreviousData,
    })

  const primera = data?.pages[0]
  const fichadas = useMemo(() => data?.pages.flatMap((p) => p.resultados) ?? [], [data])
  const relojes = primera?.dispositivos ?? []
  const sucursales = primera?.sucursales ?? []

  // Elegida una sucursal, la lista de relojes se acota a los suyos: ofrecer
  // relojes de otra sucursal solo lleva a combinaciones que no devuelven nada.
  const relojesVisibles = sucursal
    ? relojes.filter((r) => String(r.sucursal_id) === sucursal)
    : relojes

  const porDia = useMemo(() => {
    const grupos: { dia: string; filas: FichadaAsistencia[] }[] = []
    for (const f of fichadas) {
      const dia = etiquetaDia(f.ocurrida_en)
      const ultimo = grupos[grupos.length - 1]
      if (ultimo && ultimo.dia === dia) ultimo.filas.push(f)
      else grupos.push({ dia, filas: [f] })
    }
    return grupos
  }, [fichadas])

  return (
    <div>
      <Card className="mb-5 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <Input
              placeholder="Buscar por empleado, nombre o número del reloj…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="pl-10 text-base sm:text-sm"
            />
          </div>
          <Select
            placeholder="Todas las sucursales"
            value={sucursal}
            onChange={(v) => {
              setSucursal(v)
              // El reloj elegido puede ser de otra sucursal: los dos filtros
              // juntos darian una lista vacia sin explicar por que.
              setDispositivo('')
            }}
            options={[
              { value: '', label: 'Todas las sucursales' },
              ...sucursales.map((s) => ({ value: String(s.id), label: s.nombre })),
            ]}
          />
          <Select
            placeholder="Todos los relojes"
            value={dispositivo}
            onChange={setDispositivo}
            options={[
              { value: '', label: 'Todos los relojes' },
              ...relojesVisibles.map((r) => ({
                value: String(r.id),
                label: `${r.nombre} · ${r.sucursal}`,
              })),
            ]}
          />
          <Select placeholder="Todos los tipos" value={tipo} onChange={setTipo} options={TIPOS_FILTRO} />
          <Select placeholder="Todas" value={mapeo} onChange={setMapeo} options={MAPEO_FILTRO} />
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
          {isFetching && !isFetchingNextPage && !isLoading && (
            <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin text-ink-400" />
          )}
          <span className="ml-auto tnum text-xs text-ink-400">
            {primera ? `${num(fichadas.length)} de ${num(primera.total)} fichadas` : ''}
          </span>
        </div>
      </Card>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-14 rounded-2xl" />
          ))}
        </div>
      ) : fichadas.length === 0 ? (
        <EmptyState
          icon={Fingerprint}
          title="Sin fichadas en este filtro"
          description="Cuando el reloj registre movimientos y la notebook sincronice, van a aparecer acá solas."
        />
      ) : (
        <div className="space-y-5">
          {porDia.map((grupo) => (
            <section key={grupo.dia}>
              <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-400">
                {grupo.dia}
              </h3>
              <Card className="overflow-hidden">
                <ul className="divide-y divide-line">
                  {grupo.filas.map((f, i) => (
                    <FilaFichada
                      key={f.id}
                      fichada={f}
                      indice={i}
                      onVer={() => setDetalleId(f.id)}
                      onAsignar={(numero, dispositivoId) =>
                        setAsignando({ numero, dispositivoId })
                      }
                    />
                  ))}
                </ul>
              </Card>
            </section>
          ))}
          {hasNextPage && (
            <div className="flex justify-center pt-1">
              <Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                {isFetchingNextPage ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Cargando…
                  </>
                ) : (
                  'Cargar más'
                )}
              </Button>
            </div>
          )}
        </div>
      )}

      <DetalleFichadaModal id={detalleId} onClose={() => setDetalleId(null)} />
      <AsignarNumeroModal datos={asignando} onClose={() => setAsignando(null)} />
    </div>
  )
}

function FilaFichada({
  fichada,
  indice,
  onVer,
  onAsignar,
}: {
  fichada: FichadaAsistencia
  indice: number
  onVer: () => void
  onAsignar?: (numero: string, dispositivoId: number) => void
}) {
  const tipo = tipoDe(fichada.tipo)
  const metodo = metodoDe(fichada.metodo)
  const TipoIcono = tipo.icon
  const MetodoIcono = metodo.icon
  const esEntrada = fichada.tipo === 'check_in' || fichada.tipo === 'overtime_in'
  const esSalida = fichada.tipo === 'check_out' || fichada.tipo === 'overtime_out'

  return (
    <li
      className="ct-stagger-fade group flex cursor-pointer items-center gap-3.5 px-4 py-3 transition-colors hover:bg-ink-50"
      style={ctStagger(indice)}
      onClick={onVer}
    >
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border',
          esEntrada
            ? 'border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-400'
            : esSalida
              ? 'border-line bg-ink-100 text-ink-600'
              : 'border-line bg-surface text-ink-400',
        )}
        aria-hidden
      >
        <TipoIcono className="h-4 w-4" strokeWidth={1.85} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink-950">
          {fichada.empleado ? (
            fichada.empleado.nombre
          ) : (
            <>
              {fichada.nombre_reloj || `Nº ${fichada.numero_reloj || 's/n'}`}
              <Badge tone="outline" className="ml-2 align-middle text-amber-600 dark:text-amber-400">
                sin asignar
              </Badge>
            </>
          )}
        </p>
        <p className="truncate text-xs text-ink-400">
          {tipo.label} · {fichada.sucursal.nombre} · {fichada.dispositivo.nombre}
          {fichada.numero_reloj ? ` · Nº ${fichada.numero_reloj}` : ''}
        </p>
      </div>

      <span className="hidden items-center gap-1 text-xs text-ink-400 sm:inline-flex" title={metodo.label}>
        <MetodoIcono className="h-3.5 w-3.5" strokeWidth={1.85} aria-hidden />
        {metodo.label}
      </span>

      {!fichada.empleado && onAsignar && (
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            onAsignar(fichada.numero_reloj, fichada.dispositivo.id)
          }}
        >
          <UserRoundPlus className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Asignar</span>
        </Button>
      )}

      <span className="tnum text-sm font-semibold text-ink-900">{hora(fichada.ocurrida_en)}</span>
      <ChevronRight className="h-4 w-4 text-ink-300 transition-colors group-hover:text-ink-600" aria-hidden />
    </li>
  )
}

function DetalleFichadaModal({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['asistencia', 'fichada', id],
    queryFn: () => detalleFichada(id as number),
    enabled: id !== null,
  })

  return (
    <Modal open={id !== null} onClose={onClose} size="lg">
      <div className="min-h-0 overflow-y-auto p-5 sm:p-6">
        <h3 className="text-lg font-semibold text-ink-950">Detalle de la fichada</h3>
        {isLoading || !data ? (
          <Skeleton className="mt-4 h-48 rounded-xl" />
        ) : (
          <>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
              <Dato etiqueta="Empleado" valor={data.empleado?.nombre ?? 'Sin asignar'} />
              <Dato etiqueta="Nº en el reloj" valor={data.numero_reloj || '—'} />
              <Dato etiqueta="Nombre en el reloj" valor={data.nombre_reloj || '—'} />
              <Dato etiqueta="Tipo" valor={tipoDe(data.tipo).label} />
              <Dato etiqueta="Método" valor={metodoDe(data.metodo).label} />
              <Dato etiqueta="Reloj" valor={`${data.dispositivo.nombre} · ${data.sucursal.nombre}`} />
              <Dato etiqueta="Ocurrió" valor={new Date(data.ocurrida_en).toLocaleString('es-AR')} />
              <Dato etiqueta="Llegó al servidor" valor={new Date(data.recibida_en).toLocaleString('es-AR')} />
              <Dato etiqueta="Subida por" valor={data.agente ?? '—'} />
            </dl>
            <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-ink-400">
              Payload original del reloj
            </p>
            <pre className="tnum mt-2 max-h-64 overflow-auto rounded-xl border border-line bg-ink-50 p-3 text-xs text-ink-700">
              {JSON.stringify(data.raw_payload, null, 2)}
            </pre>
          </>
        )}
        <div className="mt-5 flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-400">{etiqueta}</dt>
      <dd className="mt-0.5 font-medium text-ink-900">{valor}</dd>
    </div>
  )
}
