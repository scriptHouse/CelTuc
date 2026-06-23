import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/store/theme'
import { cn } from '@/lib/utils'

/**
 * Interruptor de tema (claro / oscuro). Los dos íconos se superponen y hacen
 * cross-fade + giro al alternar (respeta `prefers-reduced-motion`). El estilo
 * base es "ghost" para integrarse con las acciones del Layout; se puede ajustar
 * tamaño/ancho con `className` (p. ej. `h-10 w-full` en el sidebar colapsado).
 */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useTheme((s) => s.theme)
  const toggle = useTheme((s) => s.toggle)
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? 'Activar modo claro' : 'Activar modo oscuro'}
      title={isDark ? 'Modo claro' : 'Modo oscuro'}
      className={cn(
        'relative grid h-9 w-9 shrink-0 place-items-center rounded-xl text-ink-400 transition-colors',
        'hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900',
        className,
      )}
    >
      <Sun
        aria-hidden
        strokeWidth={2}
        className={cn(
          'absolute h-[1.05rem] w-[1.05rem] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
          isDark ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-0 opacity-0',
        )}
      />
      <Moon
        aria-hidden
        strokeWidth={2}
        className={cn(
          'absolute h-[1.05rem] w-[1.05rem] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
          isDark ? 'rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100',
        )}
      />
    </button>
  )
}
