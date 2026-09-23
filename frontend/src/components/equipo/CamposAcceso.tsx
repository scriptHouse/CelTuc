import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { AtSign, Dices, Eye, EyeOff, KeyRound, Mail, Wand2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Etiqueta, EstadoDato, MensajeCampo } from '@/components/equipo/piezas'
import {
  MIN_CONTRASENA,
  corregirUsuario,
  inventarContrasena,
  problemaContrasena,
  problemaUsuario,
} from '@/components/equipo/reglas'
import type { EstadoChequeo } from '@/components/equipo/reglas'

/**
 * Los tres datos del acceso (usuario, email y contraseña), cada uno con su
 * explicación y avisando MIENTRAS se escribe si sirve o no — y con quién choca,
 * si otra cuenta ya lo tiene. El chequeo (`useChequeoDato`) lo hace quien usa el
 * campo, así puede frenar el «Siguiente» mientras un dato no sirve.
 */

const CLASE_INPUT = 'h-12 pl-10 text-base sm:text-sm'

function Chip({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 items-center gap-1 rounded-full border border-line-strong bg-surface px-3 text-xs font-medium text-ink-700 transition-colors hover:border-ink-400 hover:bg-ink-50 hover:text-ink-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
    >
      {children}
    </button>
  )
}

export function CampoUsuario({
  valor,
  onValor,
  chequeo,
  propuestas = [],
  error,
  autoFocus,
}: {
  valor: string
  onValor: (v: string) => void
  chequeo: EstadoChequeo
  /** Usuarios libres armados con el nombre de la persona. */
  propuestas?: string[]
  error?: string | null
  autoFocus?: boolean
}) {
  const id = useId()
  const corregido = corregirUsuario(valor)
  const puedeCorregir =
    chequeo.estado === 'mal' && Boolean(corregido) && corregido !== valor.trim().toLowerCase() && !problemaUsuario(corregido)
  const sugerencias = chequeo.estado === 'mal' ? (chequeo.sugerencias ?? []) : []
  const otras = propuestas.filter((p) => p !== valor.trim().toLowerCase()).slice(0, 3)

  return (
    <Etiqueta
      htmlFor={id}
      titulo="Usuario"
      ayuda="El nombre corto con el que va a entrar. Todo junto, sin espacios ni tildes."
    >
      <div className="relative">
        <AtSign className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <Input
          id={id}
          value={valor}
          onChange={(e) => onValor(e.target.value.toLowerCase())}
          placeholder="lgomez"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
          aria-invalid={chequeo.estado === 'mal' || Boolean(error)}
          className={CLASE_INPUT}
        />
      </div>
      <EstadoDato chequeo={chequeo} error={error} />
      {(puedeCorregir || sugerencias.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {puedeCorregir && (
            <Chip onClick={() => onValor(corregido)}>
              <Wand2 className="h-3.5 w-3.5" /> Corregirlo: «{corregido}»
            </Chip>
          )}
          {sugerencias.slice(0, 3).map((s) => (
            <Chip key={s} onClick={() => onValor(s)}>
              Usar «{s}»
            </Chip>
          ))}
        </div>
      )}
      {chequeo.estado !== 'mal' && otras.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-ink-400">Otras ideas:</span>
          {otras.map((s) => (
            <Chip key={s} onClick={() => onValor(s)}>
              {s}
            </Chip>
          ))}
        </div>
      )}
    </Etiqueta>
  )
}

export function CampoEmail({
  valor,
  onValor,
  chequeo,
  error,
}: {
  valor: string
  onValor: (v: string) => void
  chequeo: EstadoChequeo
  error?: string | null
}) {
  const id = useId()
  return (
    <Etiqueta
      htmlFor={id}
      titulo="Email"
      ayuda="También sirve para entrar (en vez del usuario). Cada cuenta necesita un email propio: no se puede repetir."
    >
      <div className="relative">
        <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <Input
          id={id}
          type="email"
          inputMode="email"
          value={valor}
          onChange={(e) => onValor(e.target.value)}
          placeholder="lucas@gmail.com"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={chequeo.estado === 'mal' || Boolean(error)}
          className={CLASE_INPUT}
        />
      </div>
      <EstadoDato chequeo={chequeo} error={error} />
    </Etiqueta>
  )
}

/**
 * La contraseña. Al crear se ve en claro (hay que pasársela a la persona) y
 * hay un botón que inventa una fácil de dictar. Al editar, vacía = no cambia.
 */
export function CampoContrasena({
  valor,
  onValor,
  opcional,
  error,
  titulo = 'Contraseña',
  ayuda,
}: {
  valor: string
  onValor: (v: string) => void
  /** true al editar: vacía = se queda la que tiene. */
  opcional?: boolean
  error?: string | null
  titulo?: string
  ayuda?: string
}) {
  const id = useId()
  const [visible, setVisible] = useState(!opcional)
  const problema = valor ? problemaContrasena(valor) : null
  const cumple = valor.length >= MIN_CONTRASENA

  return (
    <Etiqueta
      htmlFor={id}
      titulo={titulo}
      ayuda={
        ayuda ??
        (opcional
          ? 'Si la dejás vacía, se queda con la que ya tiene.'
          : 'La clave secreta para entrar. Después se la pasás a la persona (y la puede cambiar pidiéndotelo).')
      }
    >
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <Input
            id={id}
            type={visible ? 'text' : 'password'}
            value={valor}
            onChange={(e) => onValor(e.target.value)}
            autoComplete="new-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder={opcional ? 'Vacía = no se cambia' : '••••••'}
            aria-invalid={Boolean(problema || error)}
            className={cn(CLASE_INPUT, 'pr-11 font-mono tracking-wide placeholder:font-sans placeholder:tracking-normal')}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            title={visible ? 'Ocultar' : 'Mostrar'}
            className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-ink-400 transition-colors hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-12 shrink-0 px-3.5"
          onClick={() => {
            onValor(inventarContrasena())
            setVisible(true)
          }}
          title="Inventa una contraseña fácil de dictar, como «sol-mate-47»"
        >
          <Dices className="h-4 w-4" />
          <span className="hidden sm:inline">Inventar una</span>
          <span className="sm:hidden">Inventar</span>
        </Button>
      </div>
      {error && !cumple ? (
        <MensajeCampo tono="mal">{error}</MensajeCampo>
      ) : problema ? (
        <MensajeCampo tono="mal">{problema}</MensajeCampo>
      ) : valor ? (
        <MensajeCampo tono="ok">Sirve: tiene {valor.length} caracteres (mínimo {MIN_CONTRASENA}).</MensajeCampo>
      ) : !opcional ? (
        <MensajeCampo tono="neutro">Tiene que tener al menos {MIN_CONTRASENA} letras o números.</MensajeCampo>
      ) : null}
    </Etiqueta>
  )
}
