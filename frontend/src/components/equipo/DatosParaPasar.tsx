import { useState } from 'react'
import { Check, Copy, MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'

/**
 * «Pasale estos datos a Lucas»: lo que la persona necesita para entrar, listo
 * para copiar o mandar por WhatsApp. Aparece justo después de crear un acceso
 * o de ponerle una contraseña nueva: es la única vez que la contraseña se ve.
 */
export function DatosParaPasar({
  nombre,
  username,
  email,
  contrasena,
  className,
}: {
  nombre: string
  username: string
  email?: string
  /** La que se acaba de poner (si no cambió, no se muestra). */
  contrasena?: string
  className?: string
}) {
  const [copiado, setCopiado] = useState(false)
  const direccion = `${window.location.origin}/login`
  const saludo = nombre.trim().split(/\s+/)[0] || ''

  const texto = [
    `Hola${saludo ? ` ${saludo}` : ''}! Estos son tus datos para entrar al sistema de CelTuc:`,
    `• Página: ${direccion}`,
    `• Usuario: ${username}${email ? ` (o tu email: ${email})` : ''}`,
    contrasena ? `• Contraseña: ${contrasena}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2200)
    } catch {
      /* sin portapapeles (http o permisos): el texto igual está a la vista para copiarlo a mano */
    }
  }

  const filas: [string, string][] = [
    ['Página', direccion],
    ['Usuario', username],
    ...(email ? ([['o su email', email]] as [string, string][]) : []),
    ...(contrasena ? ([['Contraseña', contrasena]] as [string, string][]) : []),
  ]

  return (
    <div className={cn('overflow-hidden rounded-2xl border border-line bg-surface', className)}>
      <dl className="divide-y divide-line">
        {filas.map(([etiqueta, valor]) => (
          <div key={etiqueta} className="flex items-center justify-between gap-3 px-4 py-3">
            <dt className="shrink-0 text-xs font-medium text-ink-500">{etiqueta}</dt>
            <dd
              className={cn(
                'min-w-0 select-all truncate text-right text-sm font-semibold text-ink-950',
                etiqueta === 'Contraseña' && 'font-mono tracking-wide',
              )}
            >
              {valor}
            </dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-2 border-t border-line bg-canvas/40 p-3 sm:flex-row">
        <Button type="button" variant="outline" className="flex-1" onClick={copiar}>
          {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copiado ? '¡Copiado!' : 'Copiar los datos'}
        </Button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(texto)}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-ink-950 px-5 text-sm font-medium text-on-ink transition-colors hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2"
        >
          <MessageCircle className="h-4 w-4" />
          Mandar por WhatsApp
        </a>
      </div>
    </div>
  )
}
