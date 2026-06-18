import { forwardRef } from 'react'
import type { TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'min-h-[84px] w-full resize-y rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-sm text-ink-900',
        'placeholder:text-ink-400',
        'transition-[border-color,box-shadow] duration-150',
        'focus:border-ink-900 focus:outline-none focus:ring-2 focus:ring-ink-900/12',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
)
Textarea.displayName = 'Textarea'
