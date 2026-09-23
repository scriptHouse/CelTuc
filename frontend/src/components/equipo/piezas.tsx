import type { ReactNode } from 'react'
import { Check, CircleAlert, Lightbulb, Loader2, Lock } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { EstadoChequeo } from '@/components/equipo/reglas'

/**
 * Piezas de las pantallas del equipo (Empleados, Usuarios, Roles). Pensadas
 * como las del cierre de caja: áreas de toque grandes, una idea por pieza y el
 * estado dicho con palabras (nunca solo con un color).
 */

/** Iniciales para el avatar: «Lucas Gómez» -> «LG», «lgomez» -> «L». */
function iniciales(texto: string): string {
  const partes = texto.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  if (partes.length === 1) return partes[0].charAt(0).toUpperCase()
  return `${partes[0].charAt(0)}${partes[partes.length - 1].charAt(0)}`.toUpperCase()
}

/** Avatar con iniciales y, si está usando el sistema ahora, el puntito que late. */
export function Avatar({
  texto,
  enLinea,
  tamano = 'md',
  className,
}: {
  texto: string
  enLinea?: boolean
  tamano?: 'md' | 'lg'
  className?: string
}) {
  return (
    <span
      className={cn(
        'relative grid shrink-0 place-items-center rounded-2xl bg-ink-100 font-bold text-ink-900',
        tamano === 'lg' ? 'h-14 w-14 text-lg' : 'h-11 w-11 text-sm',
        className,
      )}
    >
      {iniciales(texto)}
      {enLinea && (
        <span aria-hidden title="Usando el sistema ahora" className="absolute -bottom-0.5 -right-0.5 grid place-items-center">
          <span className="absolute h-3 w-3 animate-ping rounded-full bg-ink-900/40" />
          <span className="relative h-3 w-3 rounded-full border-2 border-surface bg-ink-900" />
        </span>
      )}
    </span>
  )
}

