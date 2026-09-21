import { useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Banknote,
  ChevronDown,
  CircleCheck,
  MessageSquareText,
  RotateCcw,
} from 'lucide-react'
import type { CajaConfig, MedioPagoCaja, SesionCaja } from '@/types'
import { MOTIVOS_DIFERENCIA_CAJA } from '@/types'
import { plata } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { ResumenSesion } from '@/services/caja'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Textarea } from '@/components/ui/Textarea'
import { DiffChip } from '@/components/caja/DiffChip'
import { MEDIO_ICONO, MEDIO_LABEL } from '@/components/caja/medios'
import { ventasLabel } from '@/components/caja/cierre/pasos'
import type { OtroMedio } from '@/components/caja/cierre/pasos'
import { BotonOpcion, IconoCaja, Renglon, Tildable } from '@/components/caja/cierre/piezas'

/**
 * Paso «¿Cuadra?»: el momento de la verdad, contado como para un chico.
 * Primero la respuesta grande (cuadra / falta / sobra), después las dos
 * barras que se comparan y la cuenta de «lo que tendría que haber» explicada
 * renglón por renglón. Si no cuadra, lo primero que se ofrece es volver a
 * contar; recién después, explicar qué pasó.
 */
export function PasoResultado({
  config,
  sesion,
  resumen,
  otros,
  controlados,
  contadoPorMedio,
  diferenciaPorMedio,
  difTotal,
  requiereMotivo,
  motivo,
  onMotivo,
  nota,
  onNota,
  vista,
  onVista,
  onRecontar,
  onRevisarOtros,
}: {
  config: CajaConfig
  sesion: SesionCaja
  resumen: ResumenSesion
  /** Transferencias y tarjetas que se muestran (revisadas o con algo contado). */
  otros: OtroMedio[]
  /** false = no se revisan: se toma lo que anotó el sistema. */
  controlados: boolean
  contadoPorMedio: Record<MedioPagoCaja, number>
  diferenciaPorMedio: Record<MedioPagoCaja, number>
  difTotal: number
  requiereMotivo: boolean
  motivo: string
  onMotivo: (motivo: string) => void
  nota: string
  onNota: (nota: string) => void
  /** Ya tocó «Vi la diferencia» (cuando no hace falta explicarla). */
  vista: boolean
  onVista: () => void
  onRecontar: () => void
  /** Volver a «Otros cobros» (si ese paso existe). */
  onRevisarOtros?: () => void
}) {
  const [verCuenta, setVerCuenta] = useState(false)
  const [contarQuePaso, setContarQuePaso] = useState(Boolean(motivo || nota))

  const difEfectivo = diferenciaPorMedio.efectivo
  const difOtros = otros.some((m) => diferenciaPorMedio[m] !== 0)
  const hayDiferenciaParcial = difEfectivo !== 0 || difOtros
  const estado = difTotal === 0 ? 'cuadra' : difTotal < 0 ? 'falta' : 'sobra'

  const contado = contadoPorMedio.efectivo
  const esperado = resumen.esperadoPorMedio.efectivo
  const tope = Math.max(contado, esperado, 1)

  const huboTarjetaOTransferencia = (Object.keys(resumen.ventasPorMedio) as MedioPagoCaja[]).some(
    (m) => m !== 'efectivo' && resumen.ventasPorMedio[m] > 0,
  )

  return (
    <div className="space-y-4">
      {/* ===== La respuesta ===== */}
      <Card className="ct-rise overflow-hidden">
        <div
          className={cn(
            'flex flex-col items-center px-5 py-7 text-center sm:py-8',
            estado === 'cuadra' ? 'bg-emerald-600/[0.06]' : 'bg-amber-500/[0.07]',
          )}
        >
          <span
            className={cn(
              'relative grid h-16 w-16 place-items-center rounded-3xl ring-1',
              estado === 'cuadra'
                ? 'bg-emerald-600/10 text-emerald-700 ring-emerald-600/25 dark:text-emerald-400'
                : 'bg-amber-500/10 text-amber-700 ring-amber-500/30 dark:text-amber-400',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'ct-modal-halo absolute -inset-2 rounded-[1.4rem] border',
                estado === 'cuadra' ? 'border-emerald-600/30' : 'border-amber-500/30',
              )}
            />
            {estado === 'cuadra' ? (
              <CircleCheck className="h-8 w-8" strokeWidth={1.75} />
            ) : estado === 'falta' ? (
              <ArrowDown className="h-8 w-8" strokeWidth={1.75} />
            ) : (
              <ArrowUp className="h-8 w-8" strokeWidth={1.75} />
            )}
          </span>
          <h2 className="mt-4 text-balance text-2xl font-bold tracking-[-0.02em] text-ink-950 sm:text-3xl">
            {estado === 'cuadra'
              ? hayDiferenciaParcial
                ? 'Cuadra en total'
                : '¡Sí, cuadra!'
              : estado === 'falta'
                ? 'Falta plata'
                : 'Sobra plata'}
          </h2>
          {estado !== 'cuadra' && (
            <p key={difTotal} className="ct-count tnum mt-1 text-3xl font-extrabold tracking-tight text-ink-950 sm:text-4xl">
              {plata(Math.abs(difTotal))}
            </p>
          )}
          <p className="mt-2 max-w-md text-pretty text-sm leading-relaxed text-ink-600">
            {estado === 'cuadra'
              ? hayDiferenciaParcial
                ? 'La suma da justo, pero hay diferencias entre medios de pago: por ejemplo, un cobro anotado en efectivo que en realidad fue por transferencia.'
                : 'Contaste exactamente lo que tenía que haber. ¡Muy bien!'
              : estado === 'falta'
                ? 'Contaste menos plata de la que tendría que haber.'
                : 'Contaste más plata de la que tendría que haber.'}
          </p>
        </div>
      </Card>

      {/* ===== Efectivo: las dos barras y la cuenta ===== */}
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink-950">
            <Banknote className="h-4 w-4 text-ink-400" aria-hidden />
            Efectivo
          </p>
          <DiffChip valor={difEfectivo} />
        </div>

        <div className="mt-4 space-y-3.5">
          <BarraComparada etiqueta="Lo que contaste" valor={contado} proporcion={contado / tope} fuerte />
          <BarraComparada etiqueta="Lo que tendría que haber" valor={esperado} proporcion={esperado / tope} />
        </div>

        <button
          type="button"
          onClick={() => setVerCuenta((v) => !v)}
          aria-expanded={verCuenta}
          className="mt-4 flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-ink-700 ring-1 ring-line transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
        >
          ¿De dónde sale «lo que tendría que haber»?
          <ChevronDown
            aria-hidden
            className={cn('h-4 w-4 shrink-0 text-ink-400 transition-transform duration-200', verCuenta && 'rotate-180')}
          />
        </button>
        {verCuenta && (
          <div className="animate-fade-in mt-2 rounded-xl bg-canvas px-3.5 py-2.5 ring-1 ring-line">
            <Renglon l="Plata con la que se abrió la caja" r={plata(sesion.fondoInicial)} />
            <Renglon
              l={
                <>
                  + Ventas cobradas en efectivo{' '}
                  <span className="text-ink-400">({ventasLabel(resumen.operacionesPorMedio.efectivo)})</span>
                </>
              }
              r={plata(resumen.ventasPorMedio.efectivo)}
            />
            {resumen.ingresos > 0 && <Renglon l="+ Plata que se agregó (ingresos)" r={plata(resumen.ingresos)} />}
            {resumen.egresos > 0 && <Renglon l="− Gastos pagados con plata de la caja" r={plata(resumen.egresos)} />}
            {resumen.retiros > 0 && <Renglon l="− Plata que se sacó para guardar (retiros)" r={plata(resumen.retiros)} />}
            <div className="mt-1 border-t border-dashed border-line-strong pt-1">
              <Renglon l={<b className="font-semibold text-ink-900">= Tendría que haber</b>} r={plata(esperado)} fuerte />
            </div>
          </div>
        )}
      </Card>

      {/* ===== Transferencias y tarjetas ===== */}
      {controlados && otros.length > 0 && (
        <Card className="overflow-hidden">
          <p className="border-b border-line px-4 py-3 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-400">
            Transferencias y tarjetas
          </p>
          <div className="divide-y divide-line">
            {otros.map((m) => {
              const Icono = MEDIO_ICONO[m]
              return (
                <div key={m} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
                  <IconoCaja icono={Icono} className="h-9 w-9" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink-900">{MEDIO_LABEL[m]}</p>
                    <p className="text-xs text-ink-400">
                      {diferenciaPorMedio[m] === 0 ? (
                        <>El sistema anotó <span className="tnum">{plata(resumen.esperadoPorMedio[m])}</span></>
                      ) : (
                        <>
                          Anotado <span className="tnum">{plata(resumen.esperadoPorMedio[m])}</span>, viste{' '}
                          <span className="tnum">{plata(contadoPorMedio[m])}</span>
                        </>
                      )}
                    </p>
                  </div>
                  <DiffChip valor={diferenciaPorMedio[m]} etiquetaCero="Es igual" />
                </div>
              )
            })}
          </div>
        </Card>
      )}
      {!controlados && huboTarjetaOTransferencia && (
        <p className="rounded-2xl border border-dashed border-line-strong px-4 py-3 text-sm leading-relaxed text-ink-500">
          Las transferencias y tarjetas no se revisan al cerrar (así está configurado): se toma lo que anotó el sistema.
        </p>
      )}

      {/* ===== Si no cuadra: primero, volver a contar ===== */}
      {hayDiferenciaParcial && (
        <Card className="flex flex-col gap-3.5 p-4 sm:flex-row sm:items-center sm:p-5">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <IconoCaja icono={RotateCcw} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink-950">¿Volvés a contar?</p>
              <p className="mt-0.5 text-pretty text-sm leading-relaxed text-ink-500">
                Casi siempre es un billete que se pasó. Lo que ya contaste queda guardado.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:shrink-0">
            {difEfectivo !== 0 && (
              <Button variant="outline" onClick={onRecontar}>
                <RotateCcw className="h-4 w-4" />
                Contar el efectivo otra vez
              </Button>
            )}
            {difOtros && onRevisarOtros && (
              <Button variant="outline" onClick={onRevisarOtros}>
                <RotateCcw className="h-4 w-4" />
                Revisar transferencias y tarjetas
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* ===== Explicar la diferencia ===== */}
      {difTotal !== 0 &&
        (requiereMotivo ? (
          <Card className="space-y-4 border-ink-950 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <IconoCaja icono={MessageSquareText} oscuro />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink-950">Contá qué pasó</p>
                <p className="mt-0.5 text-pretty text-sm leading-relaxed text-ink-500">
                  {config.toleranciaMonto > 0
                    ? `La diferencia es de más de ${plata(config.toleranciaMonto)}, así que hay que explicarla.`
                    : 'Cualquier diferencia hay que explicarla.'}{' '}
                  Queda guardado en el comprobante del cierre.
                </p>
              </div>
            </div>
            <MotivoYNota motivo={motivo} onMotivo={onMotivo} nota={nota} onNota={onNota} obligatoria />
          </Card>
        ) : (
          <div className="space-y-2.5">
            <Tildable
              hecho={vista}
              onToggle={onVista}
              titulo="Vi la diferencia y quiero seguir"
              detalle={
                config.toleranciaActiva
                  ? `Está dentro de lo permitido (hasta ${plata(config.toleranciaMonto)}). Queda anotada en el comprobante.`
                  : 'Queda anotada en el comprobante del cierre.'
              }
            />
            <div className="overflow-hidden rounded-2xl border border-line bg-surface">
              <button
                type="button"
                onClick={() => setContarQuePaso((v) => !v)}
                aria-expanded={contarQuePaso}
                className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink-900"
              >
                <span>
                  ¿Sabés qué pasó? <span className="font-normal text-ink-400">Contalo (no es obligatorio)</span>
                </span>
                <ChevronDown
                  aria-hidden
                  className={cn('h-4 w-4 shrink-0 text-ink-400 transition-transform duration-200', contarQuePaso && 'rotate-180')}
                />
              </button>
              {contarQuePaso && (
                <div className="animate-fade-in space-y-4 border-t border-line p-4">
                  <MotivoYNota motivo={motivo} onMotivo={onMotivo} nota={nota} onNota={onNota} />
                </div>
              )}
            </div>
          </div>
        ))}
    </div>
  )
}

// ===== Piezas =====

/** Una barra horizontal con su monto (las dos se comparan a simple vista). */
function BarraComparada({
  etiqueta,
  valor,
  proporcion,
  fuerte,
}: {
  etiqueta: string
  valor: number
  proporcion: number
  fuerte?: boolean
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-sm text-ink-600">{etiqueta}</span>
        <span className={cn('tnum text-base', fuerte ? 'font-bold text-ink-950' : 'font-semibold text-ink-700')}>
          {plata(valor)}
        </span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-ink-100">
        <div
          className={cn('ct-grow-x h-full rounded-full', fuerte ? 'bg-ink-950' : 'bg-ink-400')}
          style={{ width: `${Math.max(0, Math.min(1, proporcion)) * 100}%` }}
        />
      </div>
    </div>
  )
}

/** Los motivos como botones grandes + la explicación con palabras propias. */
function MotivoYNota({
  motivo,
  onMotivo,
  nota,
  onNota,
  obligatoria,
}: {
  motivo: string
  onMotivo: (motivo: string) => void
  nota: string
  onNota: (nota: string) => void
  obligatoria?: boolean
}) {
  return (
    <>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink-700">
          ¿Qué pasó?{obligatoria && <span className="text-ink-400"> (elegí uno)</span>}
        </legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {MOTIVOS_DIFERENCIA_CAJA.map((m) => (
            <BotonOpcion
              key={m}
              activo={motivo === m}
              onClick={() => onMotivo(motivo === m ? '' : m)}
              titulo={m}
              className="px-3 py-2.5"
            />
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="cierre-nota" className="mb-1.5 block text-sm font-medium text-ink-700">
          Contalo con tus palabras{obligatoria && <span className="text-ink-400"> (obligatorio)</span>}
        </label>
        <Textarea
          id="cierre-nota"
          rows={3}
          maxLength={500}
          value={nota}
          onChange={(e) => onNota(e.target.value)}
          placeholder="Ej: a las 12:40 le di $ 1.000 de más de vuelto a un cliente."
        />
      </div>
    </>
  )
}
