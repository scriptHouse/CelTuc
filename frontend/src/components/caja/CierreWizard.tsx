import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Check, CircleHelp, Lock, X } from 'lucide-react'
import type {
  CajaConfig,
  CajaRegistradora,
  CierreCaja,
  ConteoBilletes,
  MedioPagoCaja,
  MovimientoCaja,
  SesionCaja,
} from '@/types'
import { MEDIOS_CON_LOTE, MEDIOS_PAGO_CAJA } from '@/types'
import { plata } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ToastProvider'
import { useConfirm } from '@/components/ConfirmProvider'
import { calcularResumenSesion } from '@/services/caja'
import type { CerrarCajaInput } from '@/services/caja'
import { CierreDetalleModal } from '@/components/caja/CierreDetalleModal'
import { DiffChip } from '@/components/caja/DiffChip'
import { nombreCaja, totalConteo } from '@/components/caja/medios'
import {
  OTROS_MEDIOS,
  TAREA_LOTE,
  centavos,
  hayMonto,
  infoPaso,
  leerMonto,
  medioRevisado,
  montoATexto,
  pasoVigente,
  pasosDelCierre,
  tareasDelCierre,
} from '@/components/caja/cierre/pasos'
import type { FormaConteo, OtroMedio, PasoCierre, RevisionMedio } from '@/components/caja/cierre/pasos'
import { AyudaPaso } from '@/components/caja/cierre/piezas'
import { PasoTareas } from '@/components/caja/cierre/PasoTareas'
import { PasoEfectivo } from '@/components/caja/cierre/PasoEfectivo'
import { PasoOtrosCobros } from '@/components/caja/cierre/PasoOtrosCobros'
import { PasoResultado } from '@/components/caja/cierre/PasoResultado'
import { PasoFondo } from '@/components/caja/cierre/PasoFondo'
import { PasoConfirmar } from '@/components/caja/cierre/PasoConfirmar'
import { CierreListo } from '@/components/caja/cierre/CierreListo'

/**
 * El cierre de caja, paso a paso y con una sola cosa por pantalla (patrón
 * «El Ritual»: Square Close of Day + Toast Shift Review + Shopify float),
 * pensado para que lo haga cualquiera sin que nadie le explique:
 *
 *  1. Antes de empezar — las tareas a tildar (cierre del posnet, las propias).
 *  2. Contar efectivo — tocando cada billete, o escribiendo el total.
 *  3. Otros cobros — «¿es lo mismo que ves?» para transferencias y tarjetas.
 *  4. ¿Cuadra? — la respuesta grande, la cuenta explicada y, si no cuadra,
 *     volver a contar o contar qué pasó.
 *  5. Para mañana — cuánto queda en el cajón y cuánto se guarda aparte.
 *  6. Cerrar — el resumen en palabras y el botón final.
 *
 * Cada paso aparece solo si hace falta y según la configuración (Configurar →
 * Cierre de caja). Cada pantalla trae su «¿Qué hago acá?», que se puede
 * esconder (se recuerda en este navegador).
 */

const CLAVE_AYUDAS = 'celtuc-caja-cierre-ayudas'

function leerAyudasVisibles(): boolean {
  try {
    return localStorage.getItem(CLAVE_AYUDAS) !== 'ocultas'
  } catch {
    return true
  }
}

function guardarAyudasVisibles(visibles: boolean) {
  try {
    localStorage.setItem(CLAVE_AYUDAS, visibles ? 'visibles' : 'ocultas')
  } catch {
    /* sin localStorage (modo privado) las ayudas se ven siempre */
  }
}

const MEDIOS: MedioPagoCaja[] = MEDIOS_PAGO_CAJA.map((m) => m.value)

