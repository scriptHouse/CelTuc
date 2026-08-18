import { cn } from '@/lib/utils'

/**
 * Interruptor de encendido/apagado.
 *
 * Se diferencia del checkbox a propósito: el checkbox marca una opción de un
 * formulario que después se guarda; esto prende o apaga algo que ya está
 * funcionando, y el cambio se aplica solo. Cuando lo que se decide es «esto
 * corre o no corre», el interruptor lo dice mejor.
 */
export function Switch({
  checked,
  onChange,
  disabled = false,
  'aria-label': ariaLabel,
}: {
  checked: boolean
  onChange: (valor: boolean) => void
  disabled?: boolean
  'aria-label'?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'border-ink-950 bg-ink-950' : 'border-line-strong bg-ink-100 dark:bg-ink-800',
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 rounded-full bg-surface shadow-sm transition-transform',
          checked ? 'translate-x-[1.4rem]' : 'translate-x-1',
        )}
      />
    </button>
  )
}
