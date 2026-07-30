import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query'
import {
  Activity,
  CalendarDays,
  ChevronDown,
  History,
  Loader2,
  LogIn,
  MoveRight,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { AccionAuditoria, RegistroAuditoria } from '@/types'
import { listarAuditoria } from '@/services/auditoria'
import { num, pad } from '@/lib/format'
import { cn, ctStagger } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'

const LIMITE = 40

/** Verbo en pasado de cada acción, para armar la oración del renglón. */
const VERBOS: Record<AccionAuditoria, string> = {
  crear: 'creó',
  editar: 'editó',
  eliminar: 'eliminó',
  restaurar: 'restauró',
  ingreso: 'inició sesión',
}

const ICONOS: Record<AccionAuditoria, LucideIcon> = {
  crear: Plus,
  editar: Pencil,
  eliminar: Trash2,
  restaurar: RotateCcw,
  ingreso: LogIn,
}

/** Módulos disponibles para filtrar (alineado con el backend). */
const MODULOS = [
  { value: '', label: 'Todos los módulos' },
  { value: 'inventario', label: 'Inventario' },
  { value: 'facturacion', label: 'Facturación' },
  { value: 'caja', label: 'Caja' },
  { value: 'productos', label: 'Productos' },
  { value: 'usuarios', label: 'Usuarios' },
  { value: 'empleados', label: 'Empleados' },
  { value: 'cotizaciones', label: 'Cotizaciones' },
  { value: 'precios_service', label: 'Service' },
  { value: 'comunicados', label: 'Comunicados' },
  { value: 'comun', label: 'Preferencias' },
]

const ACCIONES = [
  { value: '', label: 'Todas las acciones' },
  { value: 'crear', label: 'Creaciones' },
  { value: 'editar', label: 'Ediciones' },
  { value: 'eliminar', label: 'Eliminaciones' },
  { value: 'restaurar', label: 'Restauraciones' },
  { value: 'ingreso', label: 'Inicios de sesión' },
]

type Rango = 'hoy' | '7d' | '30d' | 'todo'

const RANGOS: { value: Rango; label: string }[] = [
  { value: 'hoy', label: 'Hoy' },
  { value: '7d', label: '7 días' },
  { value: '30d', label: '30 días' },
  { value: 'todo', label: 'Todo' },
]

/** Fecha local `aaaa-mm-dd` desde la que abarca el rango elegido. */
function desdeDelRango(rango: Rango): string | undefined {
  if (rango === 'todo') return undefined
  const d = new Date()
  if (rango === '7d') d.setDate(d.getDate() - 6)
  if (rango === '30d') d.setDate(d.getDate() - 29)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`
}

/** "Hoy", "Ayer" o "martes 29 de julio" para los separadores del historial. */
function etiquetaDia(iso: string): string {
  const d = new Date(iso)
  const hoy = new Date()
  const ayer = new Date()
  ayer.setDate(hoy.getDate() - 1)
  if (d.toDateString() === hoy.toDateString()) return 'Hoy'
  if (d.toDateString() === ayer.toDateString()) return 'Ayer'
  const texto = d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

/** Palabras femeninas para elegir el artículo de la oración. */
const FEMENINAS = new Set([
  'venta', 'sucursal', 'categoria', 'categoría', 'configuracion', 'configuración',
  'cotizacion', 'cotización', 'preferencia', 'caja', 'factura', 'cuenta', 'sesion', 'sesión',
])

/**
 * La frase del renglón después del username: "creó la venta …", "editó el
 * producto …". Si la foto del objeto ya arranca nombrándose ("Venta #12 …"),
 * no se repite el sustantivo.
 */
function fraseDe(registro: RegistroAuditoria): { verbo: string; sustantivo: string; objeto: string } {
  const verbo = VERBOS[registro.accion] ?? registro.accion_display.toLowerCase()
  if (registro.accion === 'ingreso') return { verbo, sustantivo: '', objeto: '' }
  const primera = registro.modelo.split(' ')[0]?.toLowerCase() ?? ''
  const seNombra = primera !== '' && registro.objeto.toLowerCase().startsWith(primera)
  if (seNombra) return { verbo, sustantivo: '', objeto: registro.objeto }
  const articulo = FEMENINAS.has(primera) ? 'la' : 'el'
  return { verbo, sustantivo: `${articulo} ${registro.modelo}`, objeto: registro.objeto }
}

/** Valor de un cambio listo para mostrar (el backend manda tipos crudos). */
function valorLegible(valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '—'
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No'
  if (Array.isArray(valor)) return valor.length ? valor.map(String).join(', ') : '—'
  if (typeof valor === 'object') return JSON.stringify(valor)
  return String(valor)
}

export function AuditoriaPage() {
  // Búsqueda con un pequeño debounce para no consultar en cada tecla.
  const [busqueda, setBusqueda] = useState('')
  const [q, setQ] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setQ(busqueda.trim()), 350)
    return () => clearTimeout(timer)
  }, [busqueda])

  const [usuario, setUsuario] = useState('')
  const [accion, setAccion] = useState('')
  const [app, setApp] = useState('')
  const [rango, setRango] = useState<Rango>('7d')

  const { data, isLoading, isFetching, isFetchingNextPage, fetchNextPage, hasNextPage } =
    useInfiniteQuery({
      queryKey: ['auditoria', q, usuario, accion, app, rango],
      queryFn: ({ pageParam }) =>
        listarAuditoria({
          q, usuario, accion, app,
          desde: desdeDelRango(rango),
          limit: LIMITE,
          offset: pageParam,
        }),
      initialPageParam: 0,
      getNextPageParam: (ultima, paginas) => {
        const cargados = paginas.reduce((n, p) => n + p.resultados.length, 0)
        return cargados < ultima.total ? cargados : undefined
      },
      placeholderData: keepPreviousData,
    })

  const primera = data?.pages[0]
  const registros = useMemo(() => data?.pages.flatMap((p) => p.resultados) ?? [], [data])
  const resumen = primera?.resumen
  const usuariosDelHistorial = primera?.usuarios ?? []

  // Agrupado por día calendario, en el orden en que ya vienen (descendente).
  const porDia = useMemo(() => {
    const grupos: { dia: string; filas: RegistroAuditoria[] }[] = []
    for (const registro of registros) {
      const dia = etiquetaDia(registro.creado)
      const ultimo = grupos[grupos.length - 1]
      if (ultimo && ultimo.dia === dia) ultimo.filas.push(registro)
      else grupos.push({ dia, filas: [registro] })
    }
    return grupos
  }, [registros])

  const hayFiltros = Boolean(q || usuario || accion || app || rango !== 'todo')

  return (
    <div className="animate-fade-in">
      <PageHeader
        icon={History}
        eyebrow="Control"
        title="Auditoría"
        subtitle="Todo lo que pasó en el sistema: quién lo hizo, cuándo y qué cambió."
        className="ct-rise"
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          className="ct-stagger-item"
          style={ctStagger(0)}
          label="Acciones hoy"
          value={num(resumen?.hoy ?? 0)}
          icon={Activity}
        />
        <StatCard
          className="ct-stagger-item"
          style={ctStagger(1)}
          label="Últimos 7 días"
          value={num(resumen?.semana ?? 0)}
          icon={CalendarDays}
        />
        <StatCard
          className="ct-stagger-item"
          style={ctStagger(2)}
          label="Usuarios activos hoy"
          value={num(resumen?.usuarios_hoy ?? 0)}
          icon={Users}
        />
        <StatCard
          className="ct-stagger-item"
          style={ctStagger(3)}
          label="Historial completo"
          value={num(resumen?.total ?? 0)}
          hint="Acciones registradas"
          icon={History}
        />
      </div>

      {/* Filtros */}
      <Card className="mb-5 p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <Input
              placeholder="Buscar una venta, un producto, un usuario…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="pl-10 text-base sm:text-sm"
            />
          </div>
          <Select
            placeholder="Todos los usuarios"
            value={usuario}
            onChange={setUsuario}
            options={[
              { value: '', label: 'Todos los usuarios' },
              ...usuariosDelHistorial.map((u) => ({ value: u, label: `@${u}` })),
            ]}
          />
          <Select placeholder="Todas las acciones" value={accion} onChange={setAccion} options={ACCIONES} />
          <Select placeholder="Todos los módulos" value={app} onChange={setApp} options={MODULOS} />
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
            {primera ? `${num(registros.length)} de ${num(primera.total)} acciones` : ''}
          </span>
        </div>
      </Card>

      {/* Historial */}
      {isLoading ? (
        <FeedSkeleton />
      ) : registros.length === 0 ? (
        <EmptyState
          icon={History}
          title="Sin actividad"
          description={
            hayFiltros
              ? 'No hay acciones que coincidan con los filtros. Probá ampliar el rango de fechas.'
              : 'Todavía no hay acciones registradas. El historial se escribe solo a medida que el equipo usa el sistema.'
          }
        />
      ) : (
        <div className="space-y-5">
          {porDia.map((grupo, g) => (
            <section key={grupo.dia} className="ct-stagger-item" style={ctStagger(Math.min(g, 8))}>
              <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-ink-400">
                {grupo.dia}
              </h2>
              <Card className="divide-y divide-line">
                {grupo.filas.map((registro) => (
                  <FilaAuditoria key={registro.id} registro={registro} />
                ))}
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
    </div>
  )
}

// ===== Renglón del historial =====

function FilaAuditoria({ registro }: { registro: RegistroAuditoria }) {
  const [abierto, setAbierto] = useState(false)
  const Icono = ICONOS[registro.accion] ?? Activity
  const { verbo, sustantivo, objeto } = fraseDe(registro)
  const cambios = Object.entries(registro.cambios ?? {})
  const quien = registro.usuario_username || registro.usuario?.username || 'sistema'
  const nombre = registro.usuario?.nombre

  return (
    <div className="px-4 py-3 sm:px-5">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full',
            registro.accion === 'eliminar' ? 'bg-ink-950 text-on-ink' : 'bg-ink-100 text-ink-900',
          )}
          title={registro.accion_display}
        >
          <Icono className="h-4 w-4" strokeWidth={2} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm leading-snug text-ink-700">
            <span className="font-semibold text-ink-950" title={nombre || undefined}>
              {quien}
            </span>{' '}
            {verbo}
            {sustantivo ? ` ${sustantivo}` : ''}
            {objeto && (
              <>
                {' '}
                <span className="font-semibold text-ink-950">{objeto}</span>
              </>
            )}
          </p>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <Badge tone="soft">{registro.modulo}</Badge>
            <span className="tnum text-xs text-ink-400">{hora(registro.creado)} h</span>
            {cambios.length > 0 && (
              <button
                type="button"
                onClick={() => setAbierto((v) => !v)}
                className="flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-xs font-medium text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
              >
                {cambios.length === 1 ? '1 cambio' : `${cambios.length} cambios`}
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', abierto && 'rotate-180')} />
              </button>
            )}
          </div>

          {abierto && cambios.length > 0 && (
            <div className="mt-2.5 space-y-2 rounded-xl bg-canvas/60 p-3">
              {cambios.map(([campo, cambio]) => (
                <div key={campo} className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
                  <span className="w-full shrink-0 text-xs font-medium capitalize text-ink-500 sm:w-40">
                    {campo}
                  </span>
                  <span className="min-w-0 text-xs leading-relaxed">
                    <span className="break-words text-ink-400 line-through decoration-ink-300">
                      {valorLegible(cambio.antes)}
                    </span>
                    <MoveRight className="mx-1.5 inline h-3 w-3 shrink-0 text-ink-400" />
                    <span className="break-words font-semibold text-ink-900">
                      {valorLegible(cambio.despues)}
                    </span>
                  </span>
                </div>
              ))}
              {registro.ip && (
                <p className="pt-0.5 text-[0.7rem] text-ink-400">Desde la IP {registro.ip}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ===== Esqueleto =====

function FeedSkeleton(): ReactNode {
  return (
    <div className="space-y-5">
      {[3, 2].map((filas, s) => (
        <div key={s}>
          <Skeleton className="mb-2 h-3.5 w-24" />
          <Card className="divide-y divide-line">
            {Array.from({ length: filas }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="flex-1 space-y-2 py-0.5">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </Card>
        </div>
      ))}
    </div>
  )
}
