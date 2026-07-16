import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FlaskConical, Minus, Plus, Receipt, Trash2 } from 'lucide-react'
import type { MedioPagoCaja, ProductoCatalogo } from '@/types'
import { MEDIOS_PAGO_CAJA } from '@/types'
import { listarProductos } from '@/services/productos'
import { money, money0, num } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'

/**
 * Venta del MODO PRÁCTICA: la misma experiencia que la venta real — elegís
 * productos del catálogo (lectura solamente), cantidades y precio sugerido —
 * pero todo termina en la caja de mentira: no descuenta stock, no toca la API
 * de ventas y desaparece al salir. Si el catálogo no está disponible, queda
 * la carga manual de un monto.
 */

export interface VentaPracticaValues {
  medio: MedioPagoCaja
  monto: number
  motivo: string
}

interface Linea {
  key: string
  producto: ProductoCatalogo
  cantidad: number
  precio: number
}

let _clave = 0
const claveNueva = () => `lp-${_clave++}`

/** Mismo criterio que la venta real: cash para efectivo/transferencia, lista para el resto. */
function precioSugerido(p: ProductoCatalogo, medio: MedioPagoCaja): number {
  const cash = p.efectivo?.cash_ars
  const lista = p.efectivo?.lista_ars
  if ((medio === 'efectivo' || medio === 'transferencia') && cash != null) return Number(cash)
  return lista != null ? Number(lista) : 0
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
  // El catálogo es SOLO LECTURA: mirar productos no crea nada. Sin permiso o
  // sin catálogo, el modal degrada a la carga manual de un monto.
  const { data: catalogo = [], isError } = useQuery({
    queryKey: ['productos-items'],
    queryFn: listarProductos,
    enabled: open,
    retry: false,
  })
  const hayCatalogo = !isError && catalogo.length > 0

  const [medio, setMedio] = useState<MedioPagoCaja>('efectivo')
  const [lineas, setLineas] = useState<Linea[]>([])
  const [buscar, setBuscar] = useState('')
  const [montoManual, setMontoManual] = useState('')
  const [concepto, setConcepto] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setMedio('efectivo')
    setLineas([])
    setBuscar('')
    setMontoManual('')
    setConcepto('')
    setError('')
  }, [open])

  const opcionesProducto = useMemo(
    () => [
      { value: '', label: 'Buscar producto del catálogo…' },
      ...catalogo
        .filter((p) => p.activo)
        .map((p) => ({
          value: String(p.id),
          label:
            [p.nombre, p.calidad].filter(Boolean).join(' · ') +
            (p.efectivo?.lista_ars != null ? ` — ${money0(Number(p.efectivo.lista_ars))}` : ''),
        })),
    ],
    [catalogo],
  )

  function agregar(idProducto: string) {
    const producto = catalogo.find((p) => String(p.id) === idProducto)
    if (!producto) return
    setLineas((previas) => {
      const existente = previas.find((l) => l.producto.id === producto.id)
      if (existente) {
        return previas.map((l) =>
          l.producto.id === producto.id ? { ...l, cantidad: l.cantidad + 1 } : l,
        )
      }
      return [
        ...previas,
        { key: claveNueva(), producto, cantidad: 1, precio: precioSugerido(producto, medio) },
      ]
    })
    setBuscar('')
    setError('')
  }

  const total = lineas.reduce((a, l) => a + l.cantidad * (Number.isFinite(l.precio) ? l.precio : 0), 0)
  const montoFinal = lineas.length > 0 ? total : Number(montoManual)

  async function handleSubmit() {
    if (!(montoFinal > 0)) {
      setError(
        lineas.length > 0
          ? 'Revisá los precios: el total tiene que ser mayor a cero.'
          : 'Agregá un producto o cargá un monto mayor a cero.',
      )
      return
    }
    setError('')
    const motivo =
      lineas.length > 0
        ? lineas.map((l) => `${l.cantidad}x ${l.producto.nombre}`).join(', ').slice(0, 200)
        : concepto.trim() || 'Venta de práctica'
    await onSubmit({ medio, monto: montoFinal, motivo })
  }

  return (
    <Modal open={open} onClose={onClose} size="xl">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold text-ink-950">Venta de práctica</h2>
          <p className="mt-0.5 text-xs text-ink-400">
            Igual que una venta real, pero de mentira: no descuenta stock ni se guarda.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-amber-700 ring-1 ring-amber-500/30 dark:text-amber-400">
          <FlaskConical className="h-3 w-3" aria-hidden />
          práctica
        </span>
      </div>

      <div className="max-h-[72vh] space-y-4 overflow-y-auto px-5 py-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-500">Medio de pago</label>
            <Select
              options={MEDIOS_PAGO_CAJA.map((m) => ({ value: m.value, label: m.label }))}
              value={medio}
              onChange={(v) => setMedio(v as MedioPagoCaja)}
            />
            {hayCatalogo && (
              <p className="mt-1 text-xs text-ink-400">
                Con efectivo/transferencia se sugiere el precio cash; con tarjeta, el de lista.
              </p>
            )}
          </div>
          {hayCatalogo && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-500">Productos</label>
              <Select
                options={opcionesProducto}
                value={buscar}
                onChange={agregar}
                searchable
                searchPlaceholder="funda 13, cargador 20w…"
                placeholder="Buscar producto del catálogo…"
              />
            </div>
          )}
        </div>

        {lineas.length > 0 && (
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {lineas.map((linea) => (
              <li key={linea.key} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:px-4">
                <div className="min-w-0 flex-1 basis-40">
                  <p className="truncate text-sm font-medium text-ink-900">{linea.producto.nombre}</p>
                  <p className="truncate text-xs text-ink-400">
                    {[linea.producto.marca, linea.producto.calidad].filter(Boolean).join(' · ') || 'catálogo'}
                  </p>
                </div>
                <div className="inline-flex items-center rounded-xl border border-line-strong">
                  <button
                    type="button"
                    aria-label={`Restar ${linea.producto.nombre}`}
                    onClick={() =>
                      setLineas((ls) =>
                        ls.map((l) =>
                          l.key === linea.key ? { ...l, cantidad: Math.max(1, l.cantidad - 1) } : l,
                        ),
                      )
                    }
                    className="grid h-9 w-9 place-items-center rounded-l-xl text-ink-500 hover:bg-ink-100 hover:text-ink-900"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="tnum w-8 text-center text-sm font-semibold text-ink-900">{num(linea.cantidad)}</span>
                  <button
                    type="button"
                    aria-label={`Sumar ${linea.producto.nombre}`}
                    onClick={() =>
                      setLineas((ls) =>
                        ls.map((l) => (l.key === linea.key ? { ...l, cantidad: l.cantidad + 1 } : l)),
                      )
                    }
                    className="grid h-9 w-9 place-items-center rounded-r-xl text-ink-500 hover:bg-ink-100 hover:text-ink-900"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="relative w-32">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-ink-400">$</span>
                  <Input
                    value={String(linea.precio)}
                    onChange={(e) =>
                      setLineas((ls) =>
                        ls.map((l) =>
                          l.key === linea.key
                            ? { ...l, precio: Number(e.target.value.replace(',', '.')) }
                            : l,
                        ),
                      )
                    }
                    inputMode="decimal"
                    aria-label={`Precio de ${linea.producto.nombre}`}
                    className="tnum h-10 pl-6 pr-2 text-sm"
                  />
                </div>
                <span className="tnum hidden w-24 text-right text-sm font-semibold text-ink-900 sm:block">
                  {money(linea.cantidad * (Number.isFinite(linea.precio) ? linea.precio : 0))}
                </span>
                <button
                  type="button"
                  aria-label={`Quitar ${linea.producto.nombre}`}
                  onClick={() => setLineas((ls) => ls.filter((l) => l.key !== linea.key))}
                  className="grid h-9 w-9 place-items-center rounded-xl text-ink-400 hover:bg-ink-100 hover:text-ink-900"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Sin productos elegidos (o sin catálogo): carga manual de un monto. */}
        {lineas.length === 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-500">
                {hayCatalogo ? 'O cargá un monto a mano (ARS)' : 'Monto (ARS)'}
              </label>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                step="0.01"
                value={montoManual}
                onChange={(e) => setMontoManual(e.target.value)}
                placeholder="Ej: 5000"
                className="tnum"
                data-autofocus={hayCatalogo ? undefined : true}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-500">Concepto (opcional)</label>
              <Input
                value={concepto}
                onChange={(e) => setConcepto(e.target.value)}
                placeholder="Ej: Funda + templado"
              />
            </div>
          </div>
        )}

        <div className={cn('flex items-end justify-between gap-3', lineas.length === 0 && 'justify-end')}>
          {lineas.length > 0 && (
            <div>
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-400">Total</p>
              <p key={total} className="ct-count tnum text-2xl font-bold tracking-tight text-ink-950">
                {money0(total)}
              </p>
            </div>
          )}
          {error && <p className="text-xs font-medium text-ink-700">{error}</p>}
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
