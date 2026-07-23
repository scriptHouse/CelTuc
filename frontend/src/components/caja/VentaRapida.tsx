import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Banknote, FileCheck2, Loader2, Lock, Minus, Plus, ShoppingCart, Trash2, Wallet } from 'lucide-react'
import type { CajaRegistradora, ProductoCatalogo } from '@/types'
import { listarProductos } from '@/services/productos'
import {
  listarStock,
  listarSucursales,
  listarVentas,
  registrarVenta,
  type FacturacionVenta,
  type FormaPago,
} from '@/services/inventario'
import { FACTURACIONES, cajaParaFacturacion } from '@/components/caja/medios'
import { guardarBorradorFacturaVenta } from '@/lib/borradorFactura'
import { puedeVer } from '@/lib/permisos'
import { useAuth } from '@/store/auth'
import { useConfirm } from '@/components/ConfirmProvider'
import { ApiError } from '@/lib/api'
import { money, money0, num, tiempoRelativo } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ToastProvider'

/**
 * Venta rápida (mostrador), todo backend real: registrar una venta descuenta
 * el stock del Inventario al instante (kardex "Venta #N") Y entra sola al
 * arqueo del turno abierto de la caja seleccionada — una sola carga para las
 * dos cosas. El botón va en VERDE: es la puerta de entrada de la plata.
 */

interface Linea {
  key: string
  producto: ProductoCatalogo
  cantidad: number
  precio: number
}

let _clave = 0
const claveNueva = () => `lv-${_clave++}`

const FORMAS: Array<{ value: FormaPago; label: string }> = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'otro', label: 'Otro' },
]

export function VentaRapida({
  cajaId,
  cajas = [],
  cajasAbiertas = [],
}: {
  cajaId?: string
  /** Cajas del local (con su canal fiscal) para mostrar a dónde va la plata. */
  cajas?: CajaRegistradora[]
  /** Ids de cajas con turno abierto (para avisar si la de destino está cerrada). */
  cajasAbiertas?: string[]
}) {
  const [abierta, setAbierta] = useState(false)

  // Sin permiso de inventario (la API responde 403) el modulito no se muestra:
  // la venta necesita poder descontar stock.
  const { data: sucursales = [], isError } = useQuery({
    queryKey: ['inv-sucursales'],
    queryFn: listarSucursales,
    retry: false,
  })
  const { data: ventas = [] } = useQuery({
    queryKey: ['inv-ventas'],
    queryFn: () => listarVentas({ limite: 30 }),
    enabled: !isError,
    retry: false,
  })

  const hoy = useMemo(() => {
    const ahora = new Date()
    const deHoy = ventas.filter((v) => {
      const f = new Date(v.creado)
      return (
        f.getFullYear() === ahora.getFullYear() &&
        f.getMonth() === ahora.getMonth() &&
        f.getDate() === ahora.getDate()
      )
    })
    return { cantidad: deHoy.length, total: deHoy.reduce((a, v) => a + Number(v.total), 0), ultimas: deHoy.slice(0, 3) }
  }, [ventas])

  if (isError || sucursales.length === 0) return null

  return (
    <>
      <Card className="ct-rise mb-5 overflow-hidden">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4 sm:px-5">
          <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-600/10 text-emerald-700 ring-1 ring-emerald-600/25 dark:text-emerald-400">
            <ShoppingCart className="h-5 w-5" strokeWidth={1.75} />
            <span aria-hidden className="absolute -right-0.5 -top-0.5 inline-flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink-900">
              Venta de mostrador
              <span className="ml-2 align-middle text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-emerald-700 dark:text-emerald-400">
                descuenta stock · entra al arqueo
              </span>
            </p>
            <p className="tnum truncate text-xs text-ink-400">
              {hoy.cantidad === 0
                ? 'Hoy todavía no hay ventas registradas.'
                : `Hoy: ${num(hoy.cantidad)} ${hoy.cantidad === 1 ? 'venta' : 'ventas'} · ${money0(hoy.total)}`}
              {hoy.ultimas[0] &&
                ` · última ${tiempoRelativo(hoy.ultimas[0].creado)} (${money0(Number(hoy.ultimas[0].total))} en ${hoy.ultimas[0].sucursal_nombre})`}
            </p>
          </div>
          <Button
            onClick={() => setAbierta(true)}
            className="bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-700 focus-visible:ring-emerald-600"
          >
            <Plus className="h-4 w-4" />
            Registrar venta
          </Button>
        </div>
      </Card>

      <VentaModal
        abierta={abierta}
        onCerrar={() => setAbierta(false)}
        sucursales={sucursales}
        cajaId={cajaId}
        cajas={cajas}
        cajasAbiertas={cajasAbiertas}
      />
    </>
  )
}

