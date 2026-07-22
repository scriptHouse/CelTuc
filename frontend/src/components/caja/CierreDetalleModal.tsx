import type { ReactNode } from 'react'
import { Mail, Printer } from 'lucide-react'
import type { CierreCaja, FacturacionVenta, MedioPagoCaja } from '@/types'
import { MEDIOS_PAGO_CAJA } from '@/types'
import { fechaHora, money, money0 } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ToastProvider'
import { FACTURACIONES, MEDIO_LABEL } from '@/components/caja/medios'
import { DiffChip } from '@/components/caja/DiffChip'

/**
 * Comprobante Z en detalle, presentado como el ticket térmico que saldría de
 * la impresora de control: monoespaciado, separadores de corte y todo el
 * arqueo del turno. Es inmutable: lo que se ve es lo que quedó guardado.
 */

const zNum = (n: number) => `Z-${String(n).padStart(4, '0')}`

export function CierreDetalleModal({
  open,
  cierre,
  onClose,
}: {
  open: boolean
  cierre: CierreCaja | null
  onClose: () => void
}) {
  const toast = useToast()
  if (!cierre) return null

  const mediosConVentas = MEDIOS_PAGO_CAJA.filter((m) => cierre.ventasPorMedio[m.value] > 0)
  const mediosConDif = MEDIOS_PAGO_CAJA.filter((m) => cierre.diferenciaPorMedio[m.value] !== 0)

  // Ventas por facturación, calculadas del snapshot inmutable de movimientos:
  // dentro de la caja general separa Factura C de lo que fue sin factura.
  const porFacturacion = cierre.movimientos.reduce(
    (acc, m) => {
      if (m.tipo !== 'venta' || !m.facturacion) return acc
      acc[m.facturacion] = { monto: (acc[m.facturacion]?.monto ?? 0) + m.monto, ops: (acc[m.facturacion]?.ops ?? 0) + 1 }
      return acc
    },
    {} as Partial<Record<FacturacionVenta, { monto: number; ops: number }>>,
  )
  const facturacionesConVentas = FACTURACIONES.filter((f) => porFacturacion[f.value])
  const denomsContadas = Object.entries(cierre.conteoCierre ?? {})
    .map(([den, cant]) => [Number(den), cant] as [number, number])
    .filter(([, cant]) => cant > 0)
    .sort((a, b) => b[0] - a[0])

  return (
    <Modal open={open} onClose={onClose} size="md">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold text-ink-950">
            Comprobante <span className="tnum">{zNum(cierre.numero)}</span>
          </h2>
          <p className="text-xs text-ink-400">Cierre inmutable · {cierre.cajaNombre}</p>
        </div>
        <DiffChip valor={cierre.diferenciaTotal} />
      </div>

      <div className="overflow-y-auto bg-canvas/60 px-5 py-5">
        {/* El ticket */}
        <div className="tnum mx-auto w-full max-w-[340px] rounded-sm border border-line bg-surface px-4 py-5 text-[0.72rem] leading-relaxed text-ink-700 shadow-[0_1px_2px_rgba(10,10,11,0.06)]">
          <div className="border-b border-dashed border-line-strong pb-3 text-center">
            <p className="text-sm font-bold tracking-[0.22em] text-ink-950">CELTUC</p>
            <p className="mt-0.5 uppercase tracking-[0.08em] text-ink-500">Cierre de caja · {cierre.cajaNombre}</p>
            <p className="text-ink-400">Turno #{cierre.sesionNumero} · {zNum(cierre.numero)}</p>
          </div>

          <Seccion>
            <Linea l="Apertura" r={fechaHora(cierre.abiertaEn)} />
            <Linea l="Cierre" r={fechaHora(cierre.cerradaEn)} />
            <Linea l="Abrió" r={cierre.abiertaPor} />
            <Linea l="Cerró" r={cierre.cerradoPor} />
          </Seccion>

          <Seccion titulo="Ventas por medio">
            {mediosConVentas.length === 0 && <p className="text-ink-400">Sin ventas en el turno.</p>}
            {mediosConVentas.map((m) => (
              <Linea
                key={m.value}
                l={`${m.label} (${cierre.operacionesPorMedio[m.value]})`}
                r={money(cierre.ventasPorMedio[m.value])}
              />
            ))}
          </Seccion>

          {facturacionesConVentas.length > 0 && (
            <Seccion titulo="Ventas por facturación">
              {facturacionesConVentas.map((f) => (
                <Linea
                  key={f.value}
                  l={`${f.label} (${porFacturacion[f.value]!.ops})`}
                  r={money(porFacturacion[f.value]!.monto)}
                />
              ))}
            </Seccion>
          )}

          <Seccion titulo="Movimiento de efectivo">
            <Linea l="Fondo inicial" r={money(cierre.fondoInicial)} />
            {cierre.ingresos > 0 && <Linea l="Ingresos" r={money(cierre.ingresos)} />}
            {cierre.egresos > 0 && <Linea l="Egresos" r={`−${money(cierre.egresos)}`} />}
            {cierre.retiros > 0 && <Linea l="Retiros a bóveda" r={`−${money(cierre.retiros)}`} />}
          </Seccion>

          <Seccion titulo="Arqueo">
            {MEDIOS_PAGO_CAJA.filter(
              (m) => cierre.esperadoPorMedio[m.value] !== 0 || cierre.contadoPorMedio[m.value] !== 0,
            ).map((m) => (
              <ArqueoMedio key={m.value} cierre={cierre} medio={m.value} />
            ))}
            {denomsContadas.length > 0 && (
              <div className="mt-2 rounded-lg bg-canvas/70 px-2.5 py-2">
                <p className="mb-1 text-[0.62rem] uppercase tracking-[0.1em] text-ink-400">Billetes contados</p>
                {denomsContadas.map(([den, cant]) => (
                  <Linea key={den} l={`${cant} × ${money0(den)}`} r={money0(cant * den)} suave />
                ))}
              </div>
            )}
          </Seccion>

          <Seccion>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-semibold uppercase tracking-[0.08em] text-ink-950">Diferencia</span>
              <span className={cn('text-sm font-bold', cierre.diferenciaTotal === 0 ? 'text-ink-500' : 'text-ink-950')}>
                {cierre.diferenciaTotal === 0
                  ? '—'
                  : `${cierre.diferenciaTotal > 0 ? 'SOBRANTE' : 'FALTANTE'} ${money(Math.abs(cierre.diferenciaTotal))}`}
              </span>
            </div>
            {cierre.motivoDiferencia && <Linea l="Motivo" r={cierre.motivoDiferencia} />}
            {cierre.notaDiferencia && (
              <p className="mt-1 text-[0.68rem] italic text-ink-500">“{cierre.notaDiferencia}”</p>
            )}
          </Seccion>

          <Seccion>
            <Linea l="Retirado a bóveda" r={money(cierre.retiroFinal)} />
            <Linea l="Fondo que queda" r={money(cierre.fondoSiguiente)} />
          </Seccion>

          <div className="mt-3 border-t border-dashed border-line-strong pt-3 text-center text-[0.66rem] text-ink-400">
            {cierre.cierreCiego && <p>Arqueo en modo ciego (sin ver el esperado)</p>}
            {mediosConDif.some((m) => m.value !== 'efectivo') && (
              <p>Tarjetas conciliadas contra cierre de lote</p>
            )}
            <p className="mt-1.5 tracking-[0.28em] text-ink-300">· · · ✂ · · ·</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col-reverse gap-2.5 border-t border-line px-5 py-4 sm:flex-row sm:justify-between">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => toast.info('Impresión térmica', 'Se habilita al conectar la impresora (backend).')}
          >
            <Printer className="h-4 w-4" />
            Imprimir
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => toast.info('Envío por email', 'Se habilita al conectar el backend.')}
          >
            <Mail className="h-4 w-4" />
            Enviar
          </Button>
        </div>
        <Button size="sm" onClick={onClose}>
          Listo
        </Button>
      </div>
    </Modal>
  )
}

// ===== Piezas del ticket =====

function Seccion({ titulo, children }: { titulo?: string; children: ReactNode }) {
  return (
    <div className="border-b border-dashed border-line-strong py-3 last:border-b-0">
      {titulo && (
        <p className="mb-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-ink-400">{titulo}</p>
      )}
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

function Linea({ l, r, suave }: { l: string; r: string; suave?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className={cn(suave ? 'text-ink-400' : 'text-ink-500')}>{l}</span>
      <span className={cn('text-right font-semibold', suave ? 'text-ink-600' : 'text-ink-900')}>{r}</span>
    </div>
  )
}

function ArqueoMedio({ cierre, medio }: { cierre: CierreCaja; medio: MedioPagoCaja }) {
  const dif = cierre.diferenciaPorMedio[medio]
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-ink-500">{MEDIO_LABEL[medio]}</span>
      <span className="text-right">
        <span className="font-semibold text-ink-900">{money(cierre.contadoPorMedio[medio])}</span>
        {dif !== 0 && (
          <span className="ml-1.5 text-[0.64rem] text-ink-500">
            ({dif > 0 ? '+' : '−'}{money(Math.abs(dif))})
          </span>
        )}
      </span>
    </div>
  )
}
