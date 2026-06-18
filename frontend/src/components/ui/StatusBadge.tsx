import { AlertTriangle, CheckCircle2, Clock, PackageX, TrendingDown } from 'lucide-react'
import type { EstadoEfectivo } from '@/types'
import { Badge } from '@/components/ui/Badge'

/**
 * Estados SIN color (paleta monocromática). La jerarquía se transmite por:
 *  - tratamiento del badge (sólido invertido = atención, suave = ok, contorno = neutro)
 *  - un ícono explícito (nunca solo color)
 *  - el texto del estado.
 */

export function FacturaEstadoBadge({ estado }: { estado: EstadoEfectivo }) {
  if (estado === 'vencida') {
    return (
      <Badge tone="solid">
        <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2} />
        Vencida
      </Badge>
    )
  }
  if (estado === 'pagada') {
    return (
      <Badge tone="soft">
        <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />
        Pagada
      </Badge>
    )
  }
  return (
    <Badge tone="outline">
      <Clock className="h-3.5 w-3.5" strokeWidth={2} />
      Pendiente
    </Badge>
  )
}

export function StockBadge({ stock, stockMinimo }: { stock: number; stockMinimo: number }) {
  if (stock <= 0) {
    return (
      <Badge tone="solid">
        <PackageX className="h-3.5 w-3.5" strokeWidth={2} />
        Sin stock
      </Badge>
    )
  }
  if (stock <= stockMinimo) {
    return (
      <Badge tone="outline">
        <TrendingDown className="h-3.5 w-3.5" strokeWidth={2} />
        Stock bajo
      </Badge>
    )
  }
  return (
    <Badge tone="soft">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-ink-700" />
      En stock
    </Badge>
  )
}

/** Punto de estado activo/inactivo (relleno vs contorno). */
export function ActivoDot({ activo }: { activo: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-600">
      <span
        aria-hidden
        className={
          activo
            ? 'h-2 w-2 rounded-full bg-ink-900'
            : 'h-2 w-2 rounded-full border border-ink-400'
        }
      />
      {activo ? 'Activo' : 'Inactivo'}
    </span>
  )
}
