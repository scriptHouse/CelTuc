import type { CSSProperties, ReactNode } from 'react'
import { ArrowRight, Building2, CirclePause, KeyRound, Mail, Search, ShieldCheck, UserRoundX, X } from 'lucide-react'
import type { Rol } from '@/types'
import { fecha } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/Input'
import { Presencia } from '@/components/ui/StatusBadge'
import { PantallasDelRol } from '@/components/equipo/ElegirRol'
import type { Integrante } from '@/components/equipo/integrante'
import { estadoAcceso, nombreDe } from '@/components/equipo/integrante'
import { Avatar } from '@/components/equipo/piezas'

/**
 * La tarjeta de una persona (o cuenta) en las listas de Empleados y Usuarios.
 * Dice en palabras lo que antes había que deducir de íconos: si puede entrar,
 * con qué usuario, y qué ve. Toda la tarjeta abre su ficha.
 */
export function TarjetaIntegrante({
  integrante,
  roles,
  yoId,
  onAbrir,
  onDarAcceso,
  mostrarEmail,
  className,
  style,
}: {
  integrante: Integrante
  roles: Rol[]
  yoId?: number
  /** Sin esto la tarjeta es solo de lectura (cuentas sin permiso de administrar). */
  onAbrir?: () => void
  onDarAcceso?: () => void
  /** En Usuarios el email es protagonista; en Empleados, la sucursal. */
  mostrarEmail?: boolean
  className?: string
  style?: CSSProperties
}) {
  const { empleado, cuenta } = integrante
  const estado = estadoAcceso(integrante)
  const rol = cuenta?.rol ? roles.find((r) => r.id === cuenta.rol!.id) : undefined
  const esMia = Boolean(cuenta && cuenta.id === yoId)

  const contenido = (
    <>
      <div className="flex items-start gap-3">
        <Avatar texto={empleado?.nombre_completo ?? cuenta?.username ?? '?'} enLinea={cuenta?.en_linea} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-semibold text-ink-900">
            <span className="truncate">{nombreDe(integrante)}</span>
            {esMia && <span className="shrink-0 rounded-full bg-ink-100 px-1.5 py-px text-[0.65rem] font-semibold text-ink-600">vos</span>}
          </p>
          {mostrarEmail && cuenta ? (
            <p className="flex items-center gap-1.5 truncate text-sm text-ink-500">
              <Mail className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{cuenta.email}</span>
            </p>
          ) : (
            <p className="flex items-center gap-1.5 truncate text-sm text-ink-500">
              <Building2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{empleado?.sucursal?.nombre ?? (empleado ? 'Sin sucursal' : 'Cuenta sin empleado')}</span>
            </p>
          )}
        </div>
        {cuenta?.es_administrador && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-ink-900 px-2 py-0.5 text-[0.7rem] font-semibold text-on-ink">
            <ShieldCheck className="h-3 w-3" />
            {cuenta.is_superuser ? 'Superadmin' : 'Admin'}
          </span>
        )}
      </div>

      {/* ¿Puede entrar? ¿Qué ve? — en palabras */}
      <div
        className={cn(
          'mt-3 rounded-xl px-3 py-2.5 text-xs leading-relaxed',
          estado === 'activo' ? 'bg-ink-50 text-ink-600' : 'border border-dashed border-line-strong text-ink-500',
        )}
      >
        {estado === 'activo' && cuenta && (
          <>
            <p className="flex items-center gap-1.5">
              <KeyRound className="h-3.5 w-3.5 shrink-0 text-ink-900" />
              <span className="min-w-0 truncate">
                Entra como <b className="text-ink-950">{cuenta.username}</b>
              </span>
            </p>
            {cuenta.es_administrador ? (
              <p className="mt-1 pl-5">Ve y maneja todo el sistema.</p>
            ) : rol ? (
              <div className="mt-1.5 pl-5">
                <p>
                  Rol <b className="text-ink-900">{rol.nombre}</b>:
                </p>
                <PantallasDelRol rol={rol} className="mt-1" />
              </div>
            ) : (
              <p className="mt-1 pl-5">Sin rol: no ve ninguna pantalla del menú.</p>
            )}
          </>
        )}
        {estado === 'pausado' && (
          <p className="flex items-center gap-1.5">
            <CirclePause className="h-3.5 w-3.5 shrink-0" />
            <span>
              <b className="text-ink-900">Acceso pausado:</b> no puede entrar hasta que se reactive.
            </span>
          </p>
        )}
        {estado === 'sin_acceso' && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5">
              <UserRoundX className="h-3.5 w-3.5 shrink-0" />
              <span>
                <b className="text-ink-900">Sin acceso:</b> no puede entrar al sistema.
              </span>
            </p>
            {onDarAcceso && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation()
                  onDarAcceso()
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    e.stopPropagation()
                    onDarAcceso()
                  }
                }}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-ink-950 px-3 text-xs font-semibold text-on-ink transition-colors hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2"
              >
                <KeyRound className="h-3.5 w-3.5" />
                Darle acceso
              </span>
            )}
          </div>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 pt-3">
        {cuenta ? (
          <Presencia enLinea={cuenta.en_linea} ultimaActividad={cuenta.ultima_actividad} />
        ) : (
          <span className="text-xs text-ink-400">{empleado?.creado ? `En el equipo desde el ${fecha(empleado.creado)}` : ''}</span>
        )}
        {onAbrir && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink-500 transition-colors group-hover:text-ink-950">
            Abrir ficha
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        )}
      </div>
    </>
  )

  const clases = cn(
    'group flex h-full flex-col rounded-2xl border border-line bg-surface p-4 text-left shadow-[0_1px_2px_rgba(10,10,11,0.04)]',
    onAbrir &&
      'transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-ink-200 hover:shadow-[0_12px_30px_rgba(10,10,11,0.08)] motion-reduce:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
    className,
  )

  if (!onAbrir) {
    return (
      <div className={clases} style={style}>
        {contenido}
      </div>
    )
  }
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onAbrir}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onAbrir()
        }
      }}
      aria-label={`Abrir la ficha de ${nombreDe(integrante)}`}
      className={cn(clases, 'cursor-pointer')}
      style={style}
    >
      {contenido}
    </div>
  )
}

