import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, Check, Equal, Landmark, Mail, Printer, Receipt, ScrollText, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { CajaRegistradora, CierreCaja } from '@/types'
import { plata } from '@/lib/format'
import { ctStagger } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useToast } from '@/components/ToastProvider'
import { nombreCaja } from '@/components/caja/medios'

const zNum = (n: number) => `Z-${String(n).padStart(4, '0')}`

/**
 * El final del cierre: la caja quedó cerrada, y se dice con claridad qué hacer
 * ahora con la plata (qué se guarda, qué queda en el cajón). Los números son
 * los del comprobante que devolvió el servidor, no los de la pantalla.
 */
export function CierreListo({
  cierre,
  caja,
  conLote,
  onVerComprobante,
  onSalir,
}: {
  cierre: CierreCaja
  caja: CajaRegistradora
  /** Se hizo el cierre de lote del posnet (hay un ticket para guardar). */
  conLote: boolean
  onVerComprobante: () => void
  onSalir: () => void
}) {
  const toast = useToast()
  const ventas = Object.values(cierre.ventasPorMedio).reduce((a, v) => a + v, 0)

  const pendientes: Array<{ icono: LucideIcon; texto: ReactNode }> = []
  if (cierre.retiroFinal > 0) {
    pendientes.push({
      icono: Landmark,
      texto: (
        <>
          Guardá <b className="tnum text-ink-950">{plata(cierre.retiroFinal)}</b> en la caja fuerte o para llevar al banco.
        </>
      ),
    })
  }
  if (cierre.fondoSiguiente > 0) {
    pendientes.push({
      icono: Wallet,
      texto: (
        <>
          Dejá <b className="tnum text-ink-950">{plata(cierre.fondoSiguiente)}</b> en el cajón para dar vuelto mañana.
        </>
      ),
    })
  }
  if (conLote) {
    pendientes.push({
      icono: Receipt,
      texto: <>Guardá el ticket del cierre de lote del posnet junto con este comprobante.</>,
    })
  }

  return (
    <div className="animate-fade-in mx-auto max-w-xl">
      <Card className="px-5 py-9 text-center sm:px-10">
        <span className="relative mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-emerald-600/10 text-emerald-700 ring-1 ring-emerald-600/25 dark:text-emerald-400">
          <span aria-hidden className="ct-modal-halo absolute -inset-2 rounded-[1.4rem] border border-emerald-600/30" />
          <Check className="h-8 w-8" strokeWidth={2.25} />
        </span>
        <h2 className="mt-5 text-2xl font-bold tracking-[-0.02em] text-ink-950">¡Listo, caja cerrada!</h2>
        <p className="tnum mt-1 text-xs uppercase tracking-[0.14em] text-ink-400">
          Comprobante {zNum(cierre.numero)} · {nombreCaja(caja)}
        </p>

        {pendientes.length > 0 && (
          <div className="mt-6 text-left">
            <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-400">
              Ahora hacé esto
            </p>
            <ol className="space-y-2">
              {pendientes.map((p, i) => {
                const Icono = p.icono
                return (
                  <li
                    key={i}
                    style={ctStagger(i + 1)}
                    className="ct-stagger-item flex items-start gap-3 rounded-2xl border border-line bg-canvas/60 px-3.5 py-3"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink-950 text-xs font-bold text-on-ink">
                      {i + 1}
                    </span>
                    <span className="flex min-w-0 flex-1 items-start gap-2 pt-1 text-sm leading-relaxed text-ink-700">
                      <Icono className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" aria-hidden />
                      <span>{p.texto}</span>
                    </span>
                  </li>
                )
              })}
            </ol>
          </div>
        )}

        <div className="mt-6 grid grid-cols-2 gap-2.5 text-left">
          <Celda etiqueta="Ventas del turno" valor={plata(ventas)} />
          <div className="rounded-xl border border-line bg-canvas/70 p-3">
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-ink-400">
              {cierre.diferenciaTotal === 0 ? 'Resultado' : cierre.diferenciaTotal < 0 ? 'Faltó' : 'Sobró'}
            </p>
            <p className="mt-1.5 flex items-center gap-1.5 text-base font-bold text-ink-950">
              {cierre.diferenciaTotal === 0 ? (
                <Equal className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
              ) : cierre.diferenciaTotal < 0 ? (
                <ArrowDown className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
              ) : (
                <ArrowUp className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
              )}
              <span className="tnum min-w-0 truncate">
                {cierre.diferenciaTotal === 0 ? 'Cuadra' : plata(Math.abs(cierre.diferenciaTotal))}
              </span>
            </p>
          </div>
          <Celda etiqueta="Queda para mañana" valor={plata(cierre.fondoSiguiente)} />
          <Celda etiqueta="Se guarda aparte" valor={plata(cierre.retiroFinal)} />
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button variant="outline" size="sm" onClick={onVerComprobante}>
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

        <Button className="mt-7 w-full" size="lg" onClick={onSalir}>
          Volver a Caja
        </Button>
      </Card>
    </div>
  )
}

function Celda({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="rounded-xl border border-line bg-canvas/70 p-3">
      <p className="text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-ink-400">{etiqueta}</p>
      <p className="tnum mt-1.5 text-base font-bold text-ink-950">{valor}</p>
    </div>
  )
}
