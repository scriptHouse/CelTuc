import { forwardRef } from 'react'
import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-11 w-full rounded-xl border border-line-strong bg-surface px-3.5 text-sm text-ink-900',
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
Input.displayName = 'Input'
