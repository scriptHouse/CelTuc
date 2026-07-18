import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CalendarClock,
  Contact,
  IdCard,
  Loader2,
  Pencil,
  Phone,
  ReceiptText,
  Search,
  ShoppingBag,
  Trash2,
  Wallet,
  X,
} from 'lucide-react'
import type { Cliente, CompraCliente } from '@/types'
import {
  actualizarCliente,
  type ClienteInput,
  eliminarCliente,
  listarClientes,
  obtenerCliente,
} from '@/services/facturacion'
import { ApiError } from '@/lib/api'
import { fecha, money, money0, moneyCompact } from '@/lib/format'
import { ctStagger } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ToastProvider'
import { useConfirm } from '@/components/ConfirmProvider'

const CONDICION_LABEL: Record<string, string> = {
  responsable_inscripto: 'Responsable Inscripto',
  monotributista: 'Monotributista',
  consumidor_final: 'Consumidor Final',
  exento: 'Exento',
}
const DOC_LABEL: Record<string, string> = { CUIT: 'CUIT', CUIL: 'CUIL', DNI: 'DNI', CF: 'Consumidor Final' }
const ESTADO_LABEL: Record<string, string> = { pendiente: 'Pendiente', pagada: 'Pagada' }

const CONDICION_OPTIONS = [
  { value: 'consumidor_final', label: 'Consumidor Final' },
  { value: 'responsable_inscripto', label: 'Responsable Inscripto' },
  { value: 'monotributista', label: 'Monotributista' },
  { value: 'exento', label: 'Exento' },
]

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  const a = partes[0]?.[0] ?? ''
  const b = partes.length > 1 ? partes[partes.length - 1][0] : ''
  return (a + b).toUpperCase() || 'C'
}

/** Documento o teléfono, lo que identifique al cliente (para el subtítulo). */
function identidad(c: Cliente): string {
  if (c.doc_numero) return `${DOC_LABEL[c.doc_tipo] ?? 'Doc'} ${c.doc_numero}`
  if (c.telefono) return c.telefono
  return CONDICION_LABEL[c.condicion] ?? '—'
}

export function ClientesPage() {
  const [busqueda, setBusqueda] = useState('')
  const [selId, setSelId] = useState<number | null>(null)

  const { data: clientes = [], isLoading } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => listarClientes(),
  })

  const resumen = useMemo(() => {
    let compras = 0
    let total = 0
    for (const c of clientes) {
      compras += c.cantidad_compras ?? 0
      total += c.total_gastado ?? 0
    }
    return { clientes: clientes.length, compras, total }
  }, [clientes])

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return clientes
    const dig = q.replace(/\D/g, '')
    return clientes.filter(
      (c) =>
        c.nombre.toLowerCase().includes(q) ||
        c.telefono.toLowerCase().includes(q) ||
        (!!dig && (c.doc_numero.includes(dig) || c.telefono.includes(dig))),
    )
  }, [clientes, busqueda])

  return (
    <div className="animate-fade-in">
      <PageHeader
        icon={Contact}
        eyebrow="Facturación"
        title="Clientes"
        subtitle="Tu base de clientes y las compras que hizo cada uno."
        className="ct-rise"
      />

      <div className="mb-5 grid grid-cols-3 gap-3">
        <StatCard className="ct-stagger-item" style={ctStagger(0)} label="Clientes" value={String(resumen.clientes)} icon={Contact} />
        <StatCard className="ct-stagger-item" style={ctStagger(1)} label="Compras" value={String(resumen.compras)} icon={ReceiptText} />
        <StatCard className="ct-stagger-item" style={ctStagger(2)} label="Facturado" value={moneyCompact(resumen.total)} icon={Wallet} />
      </div>

      <div className="ct-rise relative mb-4">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, teléfono o documento"
          className="pl-10"
        />
      </div>

      {isLoading ? (
        <GridSkeleton />
      ) : clientes.length === 0 ? (
        <EmptyState
          icon={Contact}
          title="Todavía no hay clientes"
          description="La base se arma sola: cada factura que emitas guarda a su cliente acá."
        />
      ) : filtrados.length === 0 ? (
        <EmptyState icon={Search} title="Sin resultados" description="Ningún cliente coincide con la búsqueda." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtrados.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelId(c.id)}
              style={ctStagger(i)}
              className="ct-stagger-item flex flex-col rounded-2xl border border-line bg-surface p-4 text-left transition-colors hover:border-ink-300 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
            >
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-ink-100 text-sm font-bold text-ink-900">
                  {iniciales(c.nombre)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink-900">{c.nombre}</p>
                  <p className="flex items-center gap-1.5 truncate text-sm text-ink-500">
                    {c.doc_numero ? <IdCard className="h-3.5 w-3.5 shrink-0" /> : <Phone className="h-3.5 w-3.5 shrink-0" />}
                    <span className="truncate">{identidad(c)}</span>
                  </p>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3">
                <Metrica label="Compras" valor={String(c.cantidad_compras ?? 0)} />
                <Metrica label="Total" valor={moneyCompact(c.total_gastado ?? 0)} />
                <Metrica label="Última" valor={c.ultima_compra ? fecha(c.ultima_compra) : '—'} />
              </div>
            </button>
          ))}
        </div>
      )}

      <ClienteDetalleModal id={selId} onClose={() => setSelId(null)} />
    </div>
  )
}

