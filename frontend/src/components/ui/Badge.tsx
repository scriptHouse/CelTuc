import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type Tone = 'solid' | 'soft' | 'outline'

const tones: Record<Tone, string> = {
  solid: 'bg-ink-900 text-on-ink',
  soft: 'bg-ink-100 text-ink-700',
  outline: 'border border-line-strong text-ink-600',
}

export function Badge({
  className,
  tone = 'soft',
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        tones[tone],
        className,
      )}
      {...props}
    />
  )
}
