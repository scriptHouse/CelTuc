import { useEffect, useState } from 'react'
import { FlaskConical, Receipt } from 'lucide-react'
import type { MedioPagoCaja } from '@/types'
import { MEDIOS_PAGO_CAJA } from '@/types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'

/**
 * Venta simplificada del MODO PRÁCTICA: medio, monto y concepto, nada más.
 * No toca el stock ni el backend — existe para ensayar cómo una venta entra
 * al arqueo. En la caja real las ventas van por el botón verde (VentaRapida).
 */

export interface VentaPracticaValues {
  medio: MedioPagoCaja
  monto: number
  motivo: string
}

export function VentaPracticaModal({
  open,
  saving,
  onClose,
  onSubmit,
}: {
  open: boolean
  saving: boolean
  onClose: () => void
  onSubmit: (values: VentaPracticaValues) => Promise<void>
}) {
  const [medio, setMedio] = useState<MedioPagoCaja>('efectivo')
  const [monto, setMonto] = useState('')
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setMedio('efectivo')
    setMonto('')
    setMotivo('')
    setError('')
  }, [open])

  async function handleSubmit() {
    const montoNum = Number(monto)
    if (!(montoNum > 0)) {
      setError('Ingresá un monto mayor a cero.')
      return
    }
    setError('')
    await onSubmit({
      medio,
      monto: montoNum,
      motivo: motivo.trim() || 'Venta de práctica',
    })
  }

  return (
    <Modal open={open} onClose={onClose} size="md">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold text-ink-950">Venta de práctica</h2>
          <p className="mt-0.5 text-xs text-ink-400">
            Entra al arqueo de la caja de mentira; no descuenta stock ni se guarda.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-amber-700 ring-1 ring-amber-500/30 dark:text-amber-400">
          <FlaskConical className="h-3 w-3" aria-hidden />
          práctica
        </span>
      </div>

      <div className="space-y-4 overflow-y-auto px-5 py-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-500">Medio de pago</label>
            <Select
              options={MEDIOS_PAGO_CAJA.map((m) => ({ value: m.value, label: m.label }))}
              value={medio}
              onChange={(v) => setMedio(v as MedioPagoCaja)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-500">Monto (ARS)</label>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step="0.01"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="Ej: 5000"
              className="tnum"
              data-autofocus
            />
            {error && <p className="mt-1 text-xs text-ink-700">{error}</p>}
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-xs font-medium text-ink-500">Concepto (opcional)</label>
            <Input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: Funda + templado"
            />
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2.5 pt-1 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="bg-amber-600 text-white hover:bg-amber-700 active:bg-amber-700 focus-visible:ring-amber-600"
          >
            <Receipt className="h-4 w-4" />
            {saving ? 'Registrando…' : 'Registrar venta'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
