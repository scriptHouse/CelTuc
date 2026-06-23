import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Building2,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Plus,
  ReceiptText,
  Trash2,
  Wallet,
  X,
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { CondicionEmisor, CondicionFiscal, Cuenta, Factura } from '@/types'
import {
  cambiarEstadoFactura,
  crearCuenta,
  crearFactura,
  eliminarFactura,
  listarCuentas,
  listarFacturas,
  type NuevaFactura,
} from '@/services/facturacion'
import { listarProductos } from '@/services/inventario'
import {
  calcularTotales,
  condicionesClientePara,
  CONDICION_CORTA,
  CONDICION_LABEL,
  estadoEfectivo,
  IVA_RATE,
  numeroComprobante,
  tipoComprobante,
} from '@/lib/afip'
import { fecha, money, num } from '@/lib/format'
import { cn, ctStagger } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { FacturaEstadoBadge } from '@/components/ui/StatusBadge'
import { useToast } from '@/components/ToastProvider'
import { useConfirm } from '@/components/ConfirmProvider'

export function FacturacionPage() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()

  const { data: cuentas = [], isLoading: loadingCuentas } = useQuery({
    queryKey: ['cuentas'],
    queryFn: listarCuentas,
  })

  const [cuentaId, setCuentaId] = useState<string>('')
  useEffect(() => {
    if (!cuentaId && cuentas.length) setCuentaId(cuentas[0].id)
  }, [cuentas, cuentaId])

  const cuenta = cuentas.find((c) => c.id === cuentaId)

  const { data: facturas = [], isLoading: loadingFacturas } = useQuery({
    queryKey: ['facturas', cuentaId],
    queryFn: () => listarFacturas(cuentaId),
    enabled: Boolean(cuentaId),
  })

  const { data: productos = [] } = useQuery({ queryKey: ['productos'], queryFn: listarProductos })

  const [facturaModal, setFacturaModal] = useState(false)
  const [cuentaModal, setCuentaModal] = useState(false)
  const [detalle, setDetalle] = useState<Factura | null>(null)

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ['facturas'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const nuevaFacturaMut = useMutation({
    mutationFn: (input: NuevaFactura) => crearFactura(input),
    onSuccess: (f) => {
      invalidar()
      toast.success(`Comprobante ${f.tipo} emitido`, `Total ${money(f.total)}`)
    },
  })
  const nuevaCuentaMut = useMutation({
    mutationFn: crearCuenta,
    onSuccess: (c) => {
      queryClient.invalidateQueries({ queryKey: ['cuentas'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setCuentaId(c.id)
      toast.success('Cuenta creada', c.nombre)
    },
  })
  const estadoMut = useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: Factura['estado'] }) =>
      cambiarEstadoFactura(id, estado),
    onSuccess: () => invalidar(),
  })
  const borrarMut = useMutation({
    mutationFn: (id: string) => eliminarFactura(id),
    onSuccess: () => {
      invalidar()
      toast.success('Comprobante eliminado')
    },
  })

  const stats = useMemo(() => {
    const total = facturas.reduce((a, f) => a + f.total, 0)
    const cobrado = facturas.filter((f) => f.estado === 'pagada').reduce((a, f) => a + f.total, 0)
    const pendiente = facturas.filter((f) => estadoEfectivo(f) !== 'pagada').reduce((a, f) => a + f.total, 0)
    return { total, cobrado, pendiente, cantidad: facturas.length }
  }, [facturas])

  async function handleEliminar(f: Factura) {
    const ok = await confirm({
      title: `¿Eliminar comprobante ${f.tipo}?`,
      description: cuenta ? `N° ${numeroComprobante(cuenta.puntoVenta, f.numero)} · ${money(f.total)}` : undefined,
      confirmLabel: 'Eliminar',
      tone: 'danger',
    })
    if (ok) borrarMut.mutate(f.id)
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        icon={ReceiptText}
        eyebrow="Comprobantes"
        title="Facturación"
        subtitle="Gestioná las cuentas y emití comprobantes A, B o C según la condición fiscal."
        className="ct-rise"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setCuentaModal(true)}>
              <Building2 className="h-4 w-4" />
              Nueva cuenta
            </Button>
            <Button size="sm" onClick={() => setFacturaModal(true)} disabled={!cuenta}>
              <Plus className="h-4 w-4" />
              Nueva factura
            </Button>
          </>
        }
      />

      {/* Selector de cuentas */}
      {loadingCuentas ? (
        <Skeleton className="mb-5 h-16 w-full" />
      ) : (
        <div className="ct-rise mb-5 flex gap-2.5 overflow-x-auto pb-1">
          {cuentas.map((c) => {
            const activa = c.id === cuentaId
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCuentaId(c.id)}
                className={cn(
                  'group flex min-w-[15rem] shrink-0 items-center gap-3 rounded-2xl border p-3 text-left transition-all duration-200',
                  activa
                    ? 'border-ink-950 bg-ink-950 text-on-ink shadow-[0_10px_30px_rgba(10,10,11,0.18)]'
                    : 'border-line bg-surface hover:border-ink-300',
                )}
              >
                <span
                  className={cn(
                    'grid h-10 w-10 shrink-0 place-items-center rounded-xl',
                    activa ? 'bg-on-ink/15 text-on-ink' : 'bg-ink-100 text-ink-700',
                  )}
                >
                  <Building2 className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{c.nombre}</span>
                  <span className={cn('tnum block truncate text-xs', activa ? 'text-on-ink/70' : 'text-ink-400')}>
                    {CONDICION_CORTA[c.condicion]} · PV {String(c.puntoVenta).padStart(4, '0')}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Stats de la cuenta */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard className="ct-stagger-item" style={ctStagger(0)} label="Facturado" value={money(stats.total)} icon={ReceiptText} />
        <StatCard className="ct-stagger-item" style={ctStagger(1)} label="Cobrado" value={money(stats.cobrado)} icon={CheckCircle2} />
        <StatCard className="ct-stagger-item" style={ctStagger(2)} label="Pendiente" value={money(stats.pendiente)} icon={Wallet} />
        <StatCard className="ct-stagger-item" style={ctStagger(3)} label="Comprobantes" value={num(stats.cantidad)} icon={FileText} />
      </div>

      {/* Listado */}
      {loadingFacturas ? (
        <ListaSkeleton />
      ) : facturas.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title="Sin comprobantes"
          description="Emití la primera factura de esta cuenta."
          action={
            <Button onClick={() => setFacturaModal(true)} disabled={!cuenta}>
              <Plus className="h-4 w-4" />
              Nueva factura
            </Button>
          }
        />
      ) : (
        <Card className="ct-rise overflow-hidden">
          <ul className="divide-y divide-line">
            {facturas.map((f, i) => (
              <li
                key={f.id}
                className="ct-stagger-fade flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-ink-50 sm:px-5"
                style={ctStagger(i)}
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink-950 text-sm font-bold text-on-ink">
                  {f.tipo}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900">{f.cliente.nombre}</p>
                  <p className="tnum truncate text-xs text-ink-400">
                    {cuenta ? numeroComprobante(cuenta.puntoVenta, f.numero) : f.numero} · {fecha(f.fecha)}
                  </p>
                </div>
                <div className="hidden shrink-0 text-right sm:block">
                  <p className="tnum text-sm font-semibold text-ink-900">{money(f.total)}</p>
                  <p className="text-xs text-ink-400">vence {fecha(f.vencimiento)}</p>
                </div>
                <div className="w-[104px] shrink-0 text-center">
                  <FacturaEstadoBadge estado={estadoEfectivo(f)} />
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <IconBtn label="Ver detalle" onClick={() => setDetalle(f)}>
                    <Eye className="h-4 w-4" />
                  </IconBtn>
                  {f.estado === 'pendiente' ? (
                    <IconBtn label="Marcar pagada" onClick={() => estadoMut.mutate({ id: f.id, estado: 'pagada' })}>
                      <CheckCircle2 className="h-4 w-4" />
                    </IconBtn>
                  ) : (
                    <IconBtn label="Marcar pendiente" onClick={() => estadoMut.mutate({ id: f.id, estado: 'pendiente' })}>
                      <Clock className="h-4 w-4" />
                    </IconBtn>
                  )}
                  <IconBtn label="Eliminar" onClick={() => handleEliminar(f)}>
                    <Trash2 className="h-4 w-4" />
                  </IconBtn>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {cuenta && (
        <NuevaFacturaModal
          open={facturaModal}
          cuenta={cuenta}
          productos={productos}
          saving={nuevaFacturaMut.isPending}
          onClose={() => setFacturaModal(false)}
          onSubmit={async (payload) => {
            await nuevaFacturaMut.mutateAsync({ ...payload, cuentaId: cuenta.id })
            setFacturaModal(false)
          }}
        />
      )}

      <NuevaCuentaModal
        open={cuentaModal}
        saving={nuevaCuentaMut.isPending}
        onClose={() => setCuentaModal(false)}
        onSubmit={async (payload) => {
          await nuevaCuentaMut.mutateAsync(payload)
          setCuentaModal(false)
        }}
      />

      <DetalleModal factura={detalle} cuenta={cuenta} onClose={() => setDetalle(null)} />
    </div>
  )
}

// ===== Detalle =====

function DetalleModal({
  factura,
  cuenta,
  onClose,
}: {
  factura: Factura | null
  cuenta?: Cuenta
  onClose: () => void
}) {
  const open = Boolean(factura)
  return (
    <Modal open={open} onClose={onClose} size="lg">
      {factura && (
        <>
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-ink-950 text-base font-bold text-on-ink">
                {factura.tipo}
              </span>
              <div>
                <h2 className="tnum text-base font-semibold text-ink-950">
                  {cuenta ? numeroComprobante(cuenta.puntoVenta, factura.numero) : `N° ${factura.numero}`}
                </h2>
                <p className="text-xs text-ink-400">
                  {cuenta?.nombre} · Factura {factura.tipo}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="grid h-8 w-8 place-items-center rounded-full text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-5 overflow-y-auto px-5 py-5">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <Dato label="Cliente" value={factura.cliente.nombre} />
              <Dato label="Condición" value={CONDICION_LABEL[factura.cliente.condicion]} />
              <Dato label={factura.cliente.docTipo} value={factura.cliente.docNumero || '—'} />
              <Dato label="Estado" value={<FacturaEstadoBadge estado={estadoEfectivo(factura)} />} />
              <Dato label="Emisión" value={fecha(factura.fecha)} />
              <Dato label="Vencimiento" value={fecha(factura.vencimiento)} />
            </div>

            <div className="overflow-hidden rounded-xl border border-line">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-ink-50 text-left text-xs uppercase tracking-wide text-ink-400">
                    <th className="px-3 py-2 font-semibold">Descripción</th>
                    <th className="px-3 py-2 text-center font-semibold">Cant.</th>
                    <th className="px-3 py-2 text-right font-semibold">P. unit.</th>
                    <th className="px-3 py-2 text-right font-semibold">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {factura.items.map((it) => (
                    <tr key={it.id}>
                      <td className="px-3 py-2 text-ink-800">{it.descripcion}</td>
                      <td className="tnum px-3 py-2 text-center text-ink-600">{num(it.cantidad)}</td>
                      <td className="tnum px-3 py-2 text-right text-ink-600">{money(it.precioUnitario)}</td>
                      <td className="tnum px-3 py-2 text-right font-medium text-ink-900">
                        {money(it.cantidad * it.precioUnitario)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="ml-auto w-full max-w-xs space-y-1.5 text-sm">
              {factura.tipo !== 'C' && (
                <>
                  <Linea label="Neto" value={money(factura.neto)} />
                  <Linea label={`IVA (${Math.round(IVA_RATE * 100)}%)`} value={money(factura.iva)} />
                </>
              )}
              <div className="flex items-center justify-between border-t border-line pt-2 text-base font-semibold text-ink-950">
                <span>Total</span>
                <span className="tnum">{money(factura.total)}</span>
              </div>
              {factura.tipo === 'C' && (
                <p className="pt-1 text-xs text-ink-400">Comprobante C · no discrimina IVA.</p>
              )}
            </div>

            {factura.observaciones && (
              <p className="rounded-xl bg-ink-50 px-4 py-3 text-sm text-ink-600">{factura.observaciones}</p>
            )}
          </div>
        </>
      )}
    </Modal>
  )
}

// ===== Nueva factura =====

interface BorradorItem {
  key: string
  descripcion: string
  cantidad: number
  precioUnitario: number
  productoId?: string
}

let _k = 0
const nextKey = () => `bi-${_k++}`

function NuevaFacturaModal({
  open,
  cuenta,
  productos,
  saving,
  onClose,
  onSubmit,
}: {
  open: boolean
  cuenta: Cuenta
  productos: { id: string; nombre: string; precio: number }[]
  saving: boolean
  onClose: () => void
  onSubmit: (payload: Omit<NuevaFactura, 'cuentaId'>) => Promise<void>
}) {
  const [nombre, setNombre] = useState('')
  const [condicion, setCondicion] = useState<CondicionFiscal>('consumidor_final')
  const [docTipo, setDocTipo] = useState<'CUIT' | 'DNI'>('DNI')
  const [docNumero, setDocNumero] = useState('')
  const [fechaEmision, setFechaEmision] = useState(hoyInput())
  const [vencimiento, setVencimiento] = useState(addDaysInput(15))
  const [pagada, setPagada] = useState(false)
  const [observaciones, setObservaciones] = useState('')
  const [items, setItems] = useState<BorradorItem[]>([])

  useEffect(() => {
    if (!open) return
    const cond = condicionesClientePara(cuenta.condicion)[0]
    setNombre('')
    setCondicion(cond)
    setDocTipo(cond === 'responsable_inscripto' ? 'CUIT' : 'DNI')
    setDocNumero('')
    setFechaEmision(hoyInput())
    setVencimiento(addDaysInput(15))
    setPagada(false)
    setObservaciones('')
    setItems([{ key: nextKey(), descripcion: '', cantidad: 1, precioUnitario: 0 }])
  }, [open, cuenta])

  const tipo = tipoComprobante(cuenta.condicion, condicion)
  const totales = useMemo(
    () =>
      calcularTotales(
        items.map((i) => ({ id: i.key, descripcion: i.descripcion, cantidad: i.cantidad, precioUnitario: i.precioUnitario })),
        tipo,
      ),
    [items, tipo],
  )

  const condicionOptions = condicionesClientePara(cuenta.condicion).map((c) => ({
    value: c,
    label: CONDICION_LABEL[c],
  }))
  const productoOptions = [
    { value: '', label: 'Agregar producto del inventario…' },
    ...productos.map((p) => ({ value: p.id, label: `${p.nombre} — ${money(p.precio)}` })),
  ]

  function updateItem(key: string, patch: Partial<BorradorItem>) {
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)))
  }
  function addBlank() {
    setItems((list) => [...list, { key: nextKey(), descripcion: '', cantidad: 1, precioUnitario: 0 }])
  }
  function addFromProducto(id: string) {
    const prod = productos.find((p) => p.id === id)
    if (!prod) return
    setItems((list) => [
      ...list,
      { key: nextKey(), descripcion: prod.nombre, cantidad: 1, precioUnitario: prod.precio, productoId: prod.id },
    ])
  }
  function removeItem(key: string) {
    setItems((list) => (list.length > 1 ? list.filter((i) => i.key !== key) : list))
  }

  const toast = useToast()
  async function submit() {
    if (!nombre.trim()) {
      toast.error('Falta el cliente', 'Ingresá el nombre o razón social.')
      return
    }
    const validos = items
      .filter((i) => i.descripcion.trim() && i.cantidad > 0)
      .map((i) => ({
        descripcion: i.descripcion.trim(),
        cantidad: i.cantidad,
        precioUnitario: i.precioUnitario,
        productoId: i.productoId,
      }))
    if (validos.length === 0) {
      toast.error('Sin ítems', 'Agregá al menos un ítem con descripción y cantidad.')
      return
    }
    await onSubmit({
      fecha: toISO(fechaEmision),
      vencimiento: toISO(vencimiento),
      cliente: { nombre: nombre.trim(), docTipo, docNumero: docNumero.trim(), condicion },
      items: validos,
      estado: pagada ? 'pagada' : 'pendiente',
      observaciones: observaciones.trim() || undefined,
    })
  }

  return (
    <Modal open={open} onClose={onClose} size="xl">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold text-ink-950">Nueva factura</h2>
          <p className="text-xs text-ink-400">{cuenta.nombre} · {CONDICION_CORTA[cuenta.condicion]}</p>
        </div>
        <span className="flex items-center gap-2 rounded-xl bg-ink-950 px-3 py-1.5 text-sm font-semibold text-on-ink">
          Comprobante {tipo}
        </span>
      </div>

      <div className="space-y-5 overflow-y-auto px-5 py-5">
        {/* Cliente */}
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-400">Cliente</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Nombre / razón social">
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Juan Pérez" />
            </Campo>
            <Campo label="Condición fiscal">
              <Select
                options={condicionOptions}
                value={condicion}
                onChange={(v) => {
                  const c = v as CondicionFiscal
                  setCondicion(c)
                  setDocTipo(c === 'responsable_inscripto' ? 'CUIT' : 'DNI')
                }}
              />
            </Campo>
            <Campo label="Tipo de documento">
              <Select
                options={[
                  { value: 'DNI', label: 'DNI' },
                  { value: 'CUIT', label: 'CUIT' },
                ]}
                value={docTipo}
                onChange={(v) => setDocTipo(v as 'CUIT' | 'DNI')}
              />
            </Campo>
            <Campo label="Número de documento">
              <Input value={docNumero} onChange={(e) => setDocNumero(e.target.value)} placeholder="30-12345678-9" />
            </Campo>
          </div>
        </section>

        {/* Fechas */}
        <section className="grid gap-3 sm:grid-cols-2">
          <Campo label="Fecha de emisión">
            <Input type="date" value={fechaEmision} onChange={(e) => setFechaEmision(e.target.value)} />
          </Campo>
          <Campo label="Vencimiento">
            <Input type="date" value={vencimiento} onChange={(e) => setVencimiento(e.target.value)} />
          </Campo>
        </section>

        {/* Ítems */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-400">Ítems</h3>
            <Button type="button" variant="ghost" size="sm" onClick={addBlank}>
              <Plus className="h-4 w-4" />
              Ítem manual
            </Button>
          </div>

          <Select
            options={productoOptions}
            value=""
            searchable
            placeholder="Agregar producto del inventario…"
            onChange={(v) => v && addFromProducto(v)}
          />

          <div className="space-y-2.5">
            {items.map((it) => (
              <div key={it.key} className="rounded-xl border border-line p-3">
                <Input
                  value={it.descripcion}
                  onChange={(e) => updateItem(it.key, { descripcion: e.target.value })}
                  placeholder="Descripción del ítem"
                />
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-ink-400">
                    Cant.
                    <Input
                      type="number"
                      min={1}
                      value={it.cantidad}
                      onChange={(e) => updateItem(it.key, { cantidad: Number(e.target.value) })}
                      className="h-9 w-16 px-2 text-center"
                    />
                  </label>
                  <span className="text-ink-300">×</span>
                  <label className="flex flex-1 items-center gap-1.5 text-xs text-ink-400">
                    P. unit.
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={it.precioUnitario}
                      onChange={(e) => updateItem(it.key, { precioUnitario: Number(e.target.value) })}
                      className="h-9"
                    />
                  </label>
                  <span className="tnum w-28 text-right text-sm font-semibold text-ink-900">
                    {money(it.cantidad * it.precioUnitario)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeItem(it.key)}
                    aria-label="Quitar ítem"
                    className="grid h-9 w-9 place-items-center rounded-xl text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900 disabled:opacity-30"
                    disabled={items.length <= 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Observaciones */}
        <Campo label="Observaciones (opcional)">
          <Textarea
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            placeholder="Notas internas, forma de pago, etc."
          />
        </Campo>

        {/* Totales */}
        <div className="ml-auto w-full max-w-xs space-y-1.5 text-sm">
          {tipo !== 'C' && (
            <>
              <Linea label="Neto" value={money(totales.neto)} />
              <Linea label={`IVA (${Math.round(IVA_RATE * 100)}%)`} value={money(totales.iva)} />
            </>
          )}
          <div className="flex items-center justify-between border-t border-line pt-2 text-base font-semibold text-ink-950">
            <span>Total</span>
            <span className="tnum">{money(totales.total)}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-600">
          <input
            type="checkbox"
            checked={pagada}
            onChange={(e) => setPagada(e.target.checked)}
            className="h-4 w-4 rounded border-line-strong accent-ink-950"
          />
          Marcar como cobrada
        </label>
        <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" onClick={submit} disabled={saving}>
            {saving ? 'Emitiendo…' : `Emitir factura ${tipo}`}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ===== Nueva cuenta =====

function NuevaCuentaModal({
  open,
  saving,
  onClose,
  onSubmit,
}: {
  open: boolean
  saving: boolean
  onClose: () => void
  onSubmit: (payload: { nombre: string; condicion: CondicionEmisor; cuit: string; puntoVenta: number }) => Promise<void>
}) {
  const [nombre, setNombre] = useState('')
  const [condicion, setCondicion] = useState<CondicionEmisor>('responsable_inscripto')
  const [cuit, setCuit] = useState('')
  const [puntoVenta, setPuntoVenta] = useState(1)
  const toast = useToast()

  useEffect(() => {
    if (!open) return
    setNombre('')
    setCondicion('responsable_inscripto')
    setCuit('')
    setPuntoVenta(1)
  }, [open])

  async function submit() {
    if (!nombre.trim()) {
      toast.error('Falta el nombre', 'Ingresá la razón social de la cuenta.')
      return
    }
    await onSubmit({ nombre: nombre.trim(), condicion, cuit: cuit.trim(), puntoVenta: Number(puntoVenta) || 1 })
  }

  return (
    <Modal open={open} onClose={onClose} size="md">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-lg font-semibold text-ink-950">Nueva cuenta</h2>
        <p className="text-xs text-ink-400">Un punto de venta con su condición fiscal.</p>
      </div>
      <div className="space-y-4 overflow-y-auto px-5 py-5">
        <Campo label="Nombre / razón social">
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="CelTuc S.R.L." />
        </Campo>
        <Campo label="Condición fiscal">
          <Select
            options={[
              { value: 'responsable_inscripto', label: 'Responsable Inscripto' },
              { value: 'monotributista', label: 'Monotributista' },
            ]}
            value={condicion}
            onChange={(v) => setCondicion(v as CondicionEmisor)}
          />
        </Campo>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="CUIT">
            <Input value={cuit} onChange={(e) => setCuit(e.target.value)} placeholder="30-71456789-3" />
          </Campo>
          <Campo label="Punto de venta">
            <Input
              type="number"
              min={1}
              value={puntoVenta}
              onChange={(e) => setPuntoVenta(Number(e.target.value))}
            />
          </Campo>
        </div>
        <p className="rounded-xl bg-ink-50 px-4 py-3 text-xs text-ink-500">
          {condicion === 'responsable_inscripto'
            ? 'Emitirá Factura A (a Responsables Inscriptos) o B (a consumidor final y otros).'
            : 'Emitirá Factura C (sin IVA discriminado).'}
        </p>
      </div>
      <div className="flex flex-col-reverse gap-2.5 border-t border-line px-5 py-4 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="button" onClick={submit} disabled={saving}>
          {saving ? 'Creando…' : 'Crear cuenta'}
        </Button>
      </div>
    </Modal>
  )
}

// ===== Auxiliares de UI =====

function IconBtn({
  children,
  label,
  onClick,
}: {
  children: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-9 w-9 place-items-center rounded-xl text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
    >
      {children}
    </button>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-ink-500">{label}</label>
      {children}
    </div>
  )
}

function Dato({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-ink-400">{label}</p>
      <div className="mt-0.5 font-medium text-ink-900">{value}</div>
    </div>
  )
}

function Linea({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-ink-600">
      <span>{label}</span>
      <span className="tnum">{value}</span>
    </div>
  )
}

function ListaSkeleton() {
  return (
    <Card className="overflow-hidden">
      <div className="divide-y divide-line">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-5 py-4">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3 w-1/4" />
            </div>
            <Skeleton className="h-5 w-24" />
          </div>
        ))}
      </div>
    </Card>
  )
}

// ===== Helpers de fecha (input date) =====

function hoyInput(): string {
  return new Date().toISOString().slice(0, 10)
}
function addDaysInput(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
function toISO(input: string): string {
  const d = new Date(`${input}T00:00:00`)
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}
