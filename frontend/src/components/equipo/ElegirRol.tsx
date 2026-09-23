import { Link } from 'react-router-dom'
import { ArrowRight, CircleOff, ShieldCheck, SlidersHorizontal } from 'lucide-react'
import type { Rol } from '@/types'
import { cn } from '@/lib/utils'
import { Bloqueado, Explicacion, MensajeCampo, OpcionGrande } from '@/components/equipo/piezas'
import { SIEMPRE_VISIBLES, modulosDeCodigos, queVeEnPalabras } from '@/components/equipo/modulos'

/**
 * «¿Qué puede ver?»: el rol de una cuenta, elegido entre tarjetas grandes que
 * muestran qué pantallas abre cada uno (con los mismos íconos del menú). Así
 * elegir un rol es elegir pantallas, sin tener que saber qué es un permiso.
 */

const MAX_CHIPS = 6

/** Las pantallas que abre un rol, como fichitas con el ícono del menú. */
export function PantallasDelRol({
  rol,
  sobreOscuro,
  className,
}: {
  rol: Pick<Rol, 'es_admin' | 'permisos'>
  sobreOscuro?: boolean
  className?: string
}) {
  const chip = cn(
    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.7rem] font-medium',
    sobreOscuro ? 'bg-on-ink/15 text-on-ink' : 'bg-ink-100 text-ink-700',
  )
  if (rol.es_admin) {
    return (
      <span className={cn('flex flex-wrap gap-1', className)}>
        <span className={chip}>
          <ShieldCheck className="h-3 w-3" /> Todas las pantallas
        </span>
      </span>
    )
  }
  const modulos = modulosDeCodigos(rol.permisos).filter((m) => m.enMenu)
  if (modulos.length === 0) {
    return (
      <span className={cn('flex flex-wrap gap-1', className)}>
        <span className={chip}>
          <SIEMPRE_VISIBLES.icono className="h-3 w-3" /> Solo {SIEMPRE_VISIBLES.titulo}
        </span>
      </span>
    )
  }
  const visibles = modulos.slice(0, MAX_CHIPS)
  return (
    <span className={cn('flex flex-wrap gap-1', className)}>
      {visibles.map((m) => (
        <span key={m.codigo} className={chip}>
          <m.icono className="h-3 w-3" strokeWidth={2} /> {m.titulo}
        </span>
      ))}
      {modulos.length > MAX_CHIPS && <span className={chip}>+{modulos.length - MAX_CHIPS} más</span>}
    </span>
  )
}

export function ElegirRol({
  roles,
  valor,
  onValor,
  nombrePersona,
  bloqueo,
  error,
  mostrarLinkRoles = true,
}: {
  roles: Rol[]
  /** Id del rol como texto; '' = sin rol. */
  valor: string
  onValor: (v: string) => void
  /** «Lucas», para que las frases hablen de alguien concreto. */
  nombrePersona?: string
  /** Si no se puede cambiar, por qué (se muestra en vez de las opciones). */
  bloqueo?: string | null
  error?: string | null
  mostrarLinkRoles?: boolean
}) {
  const comunes = roles.filter((r) => !r.es_admin)
  const admins = roles.filter((r) => r.es_admin)
  const elegido = roles.find((r) => String(r.id) === valor) ?? null
  const quien = nombrePersona?.trim() || 'Esta persona'

  if (bloqueo) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-line bg-canvas/40 px-4 py-3">
          <p className="text-sm font-semibold text-ink-900">{elegido?.nombre ?? 'Sin rol'}</p>
          <p className="mt-0.5 text-xs text-ink-500">Ve {queVeEnPalabras(elegido)}.</p>
          {elegido && <PantallasDelRol rol={elegido} className="mt-2" />}
        </div>
        <Bloqueado>{bloqueo}</Bloqueado>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Rol" className="grid gap-2.5 sm:grid-cols-2">
        {comunes.map((rol) => {
          const activo = String(rol.id) === valor
          return (
            <OpcionGrande
              key={rol.id}
              activo={activo}
              onClick={() => onValor(String(rol.id))}
              icono={SlidersHorizontal}
              titulo={rol.nombre}
              descripcion={rol.descripcion || `Abre ${rol.permisos.length} pantalla${rol.permisos.length === 1 ? '' : 's'} del menú.`}
              extra={<PantallasDelRol rol={rol} sobreOscuro={activo} />}
            />
          )
        })}
        {admins.map((rol) => {
          const activo = String(rol.id) === valor
          return (
            <OpcionGrande
              key={rol.id}
              activo={activo}
              onClick={() => onValor(String(rol.id))}
              icono={ShieldCheck}
              titulo={rol.nombre}
              descripcion="Ve todo y además maneja el sistema: cargar y sacar gente, dar accesos y cambiar roles. Solo para alguien de mucha confianza."
              extra={<PantallasDelRol rol={rol} sobreOscuro={activo} />}
            />
          )
        })}
        <OpcionGrande
          activo={valor === ''}
          onClick={() => onValor('')}
          icono={CircleOff}
          titulo="Todavía ninguno"
          descripcion={`Puede entrar, pero no ve ninguna pantalla del menú (solo ${SIEMPRE_VISIBLES.titulo}). Sirve si todavía no decidiste.`}
        />
      </div>

      {error && <MensajeCampo tono="mal">{error}</MensajeCampo>}

      <Explicacion titulo={elegido ? `Con «${elegido.nombre}»:` : 'Sin rol:'}>
        {quien} va a ver {queVeEnPalabras(elegido)}.
        {elegido?.es_admin && ' Pensalo bien: un administrador puede cambiar y borrar cosas de todos.'}
        {' '}Una cuenta tiene un solo rol: si después se lo cambiás, deja de ver lo del rol anterior.
      </Explicacion>

      {mostrarLinkRoles && (
        <Link
          to="/usuarios/roles"
          className="group inline-flex items-center gap-1.5 text-xs font-medium text-ink-500 underline-offset-4 transition-colors hover:text-ink-950 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
        >
          ¿Ninguno te sirve? Armá uno a medida en «Roles y permisos»
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  )
}
