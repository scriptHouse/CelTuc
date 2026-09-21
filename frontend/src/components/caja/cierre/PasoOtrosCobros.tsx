import { useState } from 'react'
import { Check, ChevronDown, PencilLine, Plus } from 'lucide-react'
import { plata } from '@/lib/format'
import { cn, ctStagger } from '@/lib/utils'
import type { ResumenSesion } from '@/services/caja'
import { Card } from '@/components/ui/Card'
import { DiffChip } from '@/components/caja/DiffChip'
import { MEDIO_ICONO, MEDIO_LABEL } from '@/components/caja/medios'
import { DONDE_MIRAR, centavos, hayMonto, leerMonto, medioRevisado, ventasLabel } from '@/components/caja/cierre/pasos'
import type { OtroMedio, RevisionMedio } from '@/components/caja/cierre/pasos'
import { BotonOpcion, CampoPlata, Estado, IconoCaja } from '@/components/caja/cierre/piezas'

/**
 * Paso «Otros cobros»: transferencias y tarjetas se revisan con UNA pregunta
 * por medio —¿es lo mismo que ves?—, en vez de un formulario para llenar.
 * Si no es igual, se escribe lo que se ve y la diferencia aparece al toque.
 */
export function PasoOtrosCobros({
  medios,
  extras,
  resumen,
  revision,
  onRevision,
  montosExtra,
  onMontoExtra,
}: {
  /** Los medios con algo anotado: se preguntan uno por uno. */
  medios: OtroMedio[]
  /** Los medios sin nada anotado (por si entró plata que no se cargó). */
  extras: OtroMedio[]
  resumen: ResumenSesion
  revision: Partial<Record<OtroMedio, RevisionMedio>>
  onRevision: (medio: OtroMedio, r: RevisionMedio) => void
  montosExtra: Partial<Record<OtroMedio, string>>
  onMontoExtra: (medio: OtroMedio, texto: string) => void
}) {
  const [verExtras, setVerExtras] = useState(() =>
    extras.some((m) => (montosExtra[m] ?? '').trim() !== ''),
  )

  return (
    <div className="space-y-3">
      {medios.map((medio, i) => {
        const r = revision[medio] ?? { respuesta: null, monto: '' }
        const anotado = resumen.esperadoPorMedio[medio]
        const visto = r.respuesta === 'otro' && hayMonto(r.monto) ? leerMonto(r.monto) : null
        const Icono = MEDIO_ICONO[medio]
        return (
          <Card key={medio} className="ct-stagger-item p-4 sm:p-5" style={ctStagger(i)}>
            <div className="flex items-start gap-3">
              <IconoCaja icono={Icono} />
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-ink-950">{MEDIO_LABEL[medio]}</p>
                <p className="mt-0.5 text-pretty text-xs leading-relaxed text-ink-500">{DONDE_MIRAR[medio]}</p>
              </div>
              <Estado hecho={medioRevisado(r)} si="Revisado" no="Sin revisar" />
            </div>

            <div className="mt-3.5 flex items-baseline justify-between gap-3 rounded-xl bg-canvas px-3.5 py-3 ring-1 ring-line">
              <span className="text-sm text-ink-500">
                El sistema anotó
                <span className="block text-xs text-ink-400">
                  {ventasLabel(resumen.operacionesPorMedio[medio])}
                </span>
              </span>
              <span className="tnum text-xl font-bold tracking-tight text-ink-950 sm:text-2xl">{plata(anotado)}</span>
            </div>

            <p className="mt-4 text-sm font-semibold text-ink-900">¿Es lo mismo que ves?</p>
            <div className="mt-2 grid grid-cols-2 gap-2" role="group" aria-label={`¿${MEDIO_LABEL[medio]} coincide?`}>
              <BotonOpcion
                activo={r.respuesta === 'igual'}
                onClick={() => onRevision(medio, { ...r, respuesta: 'igual' })}
                icono={Check}
                titulo="Sí, es igual"
              />
              <BotonOpcion
                activo={r.respuesta === 'otro'}
                onClick={() => onRevision(medio, { ...r, respuesta: 'otro' })}
                icono={PencilLine}
                titulo="No, es otro"
              />
            </div>

            {r.respuesta === 'otro' && (
              <div className="animate-fade-in mt-3.5 rounded-xl border border-dashed border-line-strong p-3.5">
                <label htmlFor={`cierre-visto-${medio}`} className="mb-1.5 block text-sm font-medium text-ink-700">
                  ¿Cuánto ves en {medio === 'tarjeta' ? 'el ticket del posnet' : 'la cuenta'}?
                </label>
                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                  <CampoPlata
                    id={`cierre-visto-${medio}`}
                    valor={r.monto}
                    onValor={(monto) => onRevision(medio, { ...r, monto })}
                    autoFocus
                    className="sm:w-52"
                  />
                  {visto !== null && (
                    <div className="animate-fade-in">
                      <DiffChip valor={centavos(visto - anotado)} etiquetaCero="Es igual" />
                    </div>
                  )}
                </div>
              </div>
            )}
          </Card>
        )
      })}

      {extras.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          <button
            type="button"
            onClick={() => setVerExtras((v) => !v)}
            aria-expanded={verExtras}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink-900"
          >
            <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ink-50 text-ink-500 ring-1 ring-line">
              <Plus className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-ink-800">¿Entró plata por otro medio que no está acá?</span>
              <span className="block text-xs text-ink-400">Por ejemplo, una transferencia que nadie cargó como venta.</span>
            </span>
            <ChevronDown
              aria-hidden
              className={cn('h-4 w-4 shrink-0 text-ink-400 transition-transform duration-200', verExtras && 'rotate-180')}
            />
          </button>
          {verExtras && (
            <div className="animate-fade-in divide-y divide-line border-t border-line">
              {extras.map((medio) => {
                const Icono = MEDIO_ICONO[medio]
                return (
                  <div key={medio} className="flex flex-col gap-2.5 px-4 py-3 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <IconoCaja icono={Icono} className="h-9 w-9" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink-900">{MEDIO_LABEL[medio]}</p>
                        <p className="text-xs text-ink-400">El sistema no anotó nada. Escribí lo que ves (o dejalo vacío).</p>
                      </div>
                    </div>
                    <CampoPlata
                      valor={montosExtra[medio] ?? ''}
                      onValor={(texto) => onMontoExtra(medio, texto)}
                      aria-label={`Lo que entró por ${MEDIO_LABEL[medio]}`}
                      className="sm:w-44"
                    />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
