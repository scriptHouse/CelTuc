import { AlertTriangle, ArrowRight, Check, Undo2, Wallet } from 'lucide-react'
import type { CanalCaja, FacturacionVenta, MedioPagoCaja } from '@/types'
import { cn, ctStagger } from '@/lib/utils'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { CIRCUITO_LABEL, FACTURACION_LABEL, MEDIO_ICONO, MEDIO_LABEL } from '@/components/caja/medios'

/**
 * Cartel de alerta al salirse del circuito de la caja. No bloquea: muestra lo
 * que indica la caja, lo que se eligió y a qué caja termina yendo esa plata;
 * hay que aceptar a propósito y queda registrado quién lo hizo.
 *
 * Es el `Modal` de siempre, que en el celular sube como hoja a todo el ancho y
 * en escritorio queda centrado. Sin cierre por Escape ni por el fondo: la
 * salida es por uno de los dos botones.
 */

/** Una parte del cobro que no sigue lo que indica la caja. */
export interface DesvioCircuito {
  medio: MedioPagoCaja
  facturacion: FacturacionVenta
  /** Lo que indica el circuito para ese medio (null: ese medio no es del circuito). */
  sugerido: FacturacionVenta | null
  /** Caja que recibe esa plata, si NO es la caja donde se está parado. */
  cajaDestino?: string | null
}

export function AlertaCircuitoModal({
  open,
  canal,
  desvios,
  usuario,
  onVolver,
  onAceptar,
}: {
  open: boolean
  canal: Exclude<CanalCaja, ''>
  desvios: DesvioCircuito[]
  /** Quién va a quedar registrado como responsable del cambio. */
  usuario: string
  onVolver: () => void
  onAceptar: () => void
}) {
  const varias = desvios.length > 1

  return (
    <Modal
      open={open}
      onClose={onVolver}
      size="lg"
      dismissable={false}
      labelledBy="alerta-circuito-titulo"
    >
      <div className="px-5 pb-5 pt-7 sm:px-7 sm:pb-6">
        {/* Encabezado: ícono grande y de qué circuito se está saliendo */}
        <div className="flex flex-col items-center text-center">
          <span className="relative grid h-16 w-16 place-items-center rounded-3xl bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/30 dark:text-amber-400">
            <span
              aria-hidden
              className="ct-modal-halo absolute -inset-2 rounded-[1.4rem] border border-amber-500/30"
            />
            <AlertTriangle className="h-8 w-8" strokeWidth={1.75} />
          </span>
          <h2
            id="alerta-circuito-titulo"
            className="mt-4 text-balance text-xl font-bold tracking-[-0.02em] text-ink-950 sm:text-2xl"
          >
            Te estás saliendo del circuito de {CIRCUITO_LABEL[canal]}
          </h2>
          <p className="mt-1.5 text-pretty text-sm leading-relaxed text-ink-500">
            {varias
              ? 'Estas partes del cobro no siguen lo que indica esta caja.'
              : 'Esto no es lo que indica la caja en la que estás parado.'}{' '}
            Podés hacerlo igual, pero queda registrado.
          </p>
        </div>

        {/* Lo indicado contra lo elegido, parte por parte */}
        <div className="mt-6 space-y-2.5">
          {desvios.map((d, i) => {
            const Icono = MEDIO_ICONO[d.medio]
            return (
              <div
                key={`${d.medio}-${d.facturacion}-${i}`}
                className="ct-stagger-item rounded-2xl border border-line bg-canvas/50 p-3.5"
                style={ctStagger(i)}
              >
                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3">
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink-900">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink-50 text-ink-500 ring-1 ring-line">
                      <Icono className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                    </span>
                    {MEDIO_LABEL[d.medio]}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1.5">
                    <Etiqueta tono="sugerido">
                      {d.sugerido
                        ? `Indicado: ${FACTURACION_LABEL[d.sugerido]}`
                        : `${MEDIO_LABEL[d.medio]} no es de este circuito`}
                    </Etiqueta>
                    <ArrowRight className="hidden h-3.5 w-3.5 shrink-0 text-ink-300 sm:block" aria-hidden />
                    <Etiqueta tono="elegido">
                      Elegiste: {FACTURACION_LABEL[d.facturacion]}
                    </Etiqueta>
                  </div>
                </div>
                {d.cajaDestino && (
                  <p className="mt-2.5 flex items-start gap-1.5 border-t border-line pt-2.5 text-xs leading-relaxed text-ink-500">
                    <Wallet className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span>
                      Esa plata entra al arqueo de <b className="text-ink-900">«{d.cajaDestino}»</b>,
                      no a la caja en la que estás.
                    </span>
                  </p>
                )}
              </div>
            )
          })}
        </div>

        {/* Quién queda registrado */}
        <p className="mt-4 flex items-start gap-2 rounded-2xl bg-amber-500/10 px-3.5 py-3 text-sm leading-relaxed text-amber-900 ring-1 ring-amber-500/25 dark:text-amber-200">
          <Check className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.5} aria-hidden />
          <span>
            Si aceptás, queda guardado en la venta que <b>{usuario}</b> aceptó salirse del
            circuito, con la fecha y lo que se cobró.
          </span>
        </p>

        <div className="mt-5 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onVolver} className="sm:min-w-44">
            <Undo2 className="h-4 w-4" />
            Volver a lo indicado
          </Button>
          <Button onClick={onAceptar} className="sm:min-w-52">
            <AlertTriangle className="h-4 w-4" />
            Aceptar y continuar
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function Etiqueta({ tono, children }: { tono: 'sugerido' | 'elegido'; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center rounded-full px-2.5 py-1 text-xs font-medium',
        tono === 'sugerido'
          ? 'bg-ink-100 text-ink-600'
          : 'bg-amber-500/15 font-semibold text-amber-800 ring-1 ring-amber-500/30 dark:text-amber-300',
      )}
    >
      {children}
    </span>
  )
}
