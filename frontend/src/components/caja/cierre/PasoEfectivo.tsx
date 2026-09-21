import { Banknote, Eye, EyeOff, PencilLine } from 'lucide-react'
import type { CajaConfig, ConteoBilletes } from '@/types'
import { plata } from '@/lib/format'
import { Card } from '@/components/ui/Card'
import type { FormaConteo } from '@/components/caja/cierre/pasos'
import { ContadorBilletes } from '@/components/caja/cierre/ContadorBilletes'
import { BotonOpcion, CampoPlata } from '@/components/caja/cierre/piezas'

/**
 * Paso «Contar efectivo»: billete por billete (tocando) o escribiendo el
 * total, según la configuración. Con el cierre ciego no se muestra cuánto
 * tendría que haber: se ve recién en «¿Cuadra?».
 */
export function PasoEfectivo({
  config,
  forma,
  onForma,
  conteo,
  onConteo,
  sueltos,
  onSueltos,
  total,
  onTotal,
  onReiniciar,
  esperado,
}: {
  config: CajaConfig
  forma: FormaConteo
  onForma: (forma: FormaConteo) => void
  conteo: ConteoBilletes
  onConteo: (conteo: ConteoBilletes) => void
  sueltos: string
  onSueltos: (texto: string) => void
  /** El total escrito a mano (forma «total»). */
  total: string
  onTotal: (texto: string) => void
  onReiniciar: () => void
  esperado: number
}) {
  return (
    <div className="space-y-4">
      {config.cierreCiego ? (
        <div className="flex items-start gap-3 rounded-2xl border border-dashed border-line-strong bg-surface px-4 py-3.5">
          <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink-100 text-ink-600">
            <EyeOff className="h-4.5 w-4.5" strokeWidth={1.85} />
          </span>
          <p className="text-pretty text-sm leading-relaxed text-ink-600">
            <b className="font-semibold text-ink-900">Contá tranquilo.</b> No te mostramos cuánto tendría
            que haber, así el conteo es bien real. Lo vas a ver en el paso «¿Cuadra?».
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
          <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink-100 text-ink-600">
            <Eye className="h-4.5 w-4.5" strokeWidth={1.85} />
          </span>
          <p className="min-w-0 flex-1 text-sm text-ink-600">En el cajón tendría que haber</p>
          <p className="tnum shrink-0 text-lg font-bold text-ink-950">{plata(esperado)}</p>
        </div>
      )}

      {config.modoConteo === 'elegir' && (
        <div>
          <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-400">
            ¿Cómo querés contar?
          </p>
          <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Forma de contar el efectivo">
            <BotonOpcion
              activo={forma === 'billetes'}
              onClick={() => onForma('billetes')}
              icono={Banknote}
              titulo="Billete por billete"
              descripcion="Tocás cada billete y el sistema suma por vos."
            />
            <BotonOpcion
              activo={forma === 'total'}
              onClick={() => onForma('total')}
              icono={PencilLine}
              titulo="Escribir el total"
              descripcion="Contás a mano y escribís cuánto dio."
            />
          </div>
        </div>
      )}

      {forma === 'billetes' ? (
        <ContadorBilletes
          denominaciones={config.denominaciones}
          conteo={conteo}
          onConteo={onConteo}
          sueltos={sueltos}
          onSueltos={onSueltos}
          onReiniciar={onReiniciar}
        />
      ) : (
        <Card className="px-4 py-6 sm:px-8 sm:py-8">
          <label htmlFor="cierre-total-efectivo" className="block text-center text-sm font-medium text-ink-600">
            Total de efectivo en el cajón (billetes y monedas)
          </label>
          <CampoPlata
            id="cierre-total-efectivo"
            valor={total}
            onValor={onTotal}
            grande
            eco
            autoFocus
            className="mx-auto mt-3 max-w-sm"
          />
        </Card>
      )}
    </div>
  )
}
