import { useEffect, useMemo, useState } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, Landmark, Receipt } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { MedioPagoCaja, TipoMovimientoCaja } from '@/types'
import { MEDIOS_PAGO_CAJA, MOTIVOS_MOVIMIENTO_CAJA } from '@/types'
import { money } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'

/**
 * Alta de movimiento del turno. Las ventas llevan medio de pago y concepto;
 * ingresos/egresos/retiros son de efectivo y exigen motivo (patrón Toast/Odoo:
 * nunca entra ni sale plata sin explicación).
 */

export interface MovimientoValues {
  tipo: TipoMovimientoCaja
  medio: MedioPagoCaja
  monto: number
  motivo: string
  detalle?: string
}

const TIPOS: { value: TipoMovimientoCaja; label: string; icon: LucideIcon; hint: string }[] = [
  { value: 'venta', label: 'Venta', icon: Receipt, hint: 'Entra plata por una venta' },
  { value: 'ingreso', label: 'Ingreso', icon: ArrowDownToLine, hint: 'Entra efectivo al cajón' },
  { value: 'egreso', label: 'Egreso', icon: ArrowUpFromLine, hint: 'Sale efectivo (gasto, pago)' },
  { value: 'retiro', label: 'Retiro', icon: Landmark, hint: 'Efectivo a bóveda / banco' },
]

export function MovimientoModal({
  open,
  retirosHabilitados,
  efectivoDisponible,
  saving,
  onClose,
  onSubmit,
}: {
  open: boolean
  retirosHabilitados: boolean
  efectivoDisponible: number
  saving: boolean
  onClose: () => void
  onSubmit: (values: MovimientoValues) => Promise<void>
}) {
  const tipos = useMemo(
    () => TIPOS.filter((t) => t.value !== 'retiro' || retirosHabilitados),
    [retirosHabilitados],
  )

  const [tipo, setTipo] = useState<TipoMovimientoCaja>('venta')
  const [medio, setMedio] = useState<MedioPagoCaja>('efectivo')
  const [monto, setMonto] = useState('')
  const [motivo, setMotivo] = useState('')
  const [detalle, setDetalle] = useState('')
  const [errores, setErrores] = useState<{ monto?: string; motivo?: string }>({})

  useEffect(() => {
    if (!open) return
    setTipo('venta')
    setMedio('efectivo')
    setMonto('')
    setMotivo('')
    setDetalle('')
    setErrores({})
  }, [open])

  function cambiarTipo(t: TipoMovimientoCaja) {
    setTipo(t)
    setErrores({})
    setMotivo(t === 'venta' ? '' : MOTIVOS_MOVIMIENTO_CAJA[t][0])
  }

  const saleEfectivo = tipo === 'egreso' || tipo === 'retiro'

  async function handleSubmit() {
    const montoNum = Number(monto)
    const errs: typeof errores = {}
    if (!(montoNum > 0)) errs.monto = 'Ingresá un monto mayor a cero.'
    else if (saleEfectivo && montoNum > efectivoDisponible) {
      errs.monto = `No hay tanto efectivo en caja (hay ${money(efectivoDisponible)}).`
    }
    if (!motivo.trim()) errs.motivo = tipo === 'venta' ? 'Contá qué se vendió.' : 'Elegí un motivo.'
    setErrores(errs)
    if (Object.keys(errs).length > 0) return
    await onSubmit({
      tipo,
      medio: tipo === 'venta' ? medio : 'efectivo',
      monto: montoNum,
      motivo: motivo.trim(),
      detalle: detalle.trim() || undefined,
    })
  }

  const tipoActivo = TIPOS.find((t) => t.value === tipo)

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-lg font-semibold text-ink-950">Nuevo movimiento</h2>
        <p className="mt-0.5 text-xs text-ink-400">{tipoActivo?.hint}</p>
      </div>

      <div className="space-y-4 overflow-y-auto px-5 py-5">
        {/* Tipo (segmentado) */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-500">Tipo</label>
          <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-line bg-canvas/60 p-1.5 sm:grid-cols-4">
            {tipos.map((t) => {
              const activo = tipo === t.value
              const Icon = t.icon
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => cambiarTipo(t.value)}
                  aria-pressed={activo}
                  className={cn(
                    'flex h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-medium transition-all duration-150',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900',
                    activo
                      ? 'bg-ink-950 text-on-ink shadow-[0_8px_18px_rgba(10,10,11,0.18)]'
                      : 'text-ink-500 hover:bg-ink-100 hover:text-ink-800',
                  )}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {tipo === 'venta' && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-500">Medio de pago</label>
              <Select
                options={MEDIOS_PAGO_CAJA.map((m) => ({ value: m.value, label: m.label }))}
                value={medio}
                onChange={(v) => setMedio(v as MedioPagoCaja)}
              />
            </div>
          )}

          <div className={cn(tipo !== 'venta' && 'sm:order-2')}>
            <label className="mb-1.5 block text-xs font-medium text-ink-500">Monto (ARS)</label>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step="0.01"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="0"
              className="tnum"
              data-autofocus
            />
            {saleEfectivo && !errores.monto && (
              <p className="mt-1 text-xs text-ink-400">
                Efectivo en caja: <span className="tnum text-ink-600">{money(efectivoDisponible)}</span>
              </p>
            )}
            {errores.monto && <p className="mt-1 text-xs text-ink-700">{errores.monto}</p>}
          </div>

          <div className={cn(tipo !== 'venta' && 'sm:order-1')}>
            <label className="mb-1.5 block text-xs font-medium text-ink-500">
              {tipo === 'venta' ? 'Concepto' : 'Motivo'}
            </label>
            {tipo === 'venta' ? (
              <Input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej: Funda + templado iPhone 13"
              />
            ) : (
              <Select
                options={MOTIVOS_MOVIMIENTO_CAJA[tipo].map((m) => ({ value: m, label: m }))}
                value={motivo}
                onChange={setMotivo}
              />
            )}
            {errores.motivo && <p className="mt-1 text-xs text-ink-700">{errores.motivo}</p>}
          </div>

          <div className={cn(tipo !== 'venta' && 'sm:order-3 sm:col-span-2')}>
            <label className="mb-1.5 block text-xs font-medium text-ink-500">Detalle (opcional)</label>
            <Input
              value={detalle}
              onChange={(e) => setDetalle(e.target.value)}
              placeholder={tipo === 'venta' ? 'Cliente, garantía…' : 'Ej: proveedor, autorizó…'}
            />
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2.5 pt-1 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Guardando…' : 'Registrar movimiento'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