export function CierreWizard({
  caja,
  sesion,
  movimientos,
  config,
  onCerrar,
  onSalir,
}: {
  caja: CajaRegistradora
  sesion: SesionCaja
  movimientos: MovimientoCaja[]
  config: CajaConfig
  /** Ejecuta el cierre en el servicio y devuelve el comprobante Z. */
  onCerrar: (input: Omit<CerrarCajaInput, 'sesionId' | 'usuario'>) => Promise<CierreCaja>
  /** Volver a la página de Caja (cancelar o terminar). */
  onSalir: () => void
}) {
  const toast = useToast()
  const confirm = useConfirm()

  const resumen = useMemo(() => calcularResumenSesion(sesion, movimientos), [sesion, movimientos])

  // --- Qué tiene este cierre ------------------------------------------------------

  const huboTarjeta = MEDIOS_CON_LOTE.some((m) => resumen.ventasPorMedio[m] > 0)
  const tareas = useMemo(() => tareasDelCierre(config, huboTarjeta), [config, huboTarjeta])
  const controlados = config.controlarOtrosMedios
  /** Los medios con algo anotado: se preguntan uno por uno. */
  const mediosARevisar = useMemo(
    () => (controlados ? OTROS_MEDIOS.filter((m) => resumen.esperadoPorMedio[m] !== 0) : []),
    [controlados, resumen],
  )
  /** Los que no tienen nada anotado (por si entró plata que no se cargó). */
  const mediosExtra = useMemo(
    () => (controlados ? OTROS_MEDIOS.filter((m) => resumen.esperadoPorMedio[m] === 0) : []),
    [controlados, resumen],
  )

  // --- Estado ---------------------------------------------------------------------

  const [paso, setPaso] = useState<PasoCierre>(() => (tareas.length > 0 ? 'tareas' : 'efectivo'))
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd')
  const [ayudas, setAyudas] = useState(leerAyudasVisibles)

  const [hechas, setHechas] = useState<string[]>([])

  const [forma, setForma] = useState<FormaConteo>(config.modoConteo === 'total' ? 'total' : 'billetes')
  const [conteo, setConteo] = useState<ConteoBilletes>({})
  const [sueltos, setSueltos] = useState('')
  const [totalEscrito, setTotalEscrito] = useState('')

  const [revision, setRevision] = useState<Partial<Record<OtroMedio, RevisionMedio>>>({})
  const [montosExtra, setMontosExtra] = useState<Partial<Record<OtroMedio, string>>>({})

  /** La diferencia que se marcó como vista (si cambia al recontar, hay que volver a verla). */
  const [difVista, setDifVista] = useState<number | null>(null)
  const [motivo, setMotivo] = useState('')
  const [nota, setNota] = useState('')

  /** null = todavía no se tocó: se propone el fondo de la configuración. */
  const [fondoTexto, setFondoTexto] = useState<string | null>(null)

  const [guardando, setGuardando] = useState(false)
  const [resultado, setResultado] = useState<CierreCaja | null>(null)
  const [verDetalle, setVerDetalle] = useState(false)

  // --- Cuentas --------------------------------------------------------------------

  // Si la configuración cambia en el medio, manda la configuración.
  const formaEfectiva: FormaConteo = config.modoConteo === 'elegir' ? forma : config.modoConteo
  const contadoEfectivo = centavos(
    formaEfectiva === 'billetes' ? totalConteo(conteo, leerMonto(sueltos)) : leerMonto(totalEscrito),
  )

  const contadoPorMedio = useMemo(() => {
    const r = { efectivo: contadoEfectivo } as Record<MedioPagoCaja, number>
    for (const m of OTROS_MEDIOS) {
      const anotado = resumen.esperadoPorMedio[m]
      if (!controlados) {
        r[m] = anotado // no se revisa: vale lo que anotó el sistema
      } else if (mediosARevisar.includes(m)) {
        const rv = revision[m]
        r[m] = rv?.respuesta === 'otro' && hayMonto(rv.monto) ? leerMonto(rv.monto) : anotado
      } else {
        r[m] = leerMonto(montosExtra[m] ?? '')
      }
    }
    return r
  }, [contadoEfectivo, controlados, mediosARevisar, montosExtra, resumen, revision])

  const diferenciaPorMedio = useMemo(() => {
    const r = {} as Record<MedioPagoCaja, number>
    for (const m of MEDIOS) r[m] = centavos(contadoPorMedio[m] - resumen.esperadoPorMedio[m])
    return r
  }, [contadoPorMedio, resumen])
  const difTotal = centavos(MEDIOS.reduce((a, m) => a + diferenciaPorMedio[m], 0))
  const requiereMotivo = config.toleranciaActiva && Math.abs(difTotal) > config.toleranciaMonto

  /** Transferencias y tarjetas que se muestran en el resultado y el resumen. */
  const otrosMostrados = controlados
    ? OTROS_MEDIOS.filter((m) => mediosARevisar.includes(m) || contadoPorMedio[m] !== 0)
    : []

  const fondoPedido = fondoTexto === null ? config.fondoSugerido : leerMonto(fondoTexto)
  const fondoFinal = centavos(
    config.modoFondo === 'fijo'
      ? Math.min(config.fondoSugerido, contadoEfectivo)
      : config.modoFondo === 'todo'
        ? contadoEfectivo
        : Math.max(0, Math.min(fondoPedido, contadoEfectivo)),
  )
  const retiroFinal = centavos(Math.max(0, contadoEfectivo - fondoFinal))

  // --- Pasos ----------------------------------------------------------------------

  // «Para mañana» depende solo de la configuración (no de lo contado): así la
  // cantidad de pasos no cambia en el medio («Paso 2 de 5» sigue siendo de 5).
  const pasos = pasosDelCierre({
    tareas: tareas.length > 0,
    otros: mediosARevisar.length > 0,
    fondo: config.modoFondo === 'preguntar',
  })
  const actual = pasoVigente(paso, pasos)
  const indice = pasos.indexOf(actual)
  const info = infoPaso(actual, formaEfectiva)

  const faltanTareas = tareas.filter((t) => !hechas.includes(t.clave)).length
  const faltanRevisar = mediosARevisar.filter((m) => !medioRevisado(revision[m])).length
  const difAceptada =
    difTotal === 0 ||
    (requiereMotivo ? Boolean(motivo) && nota.trim().length > 0 : difVista === difTotal)

  // Cada paso arranca arriba de todo (en el celular, el botón quedó abajo).
  const primerPaso = useRef(true)
  useEffect(() => {
    if (primerPaso.current) {
      primerPaso.current = false
      return
    }
    const reducir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: reducir ? 'auto' : 'smooth' })
  }, [actual])

  // --- Acciones -------------------------------------------------------------------

  function irA(destino: PasoCierre) {
    const i = pasos.indexOf(destino)
    if (i === -1 || destino === actual) return
    setDir(i > indice ? 'fwd' : 'back')
    setPaso(destino)
  }

  function mostrarAyudas(visibles: boolean) {
    setAyudas(visibles)
    guardarAyudasVisibles(visibles)
  }

  async function adelante() {
    if (actual === 'confirmar') {
      await handleCerrar()
      return
    }
    if (actual === 'efectivo' && contadoEfectivo === 0) {
      const ok = await confirm({
        title: '¿El cajón está vacío?',
        description: 'Contaste $ 0 en efectivo. Si de verdad no hay plata, seguí. Si no, contá los billetes.',
        confirmLabel: 'Sí, está vacío',
        cancelLabel: 'Volver a contar',
        tone: 'warning',
      })
      if (!ok) return
    }
    const siguiente = pasos[indice + 1]
    if (siguiente) irA(siguiente)
  }

  function atras() {
    if (indice > 0) irA(pasos[indice - 1])
  }

  async function handleSalir() {
    const hayAvance = indice > 0 || hechas.length > 0 || contadoEfectivo > 0
    if (hayAvance) {
      const ok = await confirm({
        title: '¿Salir sin cerrar la caja?',
        description: 'Se pierde lo que contaste hasta ahora. La caja sigue abierta y la podés cerrar más tarde.',
        confirmLabel: 'Salir sin cerrar',
        cancelLabel: 'Seguir cerrando',
        tone: 'warning',
      })
      if (!ok) return
    }
    onSalir()
  }

  async function reiniciarConteo() {
    const ok = await confirm({
      title: '¿Empezar a contar de nuevo?',
      description: 'Se borra todo lo que contaste en efectivo.',
      confirmLabel: 'Borrar y empezar',
      cancelLabel: 'No, dejarlo',
      tone: 'warning',
    })
    if (!ok) return
    setConteo({})
    setSueltos('')
  }

  function cambiarForma(nueva: FormaConteo) {
    // Si ya se contaron billetes, el total escrito arranca con esa suma.
    if (nueva === 'total' && !totalEscrito.trim()) {
      const contado = totalConteo(conteo, leerMonto(sueltos))
      if (contado > 0) setTotalEscrito(String(centavos(contado)))
    }
    setForma(nueva)
  }

  async function handleCerrar() {
    setGuardando(true)
    try {
      const cierre = await onCerrar({
        contadoPorMedio,
        conteoCierre:
          formaEfectiva === 'billetes' && Object.values(conteo).some((c) => c > 0) ? conteo : undefined,
        fondoSiguiente: fondoFinal,
        motivoDiferencia: difTotal !== 0 && motivo ? motivo : undefined,
        notaDiferencia: difTotal !== 0 && nota.trim() ? nota.trim() : undefined,
        tareasConfirmadas: tareas.map((t) => t.registro),
      })
      setResultado(cierre)
      window.scrollTo({ top: 0 })
    } catch (e) {
      toast.error('No se pudo cerrar la caja', e instanceof Error ? e.message : undefined)
    } finally {
      setGuardando(false)
    }
  }

  // --- Terminado: el comprobante ya existe ---------------------------------------------

  if (resultado) {
    return (
      <>
        <CierreListo
          cierre={resultado}
          caja={caja}
          conLote={tareas.some((t) => t.clave === TAREA_LOTE.clave)}
          onVerComprobante={() => setVerDetalle(true)}
          onSalir={onSalir}
        />
        <CierreDetalleModal open={verDetalle} cierre={resultado} onClose={() => setVerDetalle(false)} />
      </>
    )
  }

  // --- La barra de abajo: qué falta y el botón para seguir -------------------------------

  const barra = ((): BarraAcciones => {
    switch (actual) {
    case 'tareas':
      return {
        etiqueta: 'Empezar a contar',
        corta: 'Empezar',
        puede: faltanTareas === 0,
        info:
          faltanTareas > 0 ? (
            <InfoTexto>
              Te falta tildar {faltanTareas === 1 ? '1 tarea' : `${faltanTareas} tareas`}
            </InfoTexto>
          ) : (
            <InfoTexto ok>Todo tildado</InfoTexto>
          ),
      }
    case 'efectivo':
      return {
        etiqueta: 'Listo, ya conté',
        corta: 'Ya conté',
        puede: true,
        info: (
          <InfoMonto
            etiqueta="Contaste"
            valor={contadoEfectivo}
            extra={config.cierreCiego ? undefined : `de ${plata(resumen.esperadoPorMedio.efectivo)}`}
          />
        ),
      }
    case 'otros':
      return {
        etiqueta: 'Seguir',
        puede: faltanRevisar === 0,
        info:
          faltanRevisar > 0 ? (
            <InfoTexto>Te falta revisar {faltanRevisar === 1 ? '1' : faltanRevisar}</InfoTexto>
          ) : (
            <InfoTexto ok>Todo revisado</InfoTexto>
          ),
      }
    case 'resultado':
      return {
        etiqueta: 'Seguir',
        puede: difAceptada,
        info: difAceptada ? (
          <DiffChip valor={difTotal} />
        ) : (
          <InfoTexto>{requiereMotivo ? 'Elegí qué pasó y contalo' : 'Tocá «Vi la diferencia»'}</InfoTexto>
        ),
      }
    case 'fondo':
      return {
        etiqueta: 'Seguir',
        puede: true,
        info: <InfoMonto etiqueta="Queda en el cajón" valor={fondoFinal} />,
      }
    case 'confirmar':
      return {
        etiqueta: guardando ? 'Cerrando…' : 'Cerrar la caja',
        corta: guardando ? 'Cerrando…' : 'Cerrar caja',
        puede: !guardando,
        cerrar: true,
        info: <InfoTexto>Es el último paso</InfoTexto>,
      }
    }
  })()

  // --- El asistente ----------------------------------------------------------------------

  return (
    <div className="animate-fade-in mx-auto max-w-3xl">
      {/* Encabezado: dónde estoy y qué hay que hacer */}
      <div className="ct-rise mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-2 inline-flex max-w-full items-center gap-1.5 rounded-full bg-ink-100 py-1 pl-2 pr-2.5 text-xs text-ink-600">
            <Lock className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
            <span className="shrink-0">Cerrando</span>
            <b className="min-w-0 truncate font-semibold text-ink-900">{nombreCaja(caja)}</b>
            <span className="tnum hidden shrink-0 text-ink-400 sm:inline">· turno #{sesion.numero}</span>
          </p>
          <h1 className="text-balance text-2xl font-bold tracking-[-0.02em] text-ink-950 sm:text-[1.75rem]">
            {info.titulo}
          </h1>
          <p className="mt-1 text-pretty text-sm leading-relaxed text-ink-500 sm:text-[0.95rem]">{info.bajada}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!ayudas && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => mostrarAyudas(true)}
              aria-label="Mostrar las ayudas"
              className="px-2.5 sm:px-3"
            >
              <CircleHelp className="h-4 w-4" />
              <span className="hidden sm:inline">Ayuda</span>
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={handleSalir} aria-label="Salir sin cerrar" className="px-2.5 sm:px-3">
            <X className="h-4 w-4" />
            <span className="hidden sm:inline">Salir</span>
          </Button>
        </div>
      </div>

      <BarraPasos pasos={pasos} actual={actual} forma={formaEfectiva} onIr={irA} />

      {ayudas && (
        <div className="mb-4">
          <AyudaPaso key={actual} texto={info.ayuda} onOcultar={() => mostrarAyudas(false)} />
        </div>
      )}

      {/* El paso (la key reinicia la animación de entrada) */}
      <div key={actual} className={dir === 'back' ? 'ct-step-back' : 'ct-step-fwd'}>
        {actual === 'tareas' && (
          <PasoTareas
            tareas={tareas}
            hechas={hechas}
            onToggle={(clave) =>
              setHechas((prev) => (prev.includes(clave) ? prev.filter((c) => c !== clave) : [...prev, clave]))
            }
          />
        )}

        {actual === 'efectivo' && (
          <PasoEfectivo
            config={config}
            forma={formaEfectiva}
            onForma={cambiarForma}
            conteo={conteo}
            onConteo={setConteo}
            sueltos={sueltos}
            onSueltos={setSueltos}
            total={totalEscrito}
            onTotal={setTotalEscrito}
            onReiniciar={reiniciarConteo}
            esperado={resumen.esperadoPorMedio.efectivo}
          />
        )}

        {actual === 'otros' && (
          <PasoOtrosCobros
            medios={mediosARevisar}
            extras={mediosExtra}
            resumen={resumen}
            revision={revision}
            onRevision={(medio, r) => setRevision((prev) => ({ ...prev, [medio]: r }))}
            montosExtra={montosExtra}
            onMontoExtra={(medio, texto) => setMontosExtra((prev) => ({ ...prev, [medio]: texto }))}
          />
        )}

        {actual === 'resultado' && (
          <PasoResultado
            config={config}
            sesion={sesion}
            resumen={resumen}
            otros={otrosMostrados}
            controlados={controlados}
            contadoPorMedio={contadoPorMedio}
            diferenciaPorMedio={diferenciaPorMedio}
            difTotal={difTotal}
            requiereMotivo={requiereMotivo}
            motivo={motivo}
            onMotivo={setMotivo}
            nota={nota}
            onNota={setNota}
            vista={difVista === difTotal}
            onVista={() => setDifVista((v) => (v === difTotal ? null : difTotal))}
            onRecontar={() => irA('efectivo')}
            onRevisarOtros={pasos.includes('otros') ? () => irA('otros') : undefined}
          />
        )}

        {actual === 'fondo' && (
          <PasoFondo
            contado={contadoEfectivo}
            fondo={fondoFinal}
            texto={fondoTexto ?? montoATexto(fondoFinal)}
            onTexto={setFondoTexto}
            sugerido={config.fondoSugerido}
            fondoDeHoy={sesion.fondoInicial}
          />
        )}

        {actual === 'confirmar' && (
          <PasoConfirmar
            caja={caja}
            sesion={sesion}
            resumen={resumen}
            config={config}
            pasos={pasos}
            otros={otrosMostrados}
            controlados={controlados}
            contadoPorMedio={contadoPorMedio}
            diferenciaPorMedio={diferenciaPorMedio}
            difTotal={difTotal}
            motivo={difTotal !== 0 ? motivo : ''}
            nota={difTotal !== 0 ? nota : ''}
            fondo={fondoFinal}
            retiro={retiroFinal}
            tareas={tareas}
            onIrA={irA}
          />
        )}
      </div>

      {/* Barra de abajo: siempre a mano (en el celular, arriba del menú). */}
      <div className="sticky bottom-[calc(5.75rem_+_env(safe-area-inset-bottom))] z-20 mt-6 lg:bottom-5">
        <div className="flex items-center gap-2 rounded-[1.35rem] border border-line bg-surface/92 p-2 shadow-[0_18px_45px_rgba(10,10,11,0.14)] backdrop-blur-xl sm:gap-3">
          {indice > 0 && (
            <Button
              variant="outline"
              onClick={atras}
              aria-label="Volver al paso anterior"
              className="h-12 w-12 shrink-0 px-0 sm:w-auto sm:px-4"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Volver</span>
            </Button>
          )}
          <div className="min-w-0 flex-1 px-1.5">{barra.info}</div>
          <Button onClick={adelante} disabled={!barra.puede} className="h-12 shrink-0 px-4 text-[0.95rem] sm:px-5">
            {barra.cerrar && <Lock className="h-4 w-4" />}
            <span className="sm:hidden">{barra.corta ?? barra.etiqueta}</span>
            <span className="hidden sm:inline">{barra.etiqueta}</span>
            {!barra.cerrar && <ArrowRight className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ===== Piezas =====

/**
 * La barra de pasos. En el celular: «Paso 2 de 5» y una rayita por paso. En
 * pantallas más grandes: todos los pasos con su nombre; los ya hechos se
 * pueden tocar para volver.
 */
function BarraPasos({
  pasos,
  actual,
  forma,
  onIr,
}: {
  pasos: PasoCierre[]
  actual: PasoCierre
  forma: FormaConteo
  onIr: (paso: PasoCierre) => void
}) {
  const i = pasos.indexOf(actual)
  const siguiente = pasos[i + 1]

  return (
    <nav aria-label="Pasos del cierre" className="ct-rise mb-5">
      {/* Celular */}
      <div className="sm:hidden">
        <div className="flex items-baseline justify-between gap-3 text-xs">
          <span className="font-semibold text-ink-900">
            Paso {i + 1} de {pasos.length}
          </span>
          <span className="truncate text-ink-400">
            {siguiente ? `Después: ${infoPaso(siguiente, forma).corto}` : 'Es el último'}
          </span>
        </div>
        <div className="mt-2 flex gap-1.5" aria-hidden>
          {pasos.map((p, j) => (
            <span
              key={p}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-colors duration-500',
                j <= i ? 'bg-ink-950' : 'bg-ink-200',
              )}
            />
          ))}
        </div>
      </div>

      {/* Tablet y compu */}
      <ol className="hidden sm:grid" style={{ gridTemplateColumns: `repeat(${pasos.length}, minmax(0, 1fr))` }}>
        {pasos.map((p, j) => {
          const hecho = j < i
          const esActual = j === i
          const Icono = infoPaso(p, forma).icono
          return (
            <li key={p} className="relative flex justify-center">
              {j < pasos.length - 1 && (
                <span aria-hidden className="absolute left-1/2 top-4 h-px w-full overflow-hidden bg-line-strong">
                  <span
                    className={cn(
                      'absolute inset-0 origin-left bg-ink-950 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
                      hecho ? 'scale-x-100' : 'scale-x-0',
                    )}
                  />
                </span>
              )}
              <button
                type="button"
                onClick={() => onIr(p)}
                disabled={!hecho}
                aria-current={esActual ? 'step' : undefined}
                title={hecho ? `Volver a «${infoPaso(p, forma).corto}»` : undefined}
                className="group relative z-10 flex max-w-full flex-col items-center gap-1.5 rounded-xl px-1 pb-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 disabled:cursor-default"
              >
                <span
                  className={cn(
                    'grid h-8 w-8 place-items-center rounded-full border text-xs font-bold transition-all duration-300',
                    hecho && 'border-ink-300 bg-ink-100 text-ink-700 group-hover:border-ink-950',
                    esActual && 'border-ink-950 bg-ink-950 text-on-ink shadow-[0_8px_18px_rgba(10,10,11,0.22)]',
                    !hecho && !esActual && 'border-line-strong bg-surface text-ink-400',
                  )}
                >
                  {hecho ? (
                    <Check className="h-4 w-4" strokeWidth={2.5} />
                  ) : esActual ? (
                    <Icono className="h-4 w-4" strokeWidth={2} />
                  ) : (
                    j + 1
                  )}
                </span>
                <span
                  className={cn(
                    'max-w-full text-center text-[0.68rem] font-semibold leading-tight',
                    esActual ? 'text-ink-950' : hecho ? 'text-ink-600 group-hover:text-ink-950' : 'text-ink-400',
                  )}
                >
                  {infoPaso(p, forma).corto}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

interface BarraAcciones {
  etiqueta: string
  /** Versión corta del botón para el celular. */
  corta?: string
  info: ReactNode
  puede: boolean
  /** Es el botón final (candado, sin flecha). */
  cerrar?: boolean
}

/** Un texto corto en la barra de abajo (qué falta, o que ya está). */
function InfoTexto({ children, ok }: { children: ReactNode; ok?: boolean }) {
  return (
    <p
      className={cn(
        'flex items-center gap-1.5 text-sm font-medium leading-tight',
        ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-ink-600',
      )}
    >
      {ok && <Check className="h-4 w-4 shrink-0" strokeWidth={2.5} aria-hidden />}
      <span className="min-w-0">{children}</span>
    </p>
  )
}

/** Un monto grande en la barra de abajo («Contaste $ 152.500»). */
function InfoMonto({ etiqueta, valor, extra }: { etiqueta: string; valor: number; extra?: string }) {
  return (
    <div className="min-w-0 leading-tight">
      <p className="truncate text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-ink-400">{etiqueta}</p>
      <p className="flex min-w-0 items-baseline gap-1.5">
        <span key={valor} className="ct-count tnum truncate text-lg font-bold text-ink-950">
          {plata(valor)}
        </span>
        {extra && <span className="tnum hidden truncate text-xs text-ink-400 sm:inline">{extra}</span>}
      </p>
    </div>
  )
}
