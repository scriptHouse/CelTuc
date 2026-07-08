import { useEffect, useState } from 'react'
import { Calculator, ChevronDown, LockOpen } from 'lucide-react'
import type { CajaConfig, CajaRegistradora, CierreCaja, ConteoBilletes } from '@/types'
import { money, money0 } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { DenomGrid } from '@/components/caja/DenomGrid'
import { totalConteo } from '@/components/caja/medios'

/**
 * Apertura de turno: se declara el fondo inicial (con conteo por billetes
 * opcional, patrón Odoo) y una nota. Si hay un cierre anterior, se sugiere
 * el fondo que ese cierre dejó en caja (patrón Shopify).
 */

export interface AperturaValues {
  fondoInicial: number
  conteoApertura?: ConteoBilletes
  notaApertura?: string
}

export function AperturaModal({
  open,
  caja,
  config,
  ultimoCierre,
  saving,
  onClose,
  onSubmit,
}: {
  open: boolean
  caja: CajaRegistradora | null
  config: CajaConfig
  ultimoCierre: CierreCaja | null
  saving: boolean
  onClose: () => void
  onSubmit: (values: AperturaValues) => Promise<void>
}) {
  const sugerido = ultimoCierre ? ultimoCierre.fondoSiguiente : config.fondoSugerido

  const [fondo, setFondo] = useState('')
  const [contar, setContar] = useState(false)
  const [conteo, setConteo] = useState<ConteoBilletes>({})
  const [sueltos, setSueltos] = useState(0)
  const [nota, setNota] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setFondo(String(sugerido || ''))
    setContar(false)
    setConteo({})
    setSueltos(0)
    setNota('')
    setError('')
  }, [open, sugerido])

  const totalContado = totalConteo(conteo, sueltos)
  const usaConteo = contar && totalContado > 0
  const fondoFinal = usaConteo ? totalContado : Number(fondo) || 0

  async function handleSubmit() {
    if (fondoFinal < 0 || Number.isNaN(fondoFinal)) {
      setError('Ingresá un fondo válido (puede ser 0).')
      return
    }
    setError('')
    await onSubmit({
      fondoInicial: fondoFinal,
      conteoApertura: usaConteo ? conteo : undefined,
      notaApertura: nota.trim() || undefined,
    })
  }

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-lg font-semibold text-ink-950">Abrir caja · {caja?.nombre}</h2>
        <p className="mt-0.5 text-xs text-ink-400">
          Declarás el fondo con el que arranca el turno. Todo queda registrado en el cierre.
        </p>
      </div>

      <div className="space-y-4 overflow-y-auto px-5 py-5">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-500">Fondo inicial (efectivo en el cajón)</label>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            step="0.01"
            value={usaConteo ? String(totalContado) : fondo}
            onChange={(e) => setFondo(e.target.value)}
            disabled={usaConteo}
            data-autofocus
            className="tnum"
          />
          {usaConteo ? (
            <p className="mt-1 text-xs text-ink-500">Definido por el conteo de billetes de abajo.</p>
          ) : (
            <p className="mt-1 text-xs text-ink-400">
              {ultimoCierre
                ? <>El último cierre ({`Z-${String(ultimoCierre.numero).padStart(4, '0')}`}) dejó <b className="tnum text-ink-600">{money(ultimoCierre.fondoSiguiente)}</b> en caja.</>
                : <>Sugerido por configuración: <b className="tnum text-ink-600">{money0(config.fondoSugerido)}</b>.</>}
            </p>
          )}
          {error && <p className="mt-1 text-xs text-ink-700">{error}</p>}
        </div>

        {/* Conteo opcional por denominación */}
        <div className="overflow-hidden rounded-xl border border-line">
          <button
            type="button"
            onClick={() => setContar((v) => !v)}
            className="flex w-full items-center justify-between gap-2 px-3.5 py-3 text-left text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
            aria-expanded={contar}
          >
            <span className="inline-flex items-center gap-2">
              <Calculator className="h-4 w-4 text-ink-400" aria-hidden />
              Contar el fondo por billetes
              <span className="text-xs font-normal text-ink-400">(opcional)</span>
            </span>
            <ChevronDown
              className={cn('h-4 w-4 text-ink-400 transition-transform duration-200', contar && 'rotate-180')}
              aria-hidden
            />
          </button>
          {contar && (
            <div className="animate-fade-in border-t border-dashed border-line-strong bg-canvas/60 px-3.5 pb-3.5 pt-1">
              <DenomGrid
                denominaciones={config.denominaciones}
                conteo={conteo}
                sueltos={sueltos}
                onConteo={setConteo}
                onSueltos={setSueltos}
              />
            </div>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-500">Nota (opcional)</label>
          <Textarea
            rows={2}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Ej: fondo del cierre de ayer."
          />
        </div>

        <div className="flex flex-col-reverse gap-2.5 pt-1 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={saving}>
            <LockOpen className="h-4 w-4" />
            {saving ? 'Abriendo…' : `Abrir con ${money0(fondoFinal)}`}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
