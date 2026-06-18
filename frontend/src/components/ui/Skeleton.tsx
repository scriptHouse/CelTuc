import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/** Bloque de carga con barrido (shimmer). Reserva espacio y evita saltos (CLS). */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('ct-skeleton rounded-lg', className)} {...props} />
}
