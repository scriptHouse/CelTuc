import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  Fingerprint,
  Hourglass,
  LayoutDashboard,
  ListChecks,
  Loader2,
  MonitorSmartphone,
  Palmtree,
  RefreshCw,
  Settings2,
  UserRoundSearch,
  Watch,
  Wifi,
  WifiOff,
} from 'lucide-react'
import type { RelojPanelAsistencia } from '@/types'
import { panelAsistencia, reintentarConexionReloj } from '@/services/asistencia'
import { useToast } from '@/components/ToastProvider'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { CalendarioTab } from '@/components/asistencia/CalendarioTab'
import { EmpleadoTab } from '@/components/asistencia/EmpleadoTab'
import { FichadasTab } from '@/components/asistencia/FichadasTab'
import { InconsistenciasTab } from '@/components/asistencia/InconsistenciasTab'
import { ResumenTab } from '@/components/asistencia/ResumenTab'
import { TurnosTab } from '@/components/asistencia/TurnosTab'
import { LicenciasTab } from '@/components/asistencia/LicenciasTab'
import { MapeoTab } from '@/components/asistencia/MapeoTab'
import { ConfigTab } from '@/components/asistencia/ConfigTab'
import { num, tiempoRelativo } from '@/lib/format'
import { cn, ctStagger } from '@/lib/utils'

type Tab =
  | 'panel'
  | 'resumen'
  | 'inconsistencias'
  | 'fichadas'
  | 'turnos'
  | 'calendario'
  | 'licencias'
  | 'empleados'
  | 'identificadores'
  | 'config'

const TABS: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'panel', label: 'Panel', icon: LayoutDashboard },
  { id: 'resumen', label: 'Resumen', icon: CalendarRange },
  { id: 'inconsistencias', label: 'Inconsistencias', icon: AlertTriangle },
  { id: 'fichadas', label: 'Fichadas', icon: ListChecks },
  { id: 'turnos', label: 'Turnos', icon: CalendarClock },
  { id: 'calendario', label: 'Calendario', icon: CalendarDays },
  { id: 'licencias', label: 'Licencias', icon: Palmtree },
  { id: 'empleados', label: 'Empleados', icon: UserRoundSearch },
  { id: 'identificadores', label: 'Identificadores', icon: Fingerprint },
  { id: 'config', label: 'Configuración', icon: Settings2 },
]

export function AsistenciaPage() {
  const [tab, setTab] = useState<Tab>('panel')

  return (
    <div className="animate-fade-in">
      <PageHeader
        icon={Fingerprint}
        eyebrow="Solo superadministrador"
        title="Asistencia"
        subtitle="Fichadas del reloj facial de cada sucursal, sincronizadas solas: reloj → notebook → CelTuc."
        className="ct-rise"
      />

      <div
        role="tablist"
        aria-label="Secciones de asistencia"
        className="mb-5 -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
      >
        {TABS.map((t) => {
          const activa = t.id === tab
          const Icono = t.icon
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activa}
              onClick={() => setTab(t.id)}
              className={cn(
                'inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900',
                activa
                  ? 'border-ink-950 bg-ink-950 text-on-ink shadow-[0_10px_30px_rgba(10,10,11,0.18)]'
                  : 'border-line bg-surface text-ink-500 hover:border-line-strong hover:text-ink-900',
              )}
            >
              <Icono className="h-4 w-4" strokeWidth={1.85} />
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'panel' && <PanelTab />}
      {tab === 'resumen' && <ResumenTab />}
      {tab === 'inconsistencias' && <InconsistenciasTab />}
      {tab === 'fichadas' && <FichadasTab />}
      {tab === 'turnos' && <TurnosTab />}
      {tab === 'calendario' && <CalendarioTab />}
      {tab === 'licencias' && <LicenciasTab />}
      {tab === 'empleados' && <EmpleadoTab />}
      {tab === 'identificadores' && <MapeoTab />}
      {tab === 'config' && <ConfigTab />}
    </div>
  )
}

// --- Panel: monitoreo en vivo ------------------------------------------------

function PanelTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['asistencia', 'panel'],
    queryFn: panelAsistencia,
    refetchInterval: 30_000,
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    )
  }

  const totales = data?.totales
  const relojes = data?.dispositivos ?? []

  return (
    <div>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Fichadas de hoy"
          value={num(totales?.fichadas_hoy ?? 0)}
          icon={Fingerprint}
          className="ct-stagger-item"
          style={ctStagger(0)}
        />
        <StatCard
          label="Equipos en línea"
          value={`${totales?.agentes_en_linea ?? 0} de ${totales?.agentes_total ?? 0}`}
          hint="Notebooks reportando"
          icon={Activity}
          className="ct-stagger-item"
          style={ctStagger(1)}
        />
        <StatCard
          label="Pendientes de subir"
          value={num(totales?.eventos_pendientes ?? 0)}
          hint="En las notebooks"
          icon={MonitorSmartphone}
          className="ct-stagger-item"
          style={ctStagger(2)}
        />
        <StatCard
          label="Sin asignar"
          value={num(totales?.sin_mapear ?? 0)}
          hint="Fichadas sin empleado"
          icon={UserRoundSearch}
          className="ct-stagger-item"
          style={ctStagger(3)}
        />
      </div>

      {relojes.length === 0 ? (
        <EmptyState
          icon={Watch}
          title="Todavía no hay relojes configurados"
          description="Cargá el primer reloj y su agente desde la pestaña Configuración: ahí está la guía completa de instalación."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {relojes.map((reloj, i) => (
            <TarjetaReloj key={reloj.id} reloj={reloj} indice={i} />
          ))}
        </div>
      )}
    </div>
  )
}

