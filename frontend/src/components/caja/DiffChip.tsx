import { ArrowDown, ArrowUp, Equal } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { plata } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Diferencia de arqueo con la convención monocromática de CelTuc: nunca solo
 * color — palabra + ícono + peso. Sólido = atención (falta plata), outline =
 * sobra, soft = cuadró. Las palabras son las de todos los días («Falta»,
 * «Sobra», «Cuadra»), no las del contador.
 */
export function DiffChip({
  valor,
  etiquetaCero = 'Cuadra',
  className,
}: {
  valor: number
  /** Cómo se dice «sin diferencia» en ese lugar (p. ej. «Es igual»). */
  etiquetaCero?: string
  className?: string
}) {
  if (valor === 0) {
    return (
      <Badge tone="soft" className={cn('whitespace-nowrap', className)}>
        <Equal className="h-3 w-3" aria-hidden />
        {etiquetaCero}
      </Badge>
    )
  }
  if (valor > 0) {
    return (
      <Badge tone="outline" className={cn('whitespace-nowrap text-ink-800', className)}>
        <ArrowUp className="h-3 w-3" aria-hidden />
        Sobra <span className="tnum">{plata(valor)}</span>
      </Badge>
    )
  }
  return (
    <Badge tone="solid" className={cn('whitespace-nowrap', className)}>
      <ArrowDown className="h-3 w-3" aria-hidden />
      Falta <span className="tnum">{plata(Math.abs(valor))}</span>
    </Badge>
  )
}