/** Buscador + filtros en chips (con su cantidad), para las listas del equipo. */
export function BarraFiltros<T extends string>({
  busqueda,
  onBusqueda,
  placeholder,
  filtros,
  filtro,
  onFiltro,
}: {
  busqueda: string
  onBusqueda: (v: string) => void
  placeholder: string
  filtros: { id: T; label: string; cantidad: number; oculto?: boolean }[]
  filtro: T
  onFiltro: (f: T) => void
}) {
  return (
    <div className="mb-4 flex flex-col gap-2.5 lg:flex-row lg:items-center">
      <div className="relative lg:w-80">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <Input
          value={busqueda}
          onChange={(e) => onBusqueda(e.target.value)}
          placeholder={placeholder}
          className="pl-10 pr-10 text-base sm:text-sm"
          aria-label={placeholder}
        />
        {busqueda && (
          <button
            type="button"
            onClick={() => onBusqueda('')}
            aria-label="Borrar búsqueda"
            className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-ink-400 hover:text-ink-900"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0 lg:pb-0" role="tablist" aria-label="Filtrar">
        {filtros
          .filter((f) => !f.oculto)
          .map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filtro === f.id}
              onClick={() => onFiltro(f.id)}
              className={cn(
                'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900',
                filtro === f.id
                  ? 'border-ink-950 bg-ink-950 text-on-ink'
                  : 'border-line-strong bg-surface text-ink-600 hover:border-ink-300 hover:text-ink-900',
              )}
            >
              {f.label}
              <span className={cn('tnum text-xs', filtro === f.id ? 'text-on-ink/70' : 'text-ink-400')}>{f.cantidad}</span>
            </button>
          ))}
      </div>
    </div>
  )
}

/** Cuando el filtro o la búsqueda no dejan nada. */
export function SinResultados({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-line-strong bg-surface px-4 py-10 text-center text-sm text-ink-500">
      {children}
    </p>
  )
}