function PuntoEstado({ ok, label }: { ok: boolean | null; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
      <span
        className={cn(
          'h-2 w-2 rounded-full',
          ok === null ? 'bg-ink-300' : ok ? 'bg-emerald-500' : 'bg-red-500',
        )}
        aria-hidden
      />
      <span className={cn(ok === false ? 'text-red-600 dark:text-red-400' : 'text-ink-600')}>
        {label}
      </span>
    </span>
  )
}

function TarjetaReloj({ reloj, indice }: { reloj: RelojPanelAsistencia; indice: number }) {
  const agente = reloj.agentes[0]
  const notebookOnline = reloj.en_linea
  const relojOnline = notebookOnline ? (reloj.reloj_en_linea ?? null) : null

  return (
    <Card className="ct-stagger-item p-5" style={ctStagger(indice)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-ink-400">{reloj.sucursal.nombre}</p>
          <h3 className="mt-0.5 flex items-center gap-2 text-base font-semibold text-ink-950">
            <Watch className="h-4 w-4 text-ink-400" strokeWidth={1.85} />
            {reloj.nombre}
          </h3>
          <p className="tnum mt-0.5 text-xs text-ink-400">
            {reloj.modelo || 'DS-K1A340WX'}
            {reloj.numero_serie ? ` · ${reloj.numero_serie}` : ''} · {reloj.host}
          </p>
        </div>
        {notebookOnline ? (
          <Wifi className="h-5 w-5 shrink-0 text-emerald-500" strokeWidth={1.85} aria-hidden />
        ) : (
          <WifiOff className="h-5 w-5 shrink-0 text-ink-300" strokeWidth={1.85} aria-hidden />
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        <PuntoEstado
          ok={relojOnline}
          label={relojOnline === null ? 'Reloj: sin datos' : relojOnline ? 'Reloj en línea' : 'Reloj sin conexión'}
        />
        <PuntoEstado ok={notebookOnline} label={notebookOnline ? 'Notebook en línea' : 'Notebook apagada'} />
        {!reloj.activo && <Badge tone="outline">Desactivado</Badge>}
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4 text-sm">
        <div>
          <dt className="text-xs text-ink-400">Última fichada</dt>
          <dd className="tnum mt-0.5 font-medium text-ink-900">
            {reloj.ultima_fichada ? tiempoRelativo(reloj.ultima_fichada) : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-400">Hoy</dt>
          <dd className="tnum mt-0.5 font-medium text-ink-900">{num(reloj.fichadas_hoy)}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-400">Pendientes</dt>
          <dd className="tnum mt-0.5 font-medium text-ink-900">
            {num(agente?.eventos_pendientes ?? 0)}
          </dd>
        </div>
      </dl>

      {agente ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-400">
          <span className="tnum">{agente.hostname || agente.nombre}</span>
          {agente.version && <span className="tnum">v{agente.version}</span>}
          <span>
            heartbeat: {agente.ultimo_heartbeat ? tiempoRelativo(agente.ultimo_heartbeat) : 'nunca'}
          </span>
          {agente.eventos_error > 0 && (
            <span className="text-amber-600 dark:text-amber-400">
              {agente.eventos_error} con error local
            </span>
          )}
        </div>
      ) : (
        <p className="mt-3 text-xs text-ink-400">
          Sin agente: crealo en Configuración para que este reloj sincronice.
        </p>
      )}

      {agente?.reloj_error && !relojOnline && notebookOnline && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {agente.reloj_error}
        </p>
      )}

      {relojOnline === false &&
        (reloj.reloj_bloqueado ? (
          <EsperandoDesbloqueo segundos={reloj.segundos_de_bloqueo} />
        ) : (
          <BotonReintentar reloj={reloj} />
        ))}
    </Card>
  )
}

/**
 * Durante un bloqueo del reloj no se ofrece reintentar, y se dice por qué.
 *
 * El equipo cierra el acceso tras varios intentos fallidos, y cada intento
 * nuevo durante ese lapso **reinicia su contador**: insistir no adelanta nada,
 * lo alarga. El agente ya lo espera solo, así que lo único correcto acá es
 * explicar y mostrar cuánto falta.
 */
function EsperandoDesbloqueo({ segundos }: { segundos: number }) {
  const minutos = Math.floor(segundos / 60)
  const resto = segundos % 60

  return (
    <div className="mt-3 flex items-start gap-2 border-t border-line pt-3 text-xs text-ink-500">
      <Hourglass className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" strokeWidth={1.9} aria-hidden />
      <p>
        <span className="font-medium text-ink-700">
          Se libera solo en {minutos > 0 ? `${minutos} min ` : ''}
          {resto} s.
        </span>{' '}
        No se puede apurar: mientras dura el bloqueo, cada intento nuevo reinicia
        ese contador y lo alargaría. El agente se reconecta apenas se libere.
      </p>
    </div>
  )
}

/**
 * «Reintentar ahora» cuando el reloj figura caído.
 *
 * CelTuc no puede probarlo por su cuenta: el reloj está en la red de la
 * sucursal y solo la notebook lo alcanza. Lo que hace el botón es dejarle el
 * pedido al agente, que lo toma en su próximo heartbeat y saltea la espera del
 * reintento automático. Por eso el mensaje dice cuándo va a pasar y no promete
 * que ya pasó — y si la notebook está apagada, lo dice también.
 */
function BotonReintentar({ reloj }: { reloj: RelojPanelAsistencia }) {
  const toast = useToast()
  const queryClient = useQueryClient()

  const reintentar = useMutation({
    mutationFn: () => reintentarConexionReloj(reloj.id),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['asistencia', 'panel'] })
      if (r.hay_agente_en_linea) toast.success('Pedido enviado', r.detalle)
      else toast.info('Pedido guardado', r.detalle)
    },
    onError: (e: Error) => {
      // El backend contesta 409 si el reloj se bloqueó entre que se dibujó el
      // botón y se apretó. No es una falla: es la respuesta correcta.
      queryClient.invalidateQueries({ queryKey: ['asistencia', 'panel'] })
      toast.info('No hace falta reintentar', e.message)
    },
  })

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line pt-3">
      <Button
        variant="outline"
        size="sm"
        onClick={() => reintentar.mutate()}
        disabled={reintentar.isPending}
      >
        {reintentar.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
        Reintentar conexión
      </Button>
      <span className="text-xs text-ink-400">
        {reloj.reintento_pedido
          ? `Último pedido: ${tiempoRelativo(reloj.reintento_pedido)}`
          : 'Le pide a la notebook que vuelva a probar el reloj ahora.'}
      </span>
    </div>
  )
}