function VentaModal({
  abierta,
  onCerrar,
  sucursales,
  cajaId,
  cajas,
  cajasAbiertas,
}: {
  abierta: boolean
  onCerrar: () => void
  sucursales: Array<{ id: number; nombre: string; activa: boolean; orden: number }>
  cajaId?: string
  cajas: CajaRegistradora[]
  cajasAbiertas: string[]
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const usuario = useAuth((s) => s.usuario)

  const activas = useMemo(
    () => sucursales.filter((s) => s.activa).sort((a, b) => a.orden - b.orden || a.id - b.id),
    [sucursales],
  )

  const { data: catalogo = [] } = useQuery({
    queryKey: ['productos-items'],
    queryFn: listarProductos,
    enabled: abierta,
    retry: false,
  })
  const { data: stock = [] } = useQuery({
    queryKey: ['inv-stock'],
    queryFn: listarStock,
    enabled: abierta,
    retry: false,
  })

  const [sucursalId, setSucursalId] = useState<number | null>(null)
  const [formaPago, setFormaPago] = useState<FormaPago>('efectivo')
  const [facturacion, setFacturacion] = useState<FacturacionVenta>('sin_factura')
  const [lineas, setLineas] = useState<Linea[]>([])
  const [nota, setNota] = useState('')
  const [buscar, setBuscar] = useState('')

  useEffect(() => {
    if (!abierta) return
    // Arranca en la sucursal del empleado logueado (si está activa) para no
    // descontar stock del local equivocado; los botones permiten cambiarla.
    const propia = usuario?.sucursal?.id
    setSucursalId(
      propia != null && activas.some((s) => s.id === propia)
        ? propia
        : (activas[0]?.id ?? null),
    )
    setFormaPago('efectivo')
    setFacturacion('sin_factura')
    setLineas([])
    setNota('')
    setBuscar('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierta])

  // La caja que recibe la plata según cómo se factura (si hay cajas con canal).
  const cajaDestino = cajaParaFacturacion(cajas, facturacion)
  const destinoAbierto = cajaDestino !== null && cajasAbiertas.includes(cajaDestino.id)

  const stockDe = useMemo(() => {
    const mapa = new Map<string, number>()
    for (const fila of stock) mapa.set(`${fila.producto}-${fila.sucursal}`, fila.cantidad)
    return mapa
  }, [stock])
  const disponibles = (productoId: number) =>
    sucursalId === null ? 0 : (stockDe.get(`${productoId}-${sucursalId}`) ?? 0)

  /** Precio sugerido: cash para efectivo/transferencia (si existe), lista para el resto. */
  const precioSugerido = (p: ProductoCatalogo, forma: FormaPago) => {
    const cash = p.efectivo?.cash_ars
    const lista = p.efectivo?.lista_ars
    if ((forma === 'efectivo' || forma === 'transferencia') && cash != null) return Number(cash)
    return lista != null ? Number(lista) : 0
  }

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
        { key: claveNueva(), producto, cantidad: 1, precio: precioSugerido(producto, formaPago) },
      ]
    })
    setBuscar('')
  }

  const total = lineas.reduce((a, l) => a + l.cantidad * (Number.isFinite(l.precio) ? l.precio : 0), 0)
  const hayFaltantes = sucursalId !== null && lineas.some((l) => l.cantidad > disponibles(l.producto.id))

  const guardar = useMutation({
    mutationFn: (permitirFaltante: boolean) => {
      if (sucursalId === null) throw new ApiError(0, 'Elegí la sucursal.', null)
      if (lineas.length === 0) throw new ApiError(0, 'Agregá al menos un producto.', null)
      if (lineas.some((l) => !Number.isFinite(l.precio) || l.precio < 0)) {
        throw new ApiError(0, 'Revisá los precios: tienen que ser 0 o más.', null)
      }
      return registrarVenta({
        sucursal: sucursalId,
        forma_pago: formaPago,
        facturacion,
        nota: nota.trim(),
        caja: cajaId ? Number(cajaId) : undefined,
        permitir_faltante: permitirFaltante || undefined,
        items: lineas.map((l) => ({
          producto: l.producto.id,
          cantidad: l.cantidad,
          precio_unitario: l.precio,
        })),
      })
    },
    onSuccess: async (venta) => {
      queryClient.invalidateQueries({ queryKey: ['inv-stock'] })
      queryClient.invalidateQueries({ queryKey: ['inv-ventas'] })
      queryClient.invalidateQueries({ queryKey: ['inv-movimientos'] })
      queryClient.invalidateQueries({ queryKey: ['caja'] })
      const arqueo = venta.movimiento_caja
        ? venta.caja_arqueo
          ? ` y anotada en «${venta.caja_arqueo}»`
          : ' y anotada en el arqueo'
        : ''
      toast.success(
        `Venta #${venta.id} registrada`,
        `${money0(Number(venta.total))} en ${venta.sucursal_nombre} — stock descontado${arqueo}.`,
      )
      if (!venta.movimiento_caja) {
        toast.info('La venta no entró en ningún arqueo', venta.aviso_caja ?? 'No hay un turno de caja abierto.')
      }
      onCerrar()

      // Venta marcada como facturable: ofrecemos emitir la factura YA, en el
      // módulo Facturación de siempre (mismo modal, mismas validaciones, mismo
      // ARCA) con los ítems precargados. Solo si la cuenta puede facturar.
      if (venta.facturacion !== 'sin_factura' && puedeVer(usuario, 'ver_facturacion')) {
        const esRI = venta.facturacion === 'factura_ri'
        const ok = await confirm({
          title: '¿Emitir la factura ahora?',
          icon: FileCheck2,
          confirmLabel: 'Facturar ahora',
          cancelLabel: 'Después',
          description: `La venta #${venta.id} ya quedó registrada. Te llevo a Facturación con los ítems precargados para emitir la ${esRI ? 'Factura A/B (Responsable Inscripto)' : 'Factura C (Monotributo)'} con CAE, como siempre.`,
        })
        if (ok) {
          guardarBorradorFacturaVenta({
            ventaId: venta.id,
            emisorCondicion: esRI ? 'responsable_inscripto' : 'monotributista',
            items: lineas.map((l) => ({
              descripcion: [l.producto.nombre, l.producto.calidad].filter(Boolean).join(' · '),
              cantidad: l.cantidad,
              precioFinal: Number.isFinite(l.precio) ? l.precio : 0,
            })),
            observaciones: `Venta de mostrador #${venta.id}`,
          })
          navigate('/facturacion')
        }
      }
    },
    onError: (e) =>
      toast.error('No se pudo registrar', e instanceof ApiError ? e.message : undefined),
  })

  /** La venta NUNCA se bloquea por stock: con faltante solo se pide confirmar. */
  async function handleRegistrar() {
    if (hayFaltantes) {
      const faltantes = lineas.filter((l) => l.cantidad > disponibles(l.producto.id))
      const ok = await confirm({
        title: 'Stock insuficiente según el sistema',
        tone: 'warning',
        icon: AlertTriangle,
        confirmLabel: 'Registrar la venta igual',
        cancelLabel: 'Revisar',
        description: (
          <span className="block space-y-2.5">
            <span className="block">
              Estás vendiendo más unidades de las que figuran en stock:
            </span>
            <span className="block space-y-1 rounded-xl bg-ink-50 px-3.5 py-2.5 text-left">
              {faltantes.map((l) => (
                <span key={l.key} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate">{l.producto.nombre}</span>
                  <span className="tnum shrink-0 font-medium text-ink-900">
                    quedan {num(disponibles(l.producto.id))} · vendés {num(l.cantidad)}
                  </span>
                </span>
              ))}
            </span>
            <span className="block">
              La venta se registra <b>igual</b> y el stock queda en negativo, para
              corregir después el conteo en Inventario.
            </span>
          </span>
        ),
      })
      if (!ok) return
    }
    guardar.mutate(hayFaltantes)
  }

  return (
    <Modal open={abierta} onClose={onCerrar} size="xl" labelledBy="venta-rapida-titulo">
      <div className="border-b border-line px-5 py-4">
        <h2 id="venta-rapida-titulo" className="text-lg font-semibold text-ink-950">
          Registrar venta
        </h2>
        <p className="text-xs text-ink-400">
          Descuenta el stock al instante y queda en el historial con tu usuario.
        </p>
      </div>

      <div className="max-h-[72vh] space-y-4 overflow-y-auto px-5 py-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-500">Sucursal</label>
            <div className="flex flex-wrap gap-2">
              {activas.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={sucursalId === s.id}
                  onClick={() => setSucursalId(s.id)}
                  className={cn(
                    'h-9 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900',
                    sucursalId === s.id
                      ? 'bg-ink-950 text-on-ink'
                      : 'border border-line-strong bg-surface text-ink-600 hover:bg-ink-50',
                  )}
                >
                  {s.nombre}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-500">Forma de pago</label>
            <Select
              options={FORMAS}
              value={formaPago}
              onChange={(v) => setFormaPago(v as FormaPago)}
            />
            <p className="mt-1 text-xs text-ink-400">
              Con efectivo/transferencia se sugiere el precio cash; con tarjeta, el de lista.
            </p>
          </div>
        </div>

        {/* Cómo se factura: decide sola a qué caja entra la plata. */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-500">¿Cómo se factura?</label>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Cómo se factura">
            {FACTURACIONES.map((f) => {
              const activa = facturacion === f.value
              const Icono = f.icono
              return (
                <button
                  key={f.value}
                  type="button"
                  role="radio"
                  aria-checked={activa}
                  onClick={() => setFacturacion(f.value)}
                  className={cn(
                    'flex flex-col items-start gap-0.5 rounded-2xl border px-3 py-2.5 text-left transition-all duration-150',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900',
                    activa
                      ? 'border-ink-950 bg-ink-950 text-on-ink shadow-[0_6px_14px_rgba(10,10,11,0.16)]'
                      : 'border-line-strong bg-surface text-ink-700 hover:border-ink-300 hover:bg-ink-50',
                  )}
                >
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
                    <Icono className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                    {f.label}
                  </span>
                  <span className={cn('text-[0.68rem]', activa ? 'text-on-ink/70' : 'text-ink-400')}>
                    {f.hint}
                  </span>
                </button>
              )
            })}
          </div>
          {cajaDestino && (
            <p
              className={cn(
                'mt-2 inline-flex items-center gap-1.5 text-xs',
                destinoAbierto ? 'text-ink-500' : 'font-medium text-amber-700 dark:text-amber-400',
              )}
            >
              {destinoAbierto ? (
                <Wallet className="h-3.5 w-3.5 shrink-0" aria-hidden />
              ) : (
                <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
              )}
              {destinoAbierto
                ? <>La plata entra al arqueo de <b>«{cajaDestino.nombre}»</b>.</>
                : <>La caja <b>«{cajaDestino.nombre}»</b> está cerrada: abrila para que la venta entre a su arqueo.</>}
            </p>
          )}
        </div>

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

        {lineas.length > 0 && (
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {lineas.map((linea) => {
              const enStock = disponibles(linea.producto.id)
              const falta = linea.cantidad > enStock
              return (
                <li key={linea.key} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:px-4">
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="truncate text-sm font-medium text-ink-900">{linea.producto.nombre}</p>
                    <p className={cn('tnum text-xs', falta ? 'font-semibold text-ink-950' : 'text-ink-400')}>
                      {sucursalId !== null && `quedan ${num(enStock)}`}
                      {falta && ' — no alcanza'}
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
              )
            })}
          </ul>
        )}

        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-500">Nota (opcional)</label>
            <Input
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder='Ej: "cliente del 13 Pro, retira 18hs"'
              maxLength={200}
            />
          </div>
          <div className="text-right">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-400">Total</p>
            <p className="tnum text-2xl font-bold tracking-tight text-ink-950">{money0(total)}</p>
          </div>
        </div>

        {hayFaltantes && (
          <p className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-800 ring-1 ring-amber-500/25 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              Hay cantidades por encima del stock que figura. La venta se puede registrar
              igual: te pedimos una confirmación y el stock queda en negativo.
            </span>
          </p>
        )}

        <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleRegistrar}
            disabled={guardar.isPending || lineas.length === 0 || sucursalId === null}
            className="bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-700 focus-visible:ring-emerald-600"
          >
            {guardar.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Banknote className="h-4 w-4" />
                Registrar venta
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
