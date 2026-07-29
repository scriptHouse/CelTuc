import { Building2, ShieldAlert } from 'lucide-react'
import type { Emisor } from '@/types'
import { pad } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Tarjeta de una cuenta (emisor) en el selector agrupado. Los Responsables
 * Inscriptos se destacan con una barrita de acento a la izquierda y un badge de
 * zona: verde = Yerba Buena, azul = Centro. Los monotributistas van planos.
 *
 * Vive acá (y no en la página) porque la usan tanto Facturación como la venta
 * de mostrador de Caja: una sola tarjeta, misma lectura en los dos lugares.
 */
export function CuentaCard({
  emisor: e,
  activa,
  onSelect,
}: {
  emisor: Emisor
  activa: boolean
  onSelect: () => void
}) {
  const esRI = e.condicion === 'responsable_inscripto'
  const esYB = esRI && e.responsable_yb
  return (
    <button
      type="button"
      onClick={onSelect}
      title={e.nombre}
      className={cn(
        'group relative flex items-center gap-3 overflow-hidden rounded-2xl border p-3 text-left transition-all duration-200',
        activa
          ? 'border-ink-950 bg-ink-950 text-on-ink shadow-[0_10px_30px_rgba(10,10,11,0.18)]'
          : 'border-line bg-surface hover:border-ink-300 hover:shadow-sm',
        !e.activo && !activa && 'opacity-60',
      )}
    >
      {esRI && (
        <span
          aria-hidden
          className={cn('absolute inset-y-0 left-0 w-1', esYB ? 'bg-emerald-500' : 'bg-blue-500')}
        />
      )}
      <span
        className={cn(
          'grid h-10 w-10 shrink-0 place-items-center rounded-xl',
          activa ? 'bg-on-ink/15 text-on-ink' : 'bg-ink-100 text-ink-700',
        )}
      >
        <Building2 className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="block truncate text-sm font-semibold">{e.nombre}</span>
          {!e.tiene_credenciales && (
            <ShieldAlert
              className={cn('h-3.5 w-3.5 shrink-0', activa ? 'text-on-ink/80' : 'text-amber-500')}
            />
          )}
        </span>
        <span className={cn('tnum mt-0.5 block truncate text-xs', activa ? 'text-on-ink/70' : 'text-ink-400')}>
          {esRI ? 'Resp. Inscripto' : 'Monotributo'} · PV {pad(e.punto_venta, 4)}
          {!e.activo && ' · Inactivo'}
        </span>
        {esRI && (
          <span
            className={cn(
              'mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
              esYB
                ? activa
                  ? 'bg-emerald-400/20 text-emerald-200'
                  : 'bg-emerald-50 text-emerald-700'
                : activa
                  ? 'bg-blue-400/20 text-blue-200'
                  : 'bg-blue-50 text-blue-700',
            )}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', esYB ? 'bg-emerald-500' : 'bg-blue-500')} />
            {esYB ? 'Yerba Buena' : 'Centro'}
          </span>
        )}
      </span>
    </button>
  )
}