function Metrica({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="min-w-0 text-center">
      <p className="truncate text-sm font-semibold tabular-nums text-ink-900">{valor}</p>
      <p className="text-[0.7rem] uppercase tracking-[0.08em] text-ink-400">{label}</p>
    </div>
  )
}

// ===== Detalle del cliente (info + editar + compras) =====

function ClienteDetalleModal({ id, onClose }: { id: number | null; onClose: () => void }) {
  const open = id !== null
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const [editando, setEditando] = useState(false)

  const { data: cliente, isLoading } = useQuery({
    queryKey: ['cliente', id],
    queryFn: () => obtenerCliente(id as number),
    enabled: open,
  })

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ['clientes'] })
    queryClient.invalidateQueries({ queryKey: ['cliente', id] })
  }

  const guardar = useMutation({
    mutationFn: (input: ClienteInput) => actualizarCliente(id as number, input),
    onSuccess: () => {
      toast.success('Cliente actualizado')
      setEditando(false)
      invalidar()
    },
    onError: (e) => toast.error('No se pudo guardar', e instanceof ApiError ? e.message : undefined),
  })

  const borrar = useMutation({
    mutationFn: () => eliminarCliente(id as number),
    onSuccess: () => {
      toast.success('Cliente eliminado', 'Sus facturas no se tocaron.')
      invalidar()
      onClose()
    },
    onError: (e) => toast.error('No se pudo eliminar', e instanceof ApiError ? e.message : undefined),
  })

  function cerrar() {
    setEditando(false)
    onClose()
  }

  async function handleEliminar() {
    if (!cliente) return
    const ok = await confirm({
      title: `¿Eliminar a ${cliente.nombre}?`,
      description: 'Se saca de la base de clientes. Sus facturas ya emitidas NO se modifican.',
      confirmLabel: 'Eliminar',
      tone: 'danger',
    })
    if (ok) borrar.mutate()
  }

  return (
    <Modal open={open} onClose={cerrar} size="xl">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink-100 text-ink-900">
            <Contact className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold leading-tight text-ink-950">
              {cliente ? cliente.nombre : 'Cliente'}
            </h2>
            <p className="text-xs text-ink-400">Datos del cliente y su historial de compras.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={cerrar}
          aria-label="Cerrar"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="space-y-5 overflow-y-auto px-5 py-5">
        {isLoading || !cliente ? (
          <>
            <Skeleton className="h-28 w-full rounded-2xl" />
            <Skeleton className="h-40 w-full rounded-2xl" />
          </>
        ) : (
          <>
            {/* Ficha del cliente */}
            {editando ? (
              <EditarCliente
                cliente={cliente}
                saving={guardar.isPending}
                onCancelar={() => setEditando(false)}
                onGuardar={(input) => guardar.mutate(input)}
              />
            ) : (
              <div className="rounded-2xl border border-line bg-canvas/40 p-4">
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                  <Dato label="Teléfono" valor={cliente.telefono || '—'} />
                  <Dato
                    label={cliente.doc_numero ? DOC_LABEL[cliente.doc_tipo] ?? 'Documento' : 'Documento'}
                    valor={cliente.doc_numero || '—'}
                  />
                  <Dato label="Condición" valor={CONDICION_LABEL[cliente.condicion] ?? cliente.condicion} />
                  <Dato label="Total gastado" valor={money0(cliente.resumen.total)} />
                </div>
                <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-line pt-3">
                  <p className="text-xs text-ink-400">
                    {cliente.resumen.cantidad} compra{cliente.resumen.cantidad === 1 ? '' : 's'}
                    {cliente.resumen.ultima ? ` · última el ${fecha(cliente.resumen.ultima)}` : ''}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setEditando(true)}>
                      <Pencil className="h-4 w-4" /> Editar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleEliminar} disabled={borrar.isPending}>
                      <Trash2 className="h-4 w-4" /> Eliminar
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Historial de compras */}
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-ink-400">
                Compras {cliente.compras.length > 0 && `(${cliente.compras.length})`}
              </h3>
              {cliente.compras.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-line-strong px-4 py-8 text-center text-sm text-ink-400">
                  Todavía no tiene compras registradas.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {cliente.compras.map((compra) => (
                    <CompraCard key={compra.id} compra={compra} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

function CompraCard({ compra }: { compra: CompraCliente }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
            <ShoppingBag className="h-3.5 w-3.5 shrink-0 text-ink-400" />
            Factura {compra.tipo} · {compra.numero_formateado}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-400">
            <CalendarClock className="h-3.5 w-3.5 shrink-0" />
            {fecha(compra.fecha)} · {compra.emisor_nombre}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold tabular-nums text-ink-900">{money(compra.total)}</p>
          <Badge tone={compra.estado_cobro === 'pagada' ? 'solid' : 'outline'}>
            {ESTADO_LABEL[compra.estado_cobro] ?? compra.estado_cobro}
          </Badge>
        </div>
      </div>

      <ul className="mt-2.5 space-y-1 border-t border-line pt-2.5">
        {compra.items.map((it, idx) => (
          <li key={it.id ?? idx} className="flex items-baseline justify-between gap-3 text-xs">
            <span className="min-w-0 truncate text-ink-600">
              <span className="tabular-nums text-ink-400">{it.cantidad}×</span> {it.descripcion}
            </span>
            <span className="shrink-0 tabular-nums text-ink-500">
              {money(it.subtotal ?? it.cantidad * it.precio_unitario)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function EditarCliente({
  cliente,
  saving,
  onCancelar,
  onGuardar,
}: {
  cliente: Cliente
  saving: boolean
  onCancelar: () => void
  onGuardar: (input: ClienteInput) => void
}) {
  const [nombre, setNombre] = useState(cliente.nombre)
  const [telefono, setTelefono] = useState(cliente.telefono)
  const [condicion, setCondicion] = useState<string>(cliente.condicion)

  return (
    <div className="rounded-2xl border border-line bg-canvas/40 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-500">Nombre / razón social</label>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-500">Teléfono / celular</label>
          <div className="relative">
            <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="tel" className="pl-10" />
          </div>
        </div>
        <div className="sm:col-span-2">
          <Select label="Condición fiscal" options={CONDICION_OPTIONS} value={condicion} onChange={setCondicion} />
        </div>
      </div>
      <div className="mt-3.5 flex items-center justify-end gap-2 border-t border-line pt-3">
        <Button variant="outline" size="sm" onClick={onCancelar} disabled={saving}>
          Cancelar
        </Button>
        <Button
          size="sm"
          onClick={() => onGuardar({ nombre: nombre.trim(), telefono: telefono.trim(), condicion })}
          disabled={saving || !nombre.trim()}
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Guardando…
            </>
          ) : (
            'Guardar'
          )}
        </Button>
      </div>
    </div>
  )
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[0.7rem] uppercase tracking-[0.08em] text-ink-400">{label}</p>
      <p className="truncate text-sm font-medium text-ink-900">{valor}</p>
    </div>
  )
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-11 w-11 rounded-2xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <Skeleton className="mt-4 h-10 w-full" />
        </div>
      ))}
    </div>
  )
}
