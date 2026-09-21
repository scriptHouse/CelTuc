import type { ReactNode } from 'react'
import { Check, Info, PencilLine } from 'lucide-react'
import type { CajaConfig, CajaRegistradora, MedioPagoCaja, SesionCaja } from '@/types'
import { plata } from '@/lib/format'
import type { ResumenSesion } from '@/services/caja'
import { Card } from '@/components/ui/Card'
import { DiffChip } from '@/components/caja/DiffChip'
import { MEDIO_LABEL, nombreCaja } from '@/components/caja/medios'
import { ventasLabel } from '@/components/caja/cierre/pasos'
import type { OtroMedio, PasoCierre, TareaCierre } from '@/components/caja/cierre/pasos'
import { Renglon } from '@/components/caja/cierre/piezas'

/**
 * Paso «Cerrar»: todo el cierre en una hoja, dicho con palabras, y un
 * «Cambiar» al lado de cada parte para volver justo a ese paso. El botón de
 * cerrar está en la barra de abajo.
 */
export function PasoConfirmar({
  caja,
  sesion,
  resumen,
  config,
  pasos,
  otros,
  controlados,
  contadoPorMedio,
  diferenciaPorMedio,
  difTotal,
  motivo,
  nota,
  fondo,
  retiro,
  tareas,
  onIrA,
}: {
  caja: CajaRegistradora
  sesion: SesionCaja
  resumen: ResumenSesion
  config: CajaConfig
  pasos: PasoCierre[]
  otros: OtroMedio[]
  controlados: boolean
  contadoPorMedio: Record<MedioPagoCaja, number>
  diferenciaPorMedio: Record<MedioPagoCaja, number>
  difTotal: number
  motivo: string
  nota: string
  fondo: number
  retiro: number
  tareas: TareaCierre[]
  onIrA: (paso: PasoCierre) => void
}) {
  const hora = new Date(sesion.abiertaEn).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  const cambiar = (paso: PasoCierre) => (pasos.includes(paso) ? () => onIrA(paso) : undefined)
  const huboOtrosCobros = otros.length > 0 || hayVentasSinEfectivo(resumen)

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        {/* Qué caja se está cerrando */}
        <div className="border-b border-line bg-canvas/60 px-4 py-3.5 sm:px-5">
          <p className="text-sm font-semibold text-ink-950">{nombreCaja(caja)}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-500">
            Turno #{sesion.numero} · la abrió {sesion.abiertaPor} a las {hora} · {ventasLabel(resumen.operacionesTotal)} por{' '}
            <span className="tnum">{plata(resumen.ventasTotal)}</span>
          </p>
        </div>

        <div className="divide-y divide-line">
          <Parte titulo="Efectivo" onCambiar={cambiar('efectivo')}>
            <Renglon l="Contaste" r={plata(contadoPorMedio.efectivo)} />
            <Renglon l="Tendría que haber" r={plata(resumen.esperadoPorMedio.efectivo)} />
            <div className="flex items-center justify-between gap-3 pt-1">
              <span className="text-sm text-ink-600">Resultado</span>
              <DiffChip valor={diferenciaPorMedio.efectivo} />
            </div>
          </Parte>

          {huboOtrosCobros && (
            <Parte titulo="Transferencias y tarjetas" onCambiar={controlados ? cambiar('otros') : undefined}>
              {controlados ? (
                otros.map((m) => (
                  <div key={m} className="flex items-center justify-between gap-3 py-1">
                    <span className="min-w-0 text-sm text-ink-600">{MEDIO_LABEL[m]}</span>
                    <DiffChip valor={diferenciaPorMedio[m]} etiquetaCero="Es igual" />
                  </div>
                ))
              ) : (
                <p className="text-sm leading-relaxed text-ink-500">
                  No se revisan al cerrar: se toma lo que anotó el sistema.
                </p>
              )}
            </Parte>
          )}

          <Parte titulo="En total" onCambiar={difTotal !== 0 ? cambiar('resultado') : undefined}>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-ink-600">
                {difTotal === 0 ? 'La caja cuadra' : 'La caja no cuadra'}
              </span>
              <DiffChip valor={difTotal} />
            </div>
            {(motivo || nota.trim()) && (
              <div className="mt-2 rounded-xl bg-canvas px-3 py-2.5 text-sm ring-1 ring-line">
                {motivo && <p className="font-medium text-ink-900">{motivo}</p>}
                {nota.trim() && <p className="mt-0.5 italic text-ink-500">“{nota.trim()}”</p>}
              </div>
            )}
          </Parte>

          <Parte titulo="Para mañana" onCambiar={cambiar('fondo')}>
            <Renglon l="Queda en el cajón" r={plata(fondo)} fuerte />
            <Renglon l="Se guarda aparte (caja fuerte o banco)" r={plata(retiro)} />
            {config.modoFondo !== 'preguntar' && (
              <p className="mt-1 text-xs leading-relaxed text-ink-400">
                {config.modoFondo === 'fijo'
                  ? `Así está configurado: siempre quedan ${plata(config.fondoSugerido)} (o todo, si hay menos).`
                  : 'Así está configurado: toda la plata queda en la caja.'}
              </p>
            )}
          </Parte>

          {tareas.length > 0 && (
            <Parte titulo="Tareas hechas" onCambiar={cambiar('tareas')}>
              <ul className="space-y-1">
                {tareas.map((t) => (
                  <li key={t.clave} className="flex items-start gap-2 text-sm text-ink-700">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" strokeWidth={2.5} aria-hidden />
                    {t.registro}
                  </li>
                ))}
              </ul>
            </Parte>
          )}
        </div>
      </Card>

      <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-ink-500">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Al cerrar se guarda el comprobante del cierre (el «Z») y ya no se puede cambiar. Si después aparece
        un error, se corrige con un movimiento en el próximo turno.
      </p>
    </div>
  )
}

/** ¿Hubo ventas con algo que no sea efectivo? */
function hayVentasSinEfectivo(resumen: ResumenSesion): boolean {
  return (Object.keys(resumen.ventasPorMedio) as MedioPagoCaja[]).some(
    (m) => m !== 'efectivo' && resumen.ventasPorMedio[m] > 0,
  )
}

function Parte({
  titulo,
  onCambiar,
  children,
}: {
  titulo: string
  onCambiar?: () => void
  children: ReactNode
}) {
  return (
    <section className="px-4 py-3.5 sm:px-5">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-400">{titulo}</h3>
        {onCambiar && (
          <button
            type="button"
            onClick={onCambiar}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
          >
            <PencilLine className="h-3.5 w-3.5" aria-hidden />
            Cambiar
          </button>
        )}
      </div>
      {children}
    </section>
  )
}
