import { Fragment, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Banknote,
  Check,
  EyeOff,
  Landmark,
  Lock,
  Mail,
  Printer,
  ScrollText,
  X,
} from 'lucide-react'
import type { CajaConfig, CajaRegistradora, CierreCaja, ConteoBilletes, MedioPagoCaja, MovimientoCaja, SesionCaja } from '@/types'
import { MEDIOS_CON_LOTE, MEDIOS_PAGO_CAJA, MOTIVOS_DIFERENCIA_CAJA } from '@/types'
import { money, money0, num } from '@/lib/format'
import { cn, ctStagger } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ToastProvider'
import { useConfirm } from '@/components/ConfirmProvider'
import { calcularResumenSesion } from '@/services/caja'
import type { CerrarCajaInput } from '@/services/caja'
import { DenomGrid } from '@/components/caja/DenomGrid'
import { DiffChip } from '@/components/caja/DiffChip'
import { CierreDetalleModal } from '@/components/caja/CierreDetalleModal'
import { MEDIO_ICONO, MEDIO_LABEL, operacionesLabel, totalConteo } from '@/components/caja/medios'

/**
 * El Ritual: cierre de caja guiado en 3 actos — Revisar → Contar → Confirmar —
 * (patrón Square Close of Day + Toast Shift Review + Shopify float).
 *  1. Checklist de pre-cierre (evita la causa n.º 1 de descuadres).
 *  2. Arqueo: billetes con la grilla, otros medios contra lote/extractos.
 *     Con cierre ciego, el esperado del efectivo no se muestra acá.
 *  3. Diferencia por medio, motivo si excede la tolerancia, fondo del próximo
 *     turno con retiro calculado, y el comprobante Z como resultado.
 */

const zNum = (n: number) => `Z-${String(n).padStart(4, '0')}`

