import { useMemo } from 'react'
import { ArrowUpFromLine, Check, FlaskConical, Lock, LockOpen, PartyPopper, Receipt, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { CierreCaja, MovimientoCaja, SesionCaja, TipoMovimientoCaja } from '@/types'
import { cn, ctStagger } from '@/lib/utils'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

/**
 * Guía del modo práctica (patrón "test mode" de Stripe + setup guide de
 * Square/Shopify): un sandbox con identidad ÁMBAR imposible de confundir con
 * la caja real, y una checklist de 4 pasos que se tilda sola a medida que el
 * usuario ensaya. Nada de lo que pase acá se guarda.
 */

interface Paso {
  id: 'abrir' | 'venta' | 'movimiento' | 'cerrar'
  titulo: string
  descripcion: string
  icono: LucideIcon
  hecho: boolean
  accion?: string
  habilitado: boolean
}

function hizo(tipos: TipoMovimientoCaja[], movimientos: MovimientoCaja[], cierres: CierreCaja[]): boolean {
  return (
    movimientos.some((m) => tipos.includes(m.tipo)) ||
    cierres.some((c) => c.movimientos.some((m) => tipos.includes(m.tipo)))
  )
}

export function GuiaPractica({
  sesion,
  movimientos,
  cierres,
  onAbrir,
  onVenta,
  onMovimiento,
  onCerrar,
  onSalir,
}: {
  sesion: SesionCaja | null
  movimientos: MovimientoCaja[]
  cierres: CierreCaja[]
  onAbrir: () => void
  onVenta: () => void
  onMovimiento: () => void
  onCerrar: () => void
  onSalir: () => void
}) {
  const pasos = useMemo<Paso[]>(() => {
    const abierta = sesion !== null
    const cerro = cierres.length > 0
    return [
      {
        id: 'abrir',
        titulo: 'Abrí la caja',
        descripcion: 'Declará el fondo inicial: es el efectivo que queda en el cajón para dar vuelto.',
        icono: LockOpen,
        hecho: abierta || cerro,
        accion: 'Abrir caja',
        habilitado: !abierta,
      },
      {
        id: 'venta',
        titulo: 'Registrá una venta',
        descripcion: 'Elegí el medio de pago y mirá cómo sube el «efectivo esperado» si es en efectivo.',
        icono: Receipt,
        hecho: hizo(['venta'], movimientos, cierres),
        accion: 'Venta de práctica',
        habilitado: abierta,
      },
      {
        id: 'movimiento',
        titulo: 'Sacá plata con motivo',
        descripcion: 'Cargá un egreso (un gasto) o un retiro a bóveda: el esperado baja al instante.',
        icono: ArrowUpFromLine,
        hecho: hizo(['ingreso', 'egreso', 'retiro'], movimientos, cierres),
        accion: 'Nuevo movimiento',
        habilitado: abierta,
      },
      {
        id: 'cerrar',
        titulo: 'Cerrá y emití tu primer Z',
        descripcion: 'Contá los billetes con la grilla, definí cuánto queda de fondo y mirá el comprobante.',
        icono: Lock,
        hecho: cierres.length > 0,
        accion: 'Cerrar caja',
        habilitado: abierta,
      },
    ]
  }, [sesion, movimientos, cierres])

  const hechos = pasos.filter((p) => p.hecho).length
  const completa = hechos === pasos.length
  const siguienteId = pasos.find((p) => !p.hecho)?.id
  const acciones: Record<Paso['id'], () => void> = {
    abrir: onAbrir,
    venta: onVenta,
    movimiento: onMovimiento,
    cerrar: onCerrar,
  }

  return (
    <Card className="ct-rise mb-5 overflow-hidden border-amber-500/40">
      {/* La franja rayada: la marca visual del sandbox (homenaje al test mode de Stripe). */}
      <div
        aria-hidden
        className="h-1.5 w-full bg-[repeating-linear-gradient(-45deg,rgba(245,158,11,0.55)_0_10px,transparent_10px_20px)]"
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-line p-4 sm:px-5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-500/10 text-amber-700 ring-1 ring-amber-500/30 dark:text-amber-400">
          <FlaskConical className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-900">
            Modo práctica
            <span className="ml-2 align-middle text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-amber-700 dark:text-amber-400">
              nada se guarda
            </span>
          </p>
          <p className="text-xs text-ink-400">
            Ensayá el ciclo completo sin miedo: esta caja es de mentira y desaparece al salir.
          </p>
        </div>
        <div className="flex w-full items-center gap-3 sm:w-auto">
          <div className="flex-1 sm:w-36 sm:flex-none">
            <div className="mb-1 flex items-baseline justify-between text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-ink-400">
              <span>Guía</span>
              <span className="tnum">{hechos} / {pasos.length}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-ink-100">
              <div
                className="h-full rounded-full bg-amber-500 transition-[width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
                style={{ width: `${(hechos / pasos.length) * 100}%` }}
              />
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onSalir} className="shrink-0">
            <X className="h-4 w-4" />
            Salir
          </Button>
        </div>
      </div>

      {completa ? (
        <div className="animate-fade-in flex flex-col items-center gap-3 px-5 py-8 text-center">
          <span className="relative grid h-14 w-14 place-items-center rounded-3xl bg-amber-500/10 text-amber-700 ring-1 ring-amber-500/30 dark:text-amber-400">
            <span aria-hidden className="ct-modal-halo absolute -inset-2 rounded-[1.4rem] border border-amber-500/40" />
            <PartyPopper className="h-6 w-6" strokeWidth={1.75} />
          </span>
          <div>
            <p className="text-base font-bold tracking-[-0.02em] text-ink-950">¡Guía completa!</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">
              Ya hiciste el ciclo entero: abrir, vender, mover plata y cerrar con arqueo. Podés seguir
              practicando o salir y operar la caja de verdad.
            </p>
          </div>
          <Button onClick={onSalir} className="mt-1">
            Salir y usar la caja real
          </Button>
        </div>
      ) : (
        <div className="divide-y divide-line">
          {pasos.map((paso, i) => {
            const esSiguiente = paso.id === siguienteId
            const Icon = paso.icono
            return (
              <div
                key={paso.id}
                className="ct-stagger-fade flex flex-col gap-2.5 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-3 sm:px-5"
                style={ctStagger(i)}
              >
                <span
                  aria-hidden
                  className={cn(
                    'grid h-8 w-8 shrink-0 place-items-center rounded-full transition-all duration-200',
                    paso.hecho
                      ? 'bg-amber-500 text-white'
                      : 'border-[1.5px] border-dashed border-line-strong text-ink-300',
                  )}
                >
                  {paso.hecho ? <Check className="h-4 w-4" strokeWidth={2.5} /> : <Icon className="h-4 w-4" strokeWidth={1.75} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn('text-sm font-medium', paso.hecho ? 'text-ink-400 line-through decoration-ink-300' : 'text-ink-900')}>
                    {i + 1}. {paso.titulo}
                  </p>
                  {!paso.hecho && (
                    <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{paso.descripcion}</p>
                  )}
                </div>
                {!paso.hecho && paso.accion && (
                  <Button
                    size="sm"
                    variant={esSiguiente ? 'primary' : 'outline'}
                    disabled={!paso.habilitado}
                    onClick={acciones[paso.id]}
                    title={!paso.habilitado ? 'Primero abrí la caja' : undefined}
                    className={cn(
                      'w-full shrink-0 sm:w-auto',
                      esSiguiente &&
                        'bg-amber-600 text-white hover:bg-amber-700 active:bg-amber-700 focus-visible:ring-amber-600',
                    )}
                  >
                    {paso.accion}
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
