import { ArrowDown, ArrowUp, Equal } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { money } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Diferencia de arqueo con la convención monocromática de CelTuc: nunca solo
 * color — palabra + ícono + peso. Sólido = atención (faltante), outline =
 * sobrante, soft = cuadró.
 */
export function DiffChip({ valor, className }: { valor: number; className?: string }) {
  if (valor === 0) {
    return (
      <Badge tone="soft" className={cn('whitespace-nowrap', className)}>
        <Equal className="h-3 w-3" aria-hidden />
        Sin diferencia
      </Badge>
    )
  }
  if (valor > 0) {
    return (
      <Badge tone="outline" className={cn('whitespace-nowrap text-ink-800', className)}>
        <ArrowUp className="h-3 w-3" aria-hidden />
        Sobrante <span className="tnum">{money(valor)}</span>
      </Badge>
    )
  }
  return (
    <Badge tone="solid" className={cn('whitespace-nowrap', className)}>
      <ArrowDown className="h-3 w-3" aria-hidden />
      Faltante <span className="tnum">{money(Math.abs(valor))}</span>
    </Badge>
  )
}
