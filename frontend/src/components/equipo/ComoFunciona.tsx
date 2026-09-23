import { useState } from 'react'
import { ArrowRight, KeyRound, LayoutGrid, UserRound, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AyudaCampos, AyudaEjemplo, AyudaInfo, AyudaPasos, AyudaSeccion, AyudaTip } from '@/components/ui/AyudaInfo'

/**
 * El «mapa» de Empleados, Usuarios y Roles en tres pasos: la persona, su acceso
 * y qué puede ver. Es lo que más confundía: que cargar a alguien en Empleados
 * NO le da entrada al sistema, y que lo que ve lo decide el rol.
 *
 * `ComoFunciona` es la franja de arriba de cada pantalla (se puede ocultar y se
 * recuerda en este navegador); `GuiaEquipo` es el botón (i) con la guía entera
 * y los errores más comunes explicados.
 */

const CLAVE = 'celtuc-equipo-como-funciona'

function leerOculta(): boolean {
  try {
    return localStorage.getItem(CLAVE) === 'oculta'
  } catch {
    return false
  }
}

const PASOS: { icono: LucideIcon; titulo: string; texto: string; donde: string }[] = [
  {
    icono: UserRound,
    titulo: 'La persona',
    texto: 'Su nombre y en qué sucursal trabaja. Cargarla NO le da entrada al sistema.',
    donde: 'Se carga en Empleados',
  },
  {
    icono: KeyRound,
    titulo: 'Su acceso',
    texto: 'Un usuario y una contraseña para entrar. Cada acceso necesita un email propio.',
    donde: 'Se da desde su ficha',
  },
  {
    icono: LayoutGrid,
    titulo: 'Qué puede ver',
    texto: 'Lo decide el rol: una lista de pantallas del menú. «Administrador» ve y maneja todo.',
    donde: 'Se arma en Roles y permisos',
  },
]