/** Una opción grande para elegir (se marca oscura, con un tilde, al elegirla). */
export function OpcionGrande({
  activo,
  onClick,
  icono: Icono,
  titulo,
  descripcion,
  extra,
  deshabilitado,
  className,
}: {
  activo: boolean
  onClick: () => void
  icono?: LucideIcon
  titulo: ReactNode
  descripcion?: ReactNode
  /** Algo más debajo de la descripción (p. ej. las pantallas que abre un rol). */
  extra?: ReactNode
  deshabilitado?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={activo}
      disabled={deshabilitado}
      onClick={onClick}
      className={cn(
        'group flex w-full items-start gap-3 rounded-2xl border px-4 py-3.5 text-left transition-all duration-150',
        'active:scale-[0.99] motion-reduce:active:scale-100',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
        'disabled:cursor-not-allowed disabled:opacity-50',
        activo
          ? 'border-ink-950 bg-ink-950 text-on-ink shadow-[0_10px_24px_rgba(10,10,11,0.18)]'
          : 'border-line-strong bg-surface text-ink-800 hover:border-ink-300 hover:bg-ink-50',
        className,
      )}
    >
      {Icono && (
        <span
          aria-hidden
          className={cn(
            'mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-colors',
            activo ? 'bg-on-ink/15 text-on-ink' : 'bg-ink-100 text-ink-600 group-hover:bg-ink-200/70',
          )}
        >
          <Icono className="h-[1.1rem] w-[1.1rem]" strokeWidth={1.85} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{titulo}</span>
        {descripcion && (
          <span className={cn('mt-0.5 block text-xs leading-relaxed', activo ? 'text-on-ink/75' : 'text-ink-500')}>
            {descripcion}
          </span>
        )}
        {extra && <span className="mt-2 block">{extra}</span>}
      </span>
      <span
        aria-hidden
        className={cn(
          'mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-colors',
          activo ? 'border-on-ink bg-on-ink text-ink-950' : 'border-line-strong bg-surface',
        )}
      >
        {activo && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
    </button>
  )
}

/** Un «para que sepas»: explica qué pasa o qué conviene, con un ejemplo. */
export function Explicacion({
  children,
  icono: Icono = Lightbulb,
  titulo,
  className,
}: {
  children: ReactNode
  icono?: LucideIcon
  titulo?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex gap-3 rounded-2xl bg-ink-50 px-4 py-3 ring-1 ring-line', className)}>
      <Icono className="mt-0.5 h-4 w-4 shrink-0 text-ink-500" strokeWidth={1.85} aria-hidden />
      <div className="min-w-0 text-pretty text-xs leading-relaxed text-ink-600">
        {titulo && <p className="mb-0.5 text-[0.8rem] font-semibold text-ink-900">{titulo}</p>}
        {children}
      </div>
    </div>
  )
}

/** Algo que no se puede hacer, con el porqué (en vez de un botón que no anda). */
export function Bloqueado({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('flex items-start gap-2 rounded-xl bg-ink-50 px-3 py-2.5 text-xs leading-relaxed text-ink-500 ring-1 ring-line', className)}>
      <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  )
}

/** Etiqueta de un campo con su ayuda debajo («Es el nombre corto con el que…»). */
export function Etiqueta({
  htmlFor,
  titulo,
  ayuda,
  children,
  error,
}: {
  htmlFor?: string
  titulo: ReactNode
  ayuda?: ReactNode
  children: ReactNode
  /** Error del backend que no vino del chequeo en vivo. */
  error?: string | null
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-ink-900">
        {titulo}
      </label>
      {ayuda && <p className="mb-2 mt-0.5 text-xs leading-relaxed text-ink-500">{ayuda}</p>}
      {!ayuda && <div className="h-1.5" />}
      {children}
      {error && <MensajeCampo tono="mal">{error}</MensajeCampo>}
    </div>
  )
}

/** Mensaje debajo de un campo: bien (tilde), mal (alerta) o revisando. */
export function MensajeCampo({
  tono,
  children,
}: {
  tono: 'ok' | 'mal' | 'revisando' | 'neutro'
  children: ReactNode
}) {
  const Icono = tono === 'ok' ? Check : tono === 'mal' ? CircleAlert : tono === 'revisando' ? Loader2 : null
  return (
    <p
      role={tono === 'mal' ? 'alert' : undefined}
      className={cn(
        'mt-2 flex items-start gap-1.5 text-xs leading-relaxed',
        tono === 'mal' ? 'font-medium text-ink-900' : tono === 'ok' ? 'text-ink-600' : 'text-ink-400',
      )}
    >
      {Icono && (
        <Icono
          className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', tono === 'revisando' && 'animate-spin', tono === 'ok' && 'text-ink-900')}
          strokeWidth={tono === 'ok' ? 3 : 2}
          aria-hidden
        />
      )}
      <span className="min-w-0">{children}</span>
    </p>
  )
}

/** El estado del chequeo en vivo de un usuario / email, dicho en palabras. */
export function EstadoDato({ chequeo, error }: { chequeo: EstadoChequeo; error?: string | null }) {
  // Un error que devolvió el backend al guardar manda (hasta que se corrige el campo).
  if (error && chequeo.estado !== 'ok') return <MensajeCampo tono="mal">{error}</MensajeCampo>
  if (chequeo.estado === 'revisando') return <MensajeCampo tono="revisando">Revisando que nadie más lo tenga…</MensajeCampo>
  if (chequeo.estado === 'ok') return <MensajeCampo tono="ok">{chequeo.mensaje}</MensajeCampo>
  if (chequeo.estado === 'mal') return <MensajeCampo tono="mal">{chequeo.mensaje}</MensajeCampo>
  return null
}

/** Una sección de la ficha: ícono, título, qué es, y su contenido. */
export function Seccion({
  icono: Icono,
  titulo,
  subtitulo,
  accion,
  children,
  className,
}: {
  icono: LucideIcon
  titulo: ReactNode
  subtitulo?: ReactNode
  accion?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('rounded-2xl border border-line bg-surface p-4 sm:p-5', className)}>
      <div className="mb-3.5 flex items-start gap-3">
        <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink-950 text-on-ink">
          <Icono className="h-[1.1rem] w-[1.1rem]" strokeWidth={1.85} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[0.95rem] font-semibold leading-tight text-ink-950">{titulo}</h3>
          {subtitulo && <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{subtitulo}</p>}
        </div>
        {accion && <div className="shrink-0">{accion}</div>}
      </div>
      {children}
    </section>
  )
}

/** Fila «dato: valor» de la ficha, con una acción opcional a la derecha. */
export function Fila({
  etiqueta,
  valor,
  accion,
}: {
  etiqueta: ReactNode
  valor: ReactNode
  accion?: ReactNode
}) {
  return (
    <div className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0 first:pt-0">
      <div className="min-w-0 flex-1">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-ink-400">{etiqueta}</p>
        <div className="mt-0.5 truncate text-sm text-ink-900">{valor}</div>
      </div>
      {accion && <div className="shrink-0">{accion}</div>}
    </div>
  )
}
