import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, FlaskConical, Plus, Trash2 } from 'lucide-react'
import type { CajaConfig, ModoConteoCaja, ModoFondoCaja } from '@/types'
import { DENOMINACIONES_ARS, MAX_LARGO_TAREA, MAX_TAREAS_CIERRE } from '@/types'
import { money0 } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ToastProvider'
import { infoPaso, leerMonto } from '@/components/caja/cierre/pasos'
import type { PasoCierre } from '@/components/caja/cierre/pasos'
import { CampoPlata } from '@/components/caja/cierre/piezas'
import { Bloque, Ejemplo, Elegir, Interruptor, Opcion, Pildora } from '@/components/caja/config/piezas'

/**
 * Configuración del cierre de caja, ordenada IGUAL que el cierre: arriba se ve
 * qué pasos va a ver quien cierra (y cuáles no aparecen), y abajo cada paso
 * con sus opciones. Cada opción explica qué hace y qué cambia al tocarla.
 */

type ModoTolerancia = 'grande' | 'siempre' | 'nunca'

const MODOS_CONTEO: Array<{ valor: ModoConteoCaja; titulo: string; descripcion: string; recomendada?: boolean }> = [
  {
    valor: 'billetes',
    titulo: 'Billete por billete',
    descripcion:
      'Aparece cada billete: quien cierra lo toca una vez por cada uno que tiene y el sistema suma solo. Es lo más fácil y evita errores de cuentas.',
    recomendada: true,
  },
  {
    valor: 'total',
    titulo: 'Escribiendo el total',
    descripcion: 'Quien cierra cuenta a mano y escribe cuánto dio. Es más rápido, pero hay que sumar bien.',
  },
  {
    valor: 'elegir',
    titulo: 'Que elija quien cierra',
    descripcion: 'Aparecen las dos formas y quien cierra elige en el momento (se puede cambiar a la mitad).',
  },
]

const MODOS_TOLERANCIA: Array<{ valor: ModoTolerancia; titulo: string; descripcion: string; recomendada?: boolean }> = [
  {
    valor: 'grande',
    titulo: 'Solo si la diferencia es grande',
    descripcion:
      'Las diferencias chicas se aceptan con un toque. Si falta o sobra más que el monto de abajo, hay que elegir qué pasó y escribirlo.',
    recomendada: true,
  },
  {
    valor: 'siempre',
    titulo: 'Siempre que no cuadre',
    descripcion: 'Aunque falte o sobre $ 1, hay que explicar qué pasó para poder cerrar.',
  },
  {
    valor: 'nunca',
    titulo: 'Nunca',
    descripcion: 'Se puede cerrar con diferencia sin explicar nada. Igual queda anotada en el comprobante.',
  },
]

const MODOS_FONDO: Array<{ valor: ModoFondoCaja; titulo: string; descripcion: string; recomendada?: boolean }> = [
  {
    valor: 'preguntar',
    titulo: 'Preguntar cada vez',
    descripcion: 'Quien cierra elige cuánto deja en el cajón. Se le propone el monto de abajo.',
    recomendada: true,
  },
  {
    valor: 'fijo',
    titulo: 'Siempre el mismo monto',
    descripcion:
      'Queda siempre el monto de abajo, sin preguntar (el paso no aparece). Si hay menos plata, queda toda.',
  },
  {
    valor: 'todo',
    titulo: 'Toda la plata',
    descripcion: 'No se saca nada al cerrar: todo el efectivo queda en el cajón para el día siguiente.',
  },
]

/** Ideas de tareas para sumar con un toque. */
const IDEAS_TAREAS = [
  'Guardar los celulares de la vitrina',
  'Apagar el aire y las luces',
  'Cerrar la persiana',
  'Cargar todas las ventas del día',
]

const idPaso = (paso: PasoCierre) => `config-cierre-${paso}`