const TITULOS: Record<1 | 2 | 3, { titulo: string; sub: string }> = {
  1: { titulo: 'Revisá el turno', sub: 'Chequeá que no quede nada afuera antes de contar.' },
  2: { titulo: 'Contá lo que hay', sub: 'Billetes con la grilla; tarjetas y billeteras contra sus comprobantes.' },
  3: { titulo: 'Confirmá el cierre', sub: 'Diferencia, fondo del próximo turno y comprobante Z.' },
}

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
  const otrosMedios = useMemo(() => MEDIOS_PAGO_CAJA.filter((m) => m.value !== 'efectivo'), [])

  const [paso, setPaso] = useState<1 | 2 | 3>(1)
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd')
  const [loteOk, setLoteOk] = useState(false)
  const [conteo, setConteo] = useState<ConteoBilletes>({})
  const [sueltos, setSueltos] = useState(0)
  const [contadoOtros, setContadoOtros] = useState<Partial<Record<MedioPagoCaja, string>>>(() => {
    const init: Partial<Record<MedioPagoCaja, string>> = {}
    for (const m of MEDIOS_PAGO_CAJA) {
      if (m.value !== 'efectivo') init[m.value] = resumen.esperadoPorMedio[m.value] ? String(resumen.esperadoPorMedio[m.value]) : ''
    }
    return init
  })
  const [fondoSiguiente, setFondoSiguiente] = useState(() => String(config.fondoSugerido || ''))
  const [confirmoDif, setConfirmoDif] = useState(false)
  const [motivoDif, setMotivoDif] = useState('')
  const [notaDif, setNotaDif] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [resultado, setResultado] = useState<CierreCaja | null>(null)
  const [verDetalle, setVerDetalle] = useState(false)

  // --- Derivados -------------------------------------------------------------

  const contadoEfectivo = totalConteo(conteo, sueltos)
  const contadoPorMedio = useMemo(() => {
    const r = { efectivo: contadoEfectivo } as Record<MedioPagoCaja, number>
    for (const m of otrosMedios) r[m.value] = Number(contadoOtros[m.value]) || 0
    return r
  }, [contadoEfectivo, contadoOtros, otrosMedios])

  const diferenciaPorMedio = useMemo(() => {
    const r = {} as Record<MedioPagoCaja, number>
    for (const m of MEDIOS_PAGO_CAJA) r[m.value] = contadoPorMedio[m.value] - resumen.esperadoPorMedio[m.value]
    return r
  }, [contadoPorMedio, resumen])

  const difTotal = MEDIOS_PAGO_CAJA.reduce((a, m) => a + diferenciaPorMedio[m.value], 0)
  const necesitaLote = config.exigirLote && MEDIOS_CON_LOTE.some((m) => resumen.ventasPorMedio[m] > 0)
  const excedeTolerancia = config.toleranciaActiva && Math.abs(difTotal) > config.toleranciaMonto
  const fondoNum = Math.max(0, Number(fondoSiguiente) || 0)
  const fondoExcede = fondoNum > contadoEfectivo
  const retiroFinal = Math.max(0, contadoEfectivo - fondoNum)

  const puedeContinuar = paso !== 1 || !necesitaLote || loteOk
  const puedeCerrar =
    !guardando && (difTotal === 0 || (excedeTolerancia ? Boolean(motivoDif) && notaDif.trim().length > 0 : confirmoDif))

  // --- Acciones ---------------------------------------------------------------

  function irA(nuevo: 1 | 2 | 3) {
    setDir(nuevo > paso ? 'fwd' : 'back')
    setPaso(nuevo)
  }

  async function handleCancelar() {
    if (contadoEfectivo > 0 || paso > 1) {
      const ok = await confirm({
        title: '¿Cancelar el cierre?',
        description: 'Se pierde el conteo cargado hasta ahora. El turno sigue abierto.',
        confirmLabel: 'Cancelar cierre',
        cancelLabel: 'Seguir contando',
        tone: 'warning',
      })
      if (!ok) return
    }
    onSalir()
  }

  async function handleCerrar() {
    setGuardando(true)
    try {
      const cierre = await onCerrar({
        contadoPorMedio,
        conteoCierre: Object.values(conteo).some((c) => c > 0) ? conteo : undefined,
        fondoSiguiente: Math.min(fondoNum, contadoEfectivo),
        motivoDiferencia: difTotal !== 0 && excedeTolerancia ? motivoDif : undefined,
        notaDiferencia: difTotal !== 0 && excedeTolerancia ? notaDif : undefined,
      })
      setResultado(cierre)
    } catch (e) {
      toast.error('No se pudo cerrar la caja', e instanceof Error ? e.message : undefined)
    } finally {
      setGuardando(false)
    }
  }

  // --- Pantalla de éxito (comprobante Z emitido) -------------------------------

  if (resultado) {
    return (
      <div className="animate-fade-in mx-auto max-w-xl">
        <Card className="px-6 py-10 text-center sm:px-10">
          <span className="relative mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-ink-950 text-on-ink">
            <span aria-hidden className="ct-modal-halo absolute -inset-2 rounded-[1.4rem] border border-ink-300" />
            <Check className="h-7 w-7" strokeWidth={2} />
          </span>
          <h2 className="mt-5 text-xl font-bold tracking-[-0.02em] text-ink-950">Caja cerrada</h2>
          <p className="tnum mt-1 text-xs uppercase tracking-[0.14em] text-ink-400">
            Comprobante {zNum(resultado.numero)} · {caja.nombre}
          </p>

          <div className="mt-6 grid grid-cols-2 gap-2.5 text-left">
            <CeldaZ label="Ventas del turno" valor={money0(resultado.ventasPorMedio ? Object.values(resultado.ventasPorMedio).reduce((a, v) => a + v, 0) : 0)} />
            <div className="rounded-xl border border-line bg-canvas/70 p-3">
              <p className="text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-ink-400">Diferencia</p>
              <div className="mt-1.5"><DiffChip valor={resultado.diferenciaTotal} /></div>
            </div>
            <CeldaZ label="Retirado a bóveda" valor={money0(resultado.retiroFinal)} icono={Landmark} />
            <CeldaZ label="Fondo que queda" valor={money0(resultado.fondoSiguiente)} />
          </div>

          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setVerDetalle(true)}>
              <ScrollText className="h-4 w-4" />
              Ver comprobante
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toast.info('Impresión térmica', 'Se habilita al conectar la impresora (backend).')}
            >
              <Printer className="h-4 w-4" />
              Imprimir
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toast.info('Envío por email', 'Se habilita al conectar el backend.')}
            >
              <Mail className="h-4 w-4" />
              Enviar
            </Button>
          </div>

          <Button className="mt-7 w-full" onClick={onSalir}>
            Volver a Caja
          </Button>
        </Card>

        <CierreDetalleModal open={verDetalle} cierre={resultado} onClose={() => setVerDetalle(false)} />
      </div>
    )
  }

  // --- Asistente ---------------------------------------------------------------

  return (
    <div className="animate-fade-in mx-auto max-w-3xl">
      {/* Encabezado propio del ritual */}
      <div className="ct-rise mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="mb-1.5 flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-ink-400">
            <span aria-hidden className="h-px w-5 rounded-full bg-ink-300" />
            Cierre de caja · {caja.nombre} · turno #{sesion.numero}
          </span>
          <h1 className="text-balance text-2xl font-bold tracking-[-0.02em] text-ink-950">
            {TITULOS[paso].titulo}
          </h1>
          <p className="mt-1 text-sm text-ink-500">{TITULOS[paso].sub}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={handleCancelar} className="shrink-0">
          <X className="h-4 w-4" />
          Cancelar
        </Button>
      </div>

      <Stepper paso={paso} />

      {/* Contenido del paso (la key reinicia la animación de entrada) */}
      <div key={`${paso}-${dir}`} className={dir === 'back' ? 'ct-step-back' : 'ct-step-fwd'}>
        {paso === 1 && (
          <div className="space-y-4">
            <Card className="overflow-hidden">
              <ItemChecklist
                done
                indice={0}
                titulo="Ventas registradas"
                descripcion={
                  resumen.operacionesTotal > 0
                    ? `${operacionesLabel(resumen.operacionesTotal)} · ${money0(resumen.ventasTotal)}`
                    : 'Sin ventas en el turno'
                }
              />
              <ItemChecklist
                done
                indice={1}
                titulo="Movimientos con motivo"
                descripcion={
                  resumen.movimientosManuales > 0
                    ? `${num(resumen.movimientosManuales)} movimientos manuales (ingresos, egresos, retiros)`
                    : 'Sin movimientos manuales'
                }
              />
              {necesitaLote && (
                <ItemChecklist
                  done={loteOk}
                  indice={2}
                  titulo="Cierre de lote de tarjetas"
                  descripcion="Hacé el cierre de lote en la terminal (Payway) y guardá el ticket: contra eso se concilian débito y crédito."
                  accion={
                    <Button size="sm" variant={loteOk ? 'secondary' : 'outline'} onClick={() => setLoteOk((v) => !v)}>
                      {loteOk ? (
                        <>
                          <Check className="h-4 w-4" />
                          Hecho
                        </>
                      ) : (
                        'Marcar hecho'
                      )}
                    </Button>
                  }
                />
              )}
            </Card>

            <Card>
              <p className="border-b border-line px-4 py-3 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-400">
                Ventas por medio de pago
              </p>
              <div className="divide-y divide-line">
                {MEDIOS_PAGO_CAJA.filter((m) => resumen.ventasPorMedio[m.value] > 0).map((m, i) => {
                  const Icon = MEDIO_ICONO[m.value]
                  return (
                    <div key={m.value} className="ct-stagger-fade flex items-center gap-3 px-4 py-3" style={ctStagger(i)}>
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-ink-50 text-ink-500 ring-1 ring-line">
                        <Icon className="h-4 w-4" strokeWidth={1.75} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink-900">{m.label}</p>
                        <p className="tnum text-xs text-ink-400">{operacionesLabel(resumen.operacionesPorMedio[m.value])}</p>
                      </div>
                      <span className="tnum ml-auto text-sm font-semibold text-ink-950">
                        {money(resumen.ventasPorMedio[m.value])}
                      </span>
                    </div>
                  )
                })}
                {resumen.ventasTotal === 0 && (
                  <p className="px-4 py-4 text-sm text-ink-400">No hubo ventas en este turno.</p>
                )}
              </div>
            </Card>
          </div>
        )}

        {paso === 2 && (
          <div className="space-y-4">
            {config.cierreCiego && (
              <div className="flex items-center gap-2.5 rounded-2xl border border-dashed border-line-strong bg-surface px-4 py-3 text-xs leading-relaxed text-ink-500">
                <EyeOff className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
                <span>
                  <b className="font-semibold text-ink-800">Cierre ciego activo:</b> contá el efectivo sin mirar el
                  esperado — se revela en el próximo paso. Así el arqueo refleja lo que hay de verdad.
                </span>
              </div>
            )}

            {/* Efectivo */}
            <Card>
              <div className="flex items-center gap-3 border-b border-line px-4 py-3.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink-950 text-on-ink">
                  <Banknote className="h-4.5 w-4.5" strokeWidth={1.75} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink-950">Efectivo</p>
                  <p className="text-xs text-ink-400">
                    {config.cierreCiego ? (
                      'Grilla de billetes + sueltos'
                    ) : (
                      <>
                        Esperado: <b className="tnum text-ink-600">{money(resumen.esperadoPorMedio.efectivo)}</b>
                      </>
                    )}
                  </p>
                </div>
                <span key={contadoEfectivo} className="ct-count tnum ml-auto text-lg font-bold text-ink-950">
                  {money0(contadoEfectivo)}
                </span>
              </div>
              <div className="px-4 py-3">
                <DenomGrid
                  denominaciones={config.denominaciones}
                  conteo={conteo}
                  sueltos={sueltos}
                  onConteo={setConteo}
                  onSueltos={setSueltos}
                />
              </div>
            </Card>

            {/* Otros medios */}
            <Card>
              <div className="border-b border-line px-4 py-3">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-400">Otros medios</p>
                <p className="mt-0.5 text-xs text-ink-400">
                  Verificá contra el ticket de cierre de lote y los extractos; vienen precargados con lo registrado.
                </p>
              </div>
              <div className="divide-y divide-line">
                {otrosMedios.map((m, i) => {
                  const Icon = MEDIO_ICONO[m.value]
                  return (
                    <div key={m.value} className="ct-stagger-fade flex items-center gap-3 px-4 py-3" style={ctStagger(i)}>
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-ink-50 text-ink-500 ring-1 ring-line">
                        <Icon className="h-4 w-4" strokeWidth={1.75} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink-900">{m.label}</p>
                        <p className="tnum text-xs text-ink-400">
                          Esperado {money(resumen.esperadoPorMedio[m.value])}
                          {MEDIOS_CON_LOTE.includes(m.value) && ' · contra lote'}
                        </p>
                      </div>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step="0.01"
                        value={contadoOtros[m.value] ?? ''}
                        onChange={(e) => setContadoOtros((prev) => ({ ...prev, [m.value]: e.target.value }))}
                        onFocus={(e) => e.target.select()}
                        placeholder="0"
                        aria-label={`Contado de ${m.label}`}
                        className="tnum h-10 w-32 shrink-0 text-right sm:w-36"
                      />
                    </div>
                  )
                })}
              </div>
            </Card>
          </div>
        )}

        {paso === 3 && (
          <div className="space-y-4">
            {/* Esperado vs. contado por medio */}
            <Card className="overflow-hidden">
              <div className="hidden grid-cols-[1.15fr_1fr_1fr_auto] gap-3 border-b border-line px-4 py-2.5 text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-ink-400 sm:grid">
                <span>Medio</span>
                <span className="text-right">Esperado</span>
                <span className="text-right">Contado</span>
                <span className="w-[9.5rem] text-right">Diferencia</span>
              </div>
              <div className="divide-y divide-line">
                {MEDIOS_PAGO_CAJA.filter(
                  (m) => resumen.esperadoPorMedio[m.value] !== 0 || contadoPorMedio[m.value] !== 0,
                ).map((m, i) => (
                  <div
                    key={m.value}
                    className="ct-stagger-fade grid grid-cols-2 gap-x-3 gap-y-1 px-4 py-3 sm:grid-cols-[1.15fr_1fr_1fr_auto] sm:items-center"
                    style={ctStagger(i)}
                  >
                    <p className="col-span-2 text-sm font-medium text-ink-900 sm:col-span-1">{MEDIO_LABEL[m.value]}</p>
                    <p className="tnum text-xs text-ink-500 sm:text-right sm:text-sm">
                      <span className="sm:hidden">Esp. </span>
                      {money(resumen.esperadoPorMedio[m.value])}
                    </p>
                    <p className="tnum text-right text-xs font-semibold text-ink-900 sm:text-sm">
                      <span className="font-normal text-ink-500 sm:hidden">Cont. </span>
                      {money(contadoPorMedio[m.value])}
                    </p>
                    <div className="col-span-2 sm:col-span-1 sm:w-[9.5rem] sm:text-right">
                      <DiffChip valor={diferenciaPorMedio[m.value]} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-line-strong bg-canvas/60 px-4 py-3.5">
                <span className="text-sm font-semibold text-ink-950">Diferencia total</span>
                <DiffChip valor={difTotal} />
              </div>
            </Card>

            {/* Justificación según el tamaño del problema */}
            {difTotal !== 0 && excedeTolerancia && (
              <Card className="space-y-3.5 p-4">
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-ink-950 text-on-ink">
                    <AlertTriangle className="h-4 w-4" strokeWidth={1.75} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-ink-950">
                      La diferencia supera la tolerancia de {money0(config.toleranciaMonto)}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-ink-500">
                      Antes de cerrar, recontá. Si la diferencia es real, dejá motivo y nota: quedan en el comprobante Z.
                    </p>
                  </div>
                </div>
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-ink-500">Motivo</label>
                    <Select
                      options={MOTIVOS_DIFERENCIA_CAJA.map((m) => ({ value: m, label: m }))}
                      value={motivoDif}
                      onChange={setMotivoDif}
                      placeholder="Elegí un motivo"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-ink-500">Nota (obligatoria)</label>
                    <Textarea
                      rows={2}
                      value={notaDif}
                      onChange={(e) => setNotaDif(e.target.value)}
                      placeholder="Ej: se dio vuelto de más en la venta de las 12:40."
                    />
                  </div>
                </div>
              </Card>
            )}

            {difTotal !== 0 && !excedeTolerancia && (
              <button
                type="button"
                onClick={() => setConfirmoDif((v) => !v)}
                aria-pressed={confirmoDif}
                className={cn(
                  'flex w-full items-center gap-3 rounded-2xl border bg-surface px-4 py-3.5 text-left transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900',
                  confirmoDif ? 'border-ink-950' : 'border-line hover:border-line-strong',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'grid h-6 w-6 shrink-0 place-items-center rounded-lg border transition-all duration-150',
                    confirmoDif
                      ? 'border-ink-950 bg-ink-950 text-on-ink'
                      : 'border-line-strong bg-surface text-transparent',
                  )}
                >
                  <Check className="h-4 w-4" strokeWidth={2.5} />
                </span>
                <span className="text-sm leading-relaxed text-ink-800">
                  Confirmo la diferencia{' '}
                  <span className="text-ink-500">
                    (dentro de la tolerancia{config.toleranciaActiva ? ` de ${money0(config.toleranciaMonto)}` : ''}) —
                    queda registrada en el Z.
                  </span>
                </span>
              </button>
            )}

            {/* Fondo del próximo turno (patrón Shopify) */}
            <Card className="p-4">
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-400">
                Fondo para el próximo turno
              </p>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="sm:w-48">
                  <label className="mb-1.5 block text-xs font-medium text-ink-500">Dejar en caja</label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step="0.01"
                    value={fondoSiguiente}
                    onChange={(e) => setFondoSiguiente(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    className="tnum"
                  />
                </div>
                <div className="flex-1 pb-1 text-sm leading-relaxed text-ink-500">
                  {fondoExcede ? (
                    <span className="flex items-start gap-1.5 text-ink-700">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" aria-hidden />
                      El fondo supera el efectivo contado: queda todo en caja ({money(contadoEfectivo)}) y no se retira nada.
                    </span>
                  ) : (
                    <>
                      Retirás para bóveda / depósito:{' '}
                      <b key={retiroFinal} className="ct-count tnum text-base text-ink-950">{money(retiroFinal)}</b>
                    </>
                  )}
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* Navegación */}
      <div className="mt-6 flex items-center justify-between gap-3">
        <Button variant="outline" onClick={() => irA((paso - 1) as 1 | 2)} className={cn(paso === 1 && 'invisible')}>
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Button>
        {paso < 3 ? (
          <Button
            onClick={() => irA((paso + 1) as 2 | 3)}
            disabled={!puedeContinuar}
            title={!puedeContinuar ? 'Marcá el cierre de lote para continuar' : undefined}
          >
            {paso === 1 ? 'Empezar el arqueo' : 'Ver diferencia'}
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={handleCerrar} disabled={!puedeCerrar}>
            <Lock className="h-4 w-4" />
            {guardando ? 'Cerrando…' : 'Cerrar caja y emitir Z'}
          </Button>
        )}
      </div>
    </div>
  )
}

// ===== Piezas =====

function Stepper({ paso }: { paso: 1 | 2 | 3 }) {
  const pasos = ['Revisar', 'Contar', 'Confirmar']
  return (
    <ol className="ct-rise mb-6 flex items-center gap-2.5" aria-label="Pasos del cierre">
      {pasos.map((nombre, i) => {
        const n = i + 1
        const actual = paso === n
        const hecho = paso > n
        return (
          <Fragment key={nombre}>
            <li className="flex items-center gap-2">
              <span
                className={cn(
                  'grid h-7 w-7 place-items-center rounded-full border text-xs font-bold transition-all duration-300',
                  hecho && 'border-ink-300 bg-ink-100 text-ink-700',
                  actual && 'border-ink-950 bg-ink-950 text-on-ink shadow-[0_8px_18px_rgba(10,10,11,0.22)]',
                  !hecho && !actual && 'border-line-strong bg-surface text-ink-400',
                )}
                aria-current={actual ? 'step' : undefined}
              >
                {hecho ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : n}
              </span>
              <span
                className={cn(
                  'text-xs font-semibold',
                  actual ? 'text-ink-950' : 'hidden text-ink-400 sm:inline',
                )}
              >
                {nombre}
              </span>
            </li>
            {n < 3 && (
              <li aria-hidden className="relative h-px flex-1 overflow-hidden rounded-full bg-line-strong">
                <span
                  className={cn(
                    'absolute inset-0 origin-left bg-ink-950 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
                    hecho ? 'scale-x-100' : 'scale-x-0',
                  )}
                />
              </li>
            )}
          </Fragment>
        )
      })}
    </ol>
  )
}

function ItemChecklist({
  done,
  indice,
  titulo,
  descripcion,
  accion,
}: {
  done: boolean
  indice: number
  titulo: string
  descripcion: string
  accion?: ReactNode
}) {
  return (
    <div
      className="ct-stagger-fade flex items-center gap-3 border-b border-line px-4 py-3.5 last:border-b-0"
      style={ctStagger(indice)}
    >
      <span
        className={cn(
          'grid h-7 w-7 shrink-0 place-items-center rounded-full transition-all duration-200',
          done ? 'bg-ink-950 text-on-ink' : 'border-[1.5px] border-dashed border-line-strong text-transparent',
        )}
        aria-hidden
      >
        <Check className="h-4 w-4" strokeWidth={2.5} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink-900">{titulo}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{descripcion}</p>
      </div>
      {accion}
    </div>
  )
}

function CeldaZ({ label, valor, icono: Icon }: { label: string; valor: string; icono?: typeof Landmark }) {
  return (
    <div className="rounded-xl border border-line bg-canvas/70 p-3">
      <p className="flex items-center gap-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-ink-400">
        {Icon && <Icon className="h-3 w-3" aria-hidden />}
        {label}
      </p>
      <p className="tnum mt-1.5 text-base font-bold text-ink-950">{valor}</p>
    </div>
  )
}