export function ComoFunciona({ resaltar }: { resaltar: 1 | 2 | 3 }) {
  const [oculta, setOculta] = useState(leerOculta)
  if (oculta) return null

  function ocultar() {
    setOculta(true)
    try {
      localStorage.setItem(CLAVE, 'oculta')
    } catch {
      /* sin localStorage se oculta solo por ahora */
    }
  }

  return (
    <section aria-label="Cómo funciona" className="ct-rise mb-5 rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="mb-3.5 flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-ink-400">Cómo funciona</p>
          <p className="mt-0.5 text-sm font-semibold text-ink-950">Para que alguien use el sistema hacen falta 3 cosas</p>
        </div>
        <button
          type="button"
          onClick={ocultar}
          className="-mr-1 -mt-1 inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-medium text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
          title="Ocultar (se vuelve a ver con el botón de ayuda de arriba)"
        >
          <X className="h-3.5 w-3.5" />
          Entendido
        </button>
      </div>
      <ol className="grid gap-2.5 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-stretch">
        {PASOS.map((paso, i) => {
          const actual = resaltar === i + 1
          const Icono = paso.icono
          return (
            <li key={paso.titulo} className="contents">
              {i > 0 && (
                <span aria-hidden className="hidden items-center justify-center text-ink-300 sm:flex">
                  <ArrowRight className="h-4 w-4" />
                </span>
              )}
              <div
                className={cn(
                  'flex gap-3 rounded-xl px-3.5 py-3 ring-1 transition-colors',
                  actual ? 'bg-ink-950 text-on-ink ring-ink-950' : 'bg-canvas/50 text-ink-900 ring-line',
                )}
              >
                <span
                  className={cn(
                    'grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-bold',
                    actual ? 'bg-on-ink/15 text-on-ink' : 'bg-surface text-ink-700 ring-1 ring-line',
                  )}
                >
                  <Icono className="h-4 w-4" strokeWidth={1.9} aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    <span className={cn('mr-1 tabular-nums', actual ? 'text-on-ink/60' : 'text-ink-400')}>{i + 1}.</span>
                    {paso.titulo}
                  </p>
                  <p className={cn('mt-0.5 text-xs leading-relaxed', actual ? 'text-on-ink/80' : 'text-ink-500')}>
                    {paso.texto}
                  </p>
                  <p className={cn('mt-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.08em]', actual ? 'text-on-ink/60' : 'text-ink-400')}>
                    {actual ? 'Estás acá' : paso.donde}
                  </p>
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/** El botón (i) con la guía completa: las 3 cosas, cómo sumar a alguien y los errores comunes. */
export function GuiaEquipo() {
  return (
    <AyudaInfo titulo="Cómo funciona el equipo">
      <AyudaSeccion titulo="Las tres cosas">
        <AyudaCampos
          campos={[
            ['1. La persona (empleado)', 'Alguien del equipo: nombre y sucursal. Cargarla en Empleados NO le da entrada al sistema.'],
            ['2. El acceso (cuenta)', 'La llave para entrar: un usuario (o su email) y una contraseña. Sin acceso, la persona no puede entrar.'],
            ['3. El rol', 'Qué pantallas del menú ve esa cuenta. «Administrador» ve todo y además maneja el sistema.'],
          ]}
        />
      </AyudaSeccion>

      <AyudaSeccion titulo="¿Empleados o Usuarios? ¿Cuál uso?">
        <p>
          <b>Empleados</b> muestra a las <b>personas</b> del equipo. <b>Usuarios</b> muestra las <b>cuentas</b> para
          entrar (también las que no son de nadie del equipo, como la de un contador). Las dos pantallas abren la
          misma ficha, así que podés hacer todo desde cualquiera de las dos.
        </p>
      </AyudaSeccion>

      <AyudaSeccion titulo="Sumar a alguien nuevo, paso a paso">
        <AyudaPasos
          pasos={[
            <>En <b>Empleados</b>, tocá <b>Nuevo empleado</b> y escribí su nombre y sucursal.</>,
            <>Contestá si va a usar el sistema. Si decís que sí, el sistema te propone un <b>usuario</b> armado con su nombre.</>,
            <>Poné su <b>email</b> y una <b>contraseña</b> (o tocá <b>Inventar una</b>).</>,
            <>Elegí <b>qué puede ver</b>: cada rol muestra sus pantallas.</>,
            <>Revisá el resumen y guardá. Al final aparecen sus datos para <b>copiarlos o mandarlos por WhatsApp</b>.</>,
          ]}
        />
      </AyudaSeccion>

      <AyudaSeccion titulo="Los avisos más comunes y qué hacer">
        <AyudaCampos
          campos={[
            [
              '«Ese email ya lo usa…»',
              'Cada cuenta necesita un email propio. El aviso dice de quién es. Si es la misma persona cargada dos veces, abrí esa ficha en vez de crear otra; si es otra persona, usá otro email.',
            ],
            ['«El usuario ya lo tiene…»', 'Tocá una de las opciones que te propone el sistema (por ejemplo «lgomez2»).'],
            ['«Va todo junto, sin espacios…»', 'El usuario no lleva espacios, tildes ni ñ. Tocá «Corregirlo» y se arregla solo.'],
            ['«La contraseña es muy corta»', 'Tiene que tener al menos 6 letras o números. Tocá «Inventar una».'],
            [
              '«No podés… tu propio…»',
              'Es una protección para que no te dejes afuera sin querer (pausarte, cambiarte el rol, borrarte). Pedíselo a otro administrador.',
            ],
            [
              '«Solo el superadministrador…»',
              'Las cuentas de administradores solo las cambia la cuenta principal del sistema.',
            ],
          ]}
        />
      </AyudaSeccion>

      <AyudaSeccion titulo="Pausar, quitar el acceso o sacar del equipo">
        <AyudaCampos
          campos={[
            ['Pausar el acceso', 'No puede entrar hasta que lo reactives. No se borra nada. Ideal para vacaciones o licencias.'],
            ['Quitar el acceso', 'Se borran su usuario y contraseña, pero la persona sigue en el equipo. Le podés volver a dar acceso cuando quieras, incluso con el mismo email.'],
            ['Sacar del equipo', 'Se borra la persona y también su acceso.'],
          ]}
        />
      </AyudaSeccion>

      <AyudaEjemplo titulo="Tres vendedores que ven lo mismo">
        <p>
          Armá un rol «Vendedor» con Panel, Inventario y Caja, y dáselo a los tres. Si mañana querés que también vean
          el Simulador, lo prendés una sola vez en el rol y les cambia a los tres juntos.
        </p>
      </AyudaEjemplo>

      <AyudaTip>
        Si alguien «no ve» una pantalla, fijate su rol en la ficha: ahí dice, en una frase, qué pantallas ve.
      </AyudaTip>
    </AyudaInfo>
  )
}