export function ConfigCierre({
  config,
  guardar,
}: {
  config: CajaConfig
  guardar: (input: Partial<CajaConfig>) => void
}) {
  const toast = useToast()

  // El último monto «grande» que se usó: si se pasa por «siempre» (monto 0) y
  // se vuelve, reaparece el que estaba.
  const ultimaTolerancia = useRef(config.toleranciaMonto > 0 ? config.toleranciaMonto : 2000)

  const modoTolerancia: ModoTolerancia = !config.toleranciaActiva
    ? 'nunca'
    : config.toleranciaMonto > 0
      ? 'grande'
      : 'siempre'

  function cambiarTolerancia(modo: ModoTolerancia) {
    if (config.toleranciaMonto > 0) ultimaTolerancia.current = config.toleranciaMonto
    if (modo === 'nunca') guardar({ toleranciaActiva: false })
    else if (modo === 'siempre') guardar({ toleranciaActiva: true, toleranciaMonto: 0 })
    else guardar({ toleranciaActiva: true, toleranciaMonto: ultimaTolerancia.current })
  }

  function toggleBillete(den: number) {
    const activas = config.denominaciones.includes(den)
      ? config.denominaciones.filter((d) => d !== den)
      : [...config.denominaciones, den]
    if (activas.length === 0) {
      toast.error('Dejá al menos un billete', 'Si no querés contar billetes, elegí «Escribiendo el total».')
      return
    }
    guardar({ denominaciones: activas })
  }

  // --- La vista previa: qué pasos va a ver quien cierra ---------------------------

  const cantTareas = config.tareasCierre.length
  const vista: Array<{ paso: PasoCierre; aparece: boolean; cuando: string; detalle: string }> = [
    {
      paso: 'tareas',
      aparece: cantTareas > 0 || config.exigirLote,
      cuando: cantTareas > 0 ? 'Siempre' : config.exigirLote ? 'Si hubo tarjetas' : 'No aparece',
      detalle:
        cantTareas > 0
          ? `${cantTareas === 1 ? '1 tarea' : `${cantTareas} tareas`}${config.exigirLote ? ' + el posnet' : ''}`
          : config.exigirLote
            ? 'El cierre del posnet'
            : 'No hay tareas',
    },
    {
      paso: 'efectivo',
      aparece: true,
      cuando: 'Siempre',
      detalle: MODOS_CONTEO.find((m) => m.valor === config.modoConteo)?.titulo ?? '',
    },
    {
      paso: 'otros',
      aparece: config.controlarOtrosMedios,
      cuando: config.controlarOtrosMedios ? 'Si hubo transferencias o tarjetas' : 'No aparece',
      detalle: config.controlarOtrosMedios ? 'Se pregunta si coincide' : 'Se toma lo anotado',
    },
    {
      paso: 'resultado',
      aparece: true,
      cuando: 'Siempre',
      detalle:
        modoTolerancia === 'nunca'
          ? 'Sin explicar diferencias'
          : modoTolerancia === 'siempre'
            ? 'Explicar toda diferencia'
            : `Explicar si pasa de ${money0(config.toleranciaMonto)}`,
    },
    {
      paso: 'fondo',
      aparece: config.modoFondo === 'preguntar',
      cuando: config.modoFondo === 'preguntar' ? 'Siempre' : 'No aparece',
      detalle:
        config.modoFondo === 'preguntar'
          ? `Se propone ${money0(config.fondoSugerido)}`
          : config.modoFondo === 'fijo'
            ? `Quedan ${money0(config.fondoSugerido)} solos`
            : 'Queda toda la plata',
    },
    { paso: 'confirmar', aparece: true, cuando: 'Siempre', detalle: 'Resumen y botón final' },
  ]

  const estadoDe = (paso: PasoCierre) => vista.find((v) => v.paso === paso)!

  function irA(paso: PasoCierre) {
    const destino = document.getElementById(idPaso(paso))
    const reducir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    destino?.scrollIntoView({ behavior: reducir ? 'auto' : 'smooth', block: 'start' })
  }

  return (
    <div className="space-y-4">
      {/* ===== Así va a ser el cierre ===== */}
      <div className="ct-rise rounded-2xl border border-line bg-canvas/60 p-4">
        <p className="text-sm font-semibold text-ink-950">Así va a ser el cierre</p>
        <p className="mt-0.5 text-pretty text-xs leading-relaxed text-ink-500">
          Estos son los pasos que va a ver quien cierre la caja, en este orden. Tocá uno para ir a sus opciones.
          Los que dicen «No aparece» se saltean solos.
        </p>
        <ol className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {vista.map((v, i) => {
            const Icono = infoPaso(v.paso).icono
            return (
              <li key={v.paso}>
                <button
                  type="button"
                  onClick={() => irA(v.paso)}
                  className={cn(
                    'flex h-full w-full items-start gap-2.5 rounded-xl border bg-surface p-2.5 text-left transition-all duration-150',
                    'hover:border-line-strong hover:shadow-[0_6px_16px_rgba(10,10,11,0.06)]',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900',
                    v.aparece ? 'border-line' : 'border-dashed border-line-strong opacity-60',
                  )}
                >
                  <span
                    className={cn(
                      'grid h-7 w-7 shrink-0 place-items-center rounded-full',
                      v.aparece ? 'bg-ink-950 text-on-ink' : 'bg-ink-100 text-ink-400',
                    )}
                    aria-hidden
                  >
                    <Icono className="h-3.5 w-3.5" strokeWidth={2} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[0.64rem] font-semibold uppercase tracking-[0.1em] text-ink-400">
                      Paso {i + 1}
                    </span>
                    <span className="block text-xs font-semibold leading-snug text-ink-900">
                      {infoPaso(v.paso).corto}
                    </span>
                    <span className={cn('mt-0.5 block text-[0.68rem] leading-snug', v.aparece ? 'text-ink-500' : 'text-ink-400')}>
                      {v.aparece ? v.detalle : 'No aparece'}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
        <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-ink-500">
          <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            ¿Querés ver cómo queda? Entrá a <b className="font-semibold text-ink-700">«Práctica»</b> en la pantalla de Caja:
            el ensayo usa esta misma configuración y no guarda nada.
          </span>
        </p>
      </div>

      {/* ===== Paso 1 ===== */}
      <Bloque
        id={idPaso('tareas')}
        numero={1}
        icono={infoPaso('tareas').icono}
        titulo="Antes de empezar"
        descripcion="Cosas para hacer antes de contar la plata. Quien cierra las tiene que tildar todas para poder seguir. Si no hay nada para tildar, este paso no aparece."
        estado={<Pildora apagada={!estadoDe('tareas').aparece}>{estadoDe('tareas').cuando}</Pildora>}
        indice={1}
      >
        <Opcion
          titulo="Pedir el cierre del posnet"
          descripcion={
            <>
              Si ese día se cobró con tarjeta, quien cierra tiene que confirmar que hizo el «Cierre de lote» en el
              posnet (la maquinita de las tarjetas). Ese ticket dice cuánto se cobró con tarjeta y sirve para
              comparar con lo que anotó el sistema.
            </>
          }
          control={
            <Interruptor
              activo={config.exigirLote}
              onChange={(v) => guardar({ exigirLote: v })}
              etiqueta="Pedir el cierre del posnet"
            />
          }
        />
        <Opcion
          titulo="Tareas del local"
          descripcion={
            <>
              Sumá lo que quieras que se haga antes de cerrar. Quedan anotadas en el comprobante del cierre, con
              quién las tildó.
            </>
          }
        >
          <EditorTareas tareas={config.tareasCierre} onCambiar={(tareasCierre) => guardar({ tareasCierre })} />
        </Opcion>
      </Bloque>

      {/* ===== Paso 2 ===== */}
      <Bloque
        id={idPaso('efectivo')}
        numero={2}
        icono={infoPaso('efectivo').icono}
        titulo="Contar el efectivo"
        descripcion="Quien cierra cuenta la plata que hay en el cajón. Este paso aparece siempre."
        estado={<Pildora>Siempre</Pildora>}
        indice={2}
      >
        <Opcion titulo="¿Cómo se cuenta?" descripcion="Elegí la forma que le resulte más fácil a tu equipo.">
          <Elegir
            etiqueta="Cómo se cuenta el efectivo"
            valor={config.modoConteo}
            onChange={(modoConteo) => guardar({ modoConteo })}
            opciones={MODOS_CONTEO}
          />
        </Opcion>
        <Opcion
          titulo="Esconder cuánto tendría que haber"
          descripcion={
            <>
              Mientras cuenta, quien cierra no ve cuánta plata tendría que haber: lo ve recién al terminar. Así
              cuenta de verdad y no «acomoda» el número para que cierre. Además, en la pantalla de Caja ese número
              lo ven solo los administradores.
              <Ejemplo>
                prendido, quien cierra cuenta $ 152.500 sin saber que tenía que haber $ 154.000; recién después ve
                que faltan $ 1.500.
              </Ejemplo>
            </>
          }
          control={
            <Interruptor
              activo={config.cierreCiego}
              onChange={(v) => guardar({ cierreCiego: v })}
              etiqueta="Esconder cuánto tendría que haber"
            />
          }
        />
        <Opcion
          titulo="Billetes para contar"
          descripcion={
            config.modoConteo === 'total' ? (
              <>Contando «Escribiendo el total» no se usan: se escribe el total directamente.</>
            ) : (
              <>
                Tocá un billete para sacarlo o ponerlo en la lista. Los que casi no se usan podés sacarlos: si
                aparece alguno, se suma junto con las monedas en «Monedas y sueltos».
              </>
            )
          }
        >
          <div
            className={cn('flex flex-wrap gap-1.5', config.modoConteo === 'total' && 'opacity-50')}
            role="group"
            aria-label="Billetes que aparecen para contar"
          >
            {DENOMINACIONES_ARS.map((den) => {
              const activa = config.denominaciones.includes(den)
              return (
                <button
                  key={den}
                  type="button"
                  onClick={() => toggleBillete(den)}
                  aria-pressed={activa}
                  className={cn(
                    'tnum inline-flex h-9 items-center rounded-full border px-3.5 text-xs font-semibold transition-all duration-150',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900',
                    activa
                      ? 'border-ink-950 bg-ink-950 text-on-ink'
                      : 'border-dashed border-line-strong bg-surface text-ink-400 line-through decoration-ink-300 hover:border-ink-300 hover:text-ink-700',
                  )}
                >
                  {money0(den)}
                </button>
              )
            })}
          </div>
        </Opcion>
      </Bloque>

      {/* ===== Paso 3 ===== */}
      <Bloque
        id={idPaso('otros')}
        numero={3}
        icono={infoPaso('otros').icono}
        titulo="Transferencias y tarjetas"
        descripcion="Lo que entró sin efectivo también se puede controlar al cerrar."
        estado={<Pildora apagada={!estadoDe('otros').aparece}>{estadoDe('otros').cuando}</Pildora>}
        indice={3}
      >
        <Opcion
          titulo="Revisar transferencias y tarjetas"
          descripcion={
            <>
              Quien cierra mira el banco y el ticket del posnet, y marca si coincide con lo que anotó el sistema
              (si no, escribe lo que ve). Si lo apagás, este paso no aparece y se da por bueno lo que anotó el
              sistema.
              <Ejemplo>
                el sistema anotó $ 45.000 en transferencias; quien cierra mira el banco, ve lo mismo y toca «Sí, es
                igual».
              </Ejemplo>
            </>
          }
          control={
            <Interruptor
              activo={config.controlarOtrosMedios}
              onChange={(v) => guardar({ controlarOtrosMedios: v })}
              etiqueta="Revisar transferencias y tarjetas"
            />
          }
        />
      </Bloque>

      {/* ===== Paso 4 ===== */}
      <Bloque
        id={idPaso('resultado')}
        numero={4}
        icono={infoPaso('resultado').icono}
        titulo="¿Cuadra?"
        descripcion="El sistema compara lo que se contó con lo que tendría que haber, y muestra si falta o sobra plata. Si no cuadra, primero ofrece volver a contar."
        estado={<Pildora>Siempre</Pildora>}
        indice={4}
      >
        <Opcion
          titulo="¿Cuándo hay que explicar una diferencia?"
          descripcion="Explicar es elegir qué pasó (por ejemplo «Se dio mal un vuelto») y escribirlo con palabras propias. Queda guardado en el comprobante."
        >
          <Elegir
            etiqueta="Cuándo hay que explicar una diferencia"
            valor={modoTolerancia}
            onChange={cambiarTolerancia}
            opciones={MODOS_TOLERANCIA}
          />
          {modoTolerancia === 'grande' && (
            <div className="animate-fade-in mt-3 flex flex-col gap-2 rounded-xl bg-canvas px-3.5 py-3 ring-1 ring-line sm:flex-row sm:items-center sm:justify-between">
              <label htmlFor="config-tolerancia" className="text-sm text-ink-700">
                Hay que explicar si falta o sobra más de
              </label>
              <MontoConfig
                key={config.toleranciaMonto}
                id="config-tolerancia"
                inicial={config.toleranciaMonto}
                onGuardar={(v) => guardar({ toleranciaMonto: v })}
              />
            </div>
          )}
        </Opcion>
      </Bloque>

      {/* ===== Paso 5 ===== */}
      <Bloque
        id={idPaso('fondo')}
        numero={5}
        icono={infoPaso('fondo').icono}
        titulo="Plata para mañana"
        descripcion="Al cerrar se decide cuánta plata queda en el cajón para dar vuelto al día siguiente (el «fondo» o «cambio»). El resto se guarda aparte: caja fuerte o banco."
        estado={<Pildora apagada={!estadoDe('fondo').aparece}>{estadoDe('fondo').cuando}</Pildora>}
        indice={5}
      >
        <Opcion titulo="¿Cuánta plata queda en el cajón?" descripcion="Elegí cómo se decide.">
          <Elegir
            etiqueta="Cuánta plata queda en el cajón"
            valor={config.modoFondo}
            onChange={(modoFondo) => guardar({ modoFondo })}
            opciones={MODOS_FONDO}
          />
        </Opcion>
        <Opcion
          titulo="Monto de cambio"
          descripcion={
            <>
              {config.modoFondo === 'todo'
                ? 'Con «Toda la plata» no se usa al cerrar, pero se propone al abrir la caja cuando no hay un cierre anterior.'
                : 'Es la plata que conviene dejar para dar vuelto. También se propone al abrir la caja cuando no hay un cierre anterior.'}
            </>
          }
          control={
            <MontoConfig
              key={config.fondoSugerido}
              id="config-fondo"
              inicial={config.fondoSugerido}
              onGuardar={(v) => guardar({ fondoSugerido: v })}
            />
          }
        />
      </Bloque>

      {/* ===== Paso 6 ===== */}
      <Bloque
        id={idPaso('confirmar')}
        numero={6}
        icono={infoPaso('confirmar').icono}
        titulo="Cerrar"
        descripcion="Quien cierra ve un resumen de todo en palabras simples y toca «Cerrar la caja». Se guarda el comprobante (el «Z») y ya no se puede cambiar. Este paso no tiene opciones."
        estado={<Pildora>Siempre</Pildora>}
        indice={6}
      />
    </div>
  )
}

// ===== Piezas =====

/** Un monto de la configuración: se guarda al salir del campo (o con Enter). */
function MontoConfig({
  id,
  inicial,
  onGuardar,
}: {
  id: string
  inicial: number
  onGuardar: (v: number) => void
}) {
  const [texto, setTexto] = useState(String(inicial))
  return (
    <CampoPlata
      id={id}
      valor={texto}
      onValor={setTexto}
      onBlur={() => {
        const v = Math.max(0, leerMonto(texto))
        if (v !== inicial) onGuardar(v)
        else setTexto(String(inicial))
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
      className="w-full sm:w-40"
    />
  )
}

/** La lista de tareas antes de cerrar: agregar, cambiar el orden y sacar. */
function EditorTareas({ tareas, onCambiar }: { tareas: string[]; onCambiar: (tareas: string[]) => void }) {
  const toast = useToast()
  const [nueva, setNueva] = useState('')

  const llena = tareas.length >= MAX_TAREAS_CIERRE
  const repetida = (texto: string) => tareas.some((t) => t.toLocaleLowerCase('es') === texto.toLocaleLowerCase('es'))

  function agregar(texto: string) {
    const limpio = texto.split(/\s+/).filter(Boolean).join(' ')
    if (!limpio) return
    if (repetida(limpio)) {
      toast.info('Esa tarea ya está en la lista')
      return
    }
    if (llena) {
      toast.error(`Como mucho ${MAX_TAREAS_CIERRE} tareas`, 'El repaso tiene que ser corto para que se haga de verdad.')
      return
    }
    onCambiar([...tareas, limpio.slice(0, MAX_LARGO_TAREA)])
    setNueva('')
  }

  function mover(i: number, delta: -1 | 1) {
    const j = i + delta
    if (j < 0 || j >= tareas.length) return
    const copia = [...tareas]
    ;[copia[i], copia[j]] = [copia[j], copia[i]]
    onCambiar(copia)
  }

  const ideas = IDEAS_TAREAS.filter((idea) => !repetida(idea))

  return (
    <div>
      {tareas.length > 0 ? (
        <ol className="divide-y divide-line overflow-hidden rounded-xl border border-line">
          {tareas.map((t, i) => (
            <li key={`${i}-${t}`} className="flex items-center gap-2 py-1.5 pl-3 pr-1.5">
              <span className="tnum grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink-100 text-[0.68rem] font-bold text-ink-600">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 text-sm text-ink-800">{t}</span>
              <div className="flex shrink-0 items-center">
                <BotonIcono etiqueta={`Subir «${t}»`} onClick={() => mover(i, -1)} disabled={i === 0}>
                  <ArrowUp className="h-3.5 w-3.5" />
                </BotonIcono>
                <BotonIcono etiqueta={`Bajar «${t}»`} onClick={() => mover(i, 1)} disabled={i === tareas.length - 1}>
                  <ArrowDown className="h-3.5 w-3.5" />
                </BotonIcono>
                <BotonIcono etiqueta={`Sacar «${t}»`} onClick={() => onCambiar(tareas.filter((_, j) => j !== i))}>
                  <Trash2 className="h-3.5 w-3.5" />
                </BotonIcono>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-xl border border-dashed border-line-strong px-3.5 py-3 text-xs leading-relaxed text-ink-500">
          Todavía no hay tareas del local. Escribí una abajo o tocá una idea.
        </p>
      )}

      <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
        <Input
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              agregar(nueva)
            }
          }}
          maxLength={MAX_LARGO_TAREA}
          disabled={llena}
          placeholder={llena ? `Ya hay ${MAX_TAREAS_CIERRE} tareas (el máximo)` : 'Ej: Guardar los celulares de la vitrina'}
          aria-label="Nueva tarea antes de cerrar"
          className="h-10 flex-1"
        />
        <Button size="sm" variant="outline" className="h-10" onClick={() => agregar(nueva)} disabled={!nueva.trim() || llena}>
          <Plus className="h-4 w-4" />
          Agregar tarea
        </Button>
      </div>

      {ideas.length > 0 && !llena && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-ink-400">Ideas:</span>
          {ideas.map((idea) => (
            <button
              key={idea}
              type="button"
              onClick={() => agregar(idea)}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-line-strong px-2.5 py-1 text-xs text-ink-600 transition-colors hover:border-ink-300 hover:bg-ink-50 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
            >
              <Plus className="h-3 w-3" aria-hidden />
              {idea}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function BotonIcono({
  etiqueta,
  onClick,
  disabled,
  children,
}: {
  etiqueta: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={etiqueta}
      title={etiqueta}
      className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900 disabled:opacity-25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
    >
      {children}
    </button>
  )
}
