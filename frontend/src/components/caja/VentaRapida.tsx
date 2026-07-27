import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Banknote,
  FileCheck2,
  IdCard,
  Loader2,
  Lock,
  Mail,
  Minus,
  Phone,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  UserRound,
  Wallet,
  Wrench,
  X,
} from 'lucide-react'
import type { CajaRegistradora, Cliente, ProductoCatalogo, SeccionPreciosService } from '@/types'
import { buscarClientes } from '@/services/facturacion'
import { listarSecciones } from '@/services/preciosService'
import { listarProductos } from '@/services/productos'
import {
  listarStock,
  listarSucursales,
  listarVentas,
  registrarVenta,
  type FacturacionVenta,
  type FormaPago,
  type TipoItemVenta,
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

/**
 * Un renglón de la venta. En el mostrador no se cobra solo mercadería: también
 * services del taller (de la lista de precios) y cosas sueltas de texto libre.
 * Solo los de `tipo: 'producto'` descuentan stock.
 */
interface Linea {
  key: string
  tipo: TipoItemVenta
  /** Solo en mercadería: la fila del catálogo (para el stock y el precio). */
  producto?: ProductoCatalogo
  /** Fila de la lista de precios del taller, si el service salió de ahí. */
  itemServiceId?: number
  /** Lo que se cobra, en texto. Editable en los ítems libres. */
  descripcion: string
  cantidad: number
  precio: number
}

let _clave = 0
const claveNueva = () => `lv-${_clave++}`

/** Iniciales para el avatar del cliente elegido (mismo criterio que Clientes). */
function inicialesCliente(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  const a = partes[0]?.[0] ?? ''
  const b = partes.length > 1 ? partes[partes.length - 1][0] : ''
  return (a + b).toUpperCase() || 'C'
}

/** Encuentra la fila (y calidad) elegida en la lista de precios del taller. */
function ubicarService(
  secciones: SeccionPreciosService[],
  idItem: string,
  idVariante: string,
): { itemId: number; descripcion: string; lista: number | null; cash: number | null } | null {
  for (const seccion of secciones) {
    const item = seccion.items.find((i) => String(i.id) === idItem)
    if (!item) continue
    const precio = idVariante ? item.precios.find((p) => String(p.variante) === idVariante) : undefined
    const variante = seccion.variantes.find((v) => String(v.id) === idVariante)?.nombre
    return {
      itemId: item.id,
      descripcion: [seccion.nombre, item.etiqueta, variante].filter(Boolean).join(' · '),
      lista: precio?.efectivo.lista_ars ?? null,
      cash: precio?.efectivo.cash_ars ?? null,
    }
  }
  return null
}

/** Mismo criterio que la mercadería: cash para efectivo/transferencia. */
function precioServicePara(lista: number | null, cash: number | null, forma: FormaPago): number {
  const preferido = forma === 'efectivo' || forma === 'transferencia' ? cash : lista
  return Number(preferido ?? lista ?? cash ?? 0)
}

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
  // Lista de precios del taller. Sin permiso `ver_precios_service` responde 403
  // y el selector de service directamente no se muestra: la venta de mercadería
  // sigue funcionando igual (`retry: false`, mismo criterio que el resto).
  const { data: seccionesService = [], isError: sinService } = useQuery({
    queryKey: ['service-secciones'],
    queryFn: listarSecciones,
    enabled: abierta,
    retry: false,
  })

  const [sucursalId, setSucursalId] = useState<number | null>(null)
  const [formaPago, setFormaPago] = useState<FormaPago>('efectivo')
  const [facturacion, setFacturacion] = useState<FacturacionVenta>('sin_factura')
  const [lineas, setLineas] = useState<Linea[]>([])
  const [nota, setNota] = useState('')
  const [buscar, setBuscar] = useState('')
  const [buscarService, setBuscarService] = useState('')

  // ---- Cliente (opcional): la venta queda en SU historial de compras --------
  // Se puede elegir uno ya guardado (autocompletado) o cargar los datos a mano:
  // el backend lo da de alta con la misma lógica que un cliente de factura.
  const [clienteSel, setClienteSel] = useState<Cliente | null>(null)
  const [clienteNombre, setClienteNombre] = useState('')
  const [clienteTelefono, setClienteTelefono] = useState('')
  const [clienteEmail, setClienteEmail] = useState('')
  const [sugerenciasAbiertas, setSugerenciasAbiertas] = useState(false)
  const [busquedaCliente, setBusquedaCliente] = useState('')
  useEffect(() => {
    const id = setTimeout(() => setBusquedaCliente(clienteNombre.trim()), 250)
    return () => clearTimeout(id)
  }, [clienteNombre])
  // Sin permiso de facturación la búsqueda responde 403: no se muestran
  // sugerencias y los datos se cargan a mano igual (`retry: false`).
  const { data: sugerenciasClientes = [] } = useQuery({
    queryKey: ['venta-clientes', busquedaCliente],
    queryFn: () => buscarClientes(busquedaCliente),
    enabled: abierta && sugerenciasAbiertas && !clienteSel && busquedaCliente.length >= 2,
    retry: false,
  })

  function elegirCliente(c: Cliente) {
    setClienteSel(c)
    setClienteNombre(c.nombre)
    setClienteTelefono(c.telefono || '')
    setClienteEmail(c.email || '')
    setSugerenciasAbiertas(false)
  }

  function quitarCliente() {
    setClienteSel(null)
    setClienteNombre('')
    setClienteTelefono('')
    setClienteEmail('')
    setSugerenciasAbiertas(false)
  }

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
    setBuscarService('')
    quitarCliente()
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

  /**
   * Un renglón por cada fila × calidad de la lista de precios: "Módulos ·
   * iPhone 13 · Original — $180.000". La fila sin precios cargados igual se
   * ofrece (el precio se escribe a mano).
   */
  const opcionesService = useMemo(() => {
    const opciones = [{ value: '', label: 'Buscar service del taller…' }]
    for (const seccion of seccionesService.filter((s) => s.activo)) {
      const variantes = new Map(seccion.variantes.map((v) => [v.id, v.nombre]))
      for (const item of seccion.items.filter((i) => i.activo)) {
        if (item.precios.length === 0) {
          opciones.push({
            value: `${item.id}:`,
            label: `${seccion.nombre} · ${item.etiqueta}`,
          })
          continue
        }
        for (const precio of item.precios) {
          const variante = variantes.get(precio.variante)
          const ars = precio.efectivo.lista_ars ?? precio.efectivo.cash_ars
          opciones.push({
            value: `${item.id}:${precio.variante}`,
            label:
              [seccion.nombre, item.etiqueta, variante].filter(Boolean).join(' · ') +
              (ars != null ? ` — ${money0(Number(ars))}` : ''),
          })
        }
      }
    }
    return opciones
  }, [seccionesService])

  // El selector de service solo aparece si la cuenta puede ver la lista de
  // precios Y hay algo cargado (la primera opción es el placeholder).
  const hayService = !sinService && opcionesService.length > 1

  function agregarLinea(nueva: Omit<Linea, 'key'>) {
    setLineas((previas) => [...previas, { key: claveNueva(), ...nueva }])
  }

  function agregar(idProducto: string) {
    const producto = catalogo.find((p) => String(p.id) === idProducto)
    if (!producto) return
    setLineas((previas) => {
      const existente = previas.find((l) => l.producto?.id === producto.id)
      if (existente) {
        return previas.map((l) =>
          l.producto?.id === producto.id ? { ...l, cantidad: l.cantidad + 1 } : l,
        )
      }
      return [
        ...previas,
        {
          key: claveNueva(),
          tipo: 'producto' as const,
          producto,
          descripcion: [producto.nombre, producto.calidad].filter(Boolean).join(' · '),
          cantidad: 1,
          precio: precioSugerido(producto, formaPago),
        },
      ]
    })
    setBuscar('')
  }

  /** `clave` es "idItem:idVariante" (la variante puede venir vacía). */
  function agregarService(clave: string) {
    if (!clave) return
    const [idItem, idVariante] = clave.split(':')
    const ubicado = ubicarService(seccionesService, idItem, idVariante)
    if (!ubicado) return
    agregarLinea({
      tipo: 'service',
      itemServiceId: ubicado.itemId,
      descripcion: ubicado.descripcion,
      cantidad: 1,
      precio: precioServicePara(ubicado.lista, ubicado.cash, formaPago),
    })
    setBuscarService('')
  }

  function agregarLibre() {
    agregarLinea({ tipo: 'otro', descripcion: '', cantidad: 1, precio: 0 })
  }

  const total = lineas.reduce((a, l) => a + l.cantidad * (Number.isFinite(l.precio) ? l.precio : 0), 0)
  // El faltante de stock solo aplica a la mercadería: un service no tiene stock.
  const hayFaltantes =
    sucursalId !== null &&
    lineas.some((l) => l.producto != null && l.cantidad > disponibles(l.producto.id))

  const guardar = useMutation({
    mutationFn: (permitirFaltante: boolean) => {
      if (sucursalId === null) throw new ApiError(0, 'Elegí la sucursal.', null)
      if (lineas.length === 0) throw new ApiError(0, 'Agregá al menos un ítem.', null)
      if (lineas.some((l) => !Number.isFinite(l.precio) || l.precio < 0)) {
        throw new ApiError(0, 'Revisá los precios: tienen que ser 0 o más.', null)
      }
      if (lineas.some((l) => l.tipo !== 'producto' && !l.descripcion.trim())) {
        throw new ApiError(0, 'Escribí qué se cobra en los ítems libres.', null)
      }
      // El cliente es opcional: si es uno guardado va su id; si se cargó a mano
      // van los datos y el backend lo da de alta (si hay con qué reconocerlo).
      const datosCliente = {
        nombre: clienteNombre.trim(),
        telefono: clienteTelefono.trim(),
        email: clienteEmail.trim(),
      }
      const hayDatosNuevos = !clienteSel && (datosCliente.telefono || datosCliente.email)
      return registrarVenta({
        sucursal: sucursalId,
        forma_pago: formaPago,
        facturacion,
        nota: nota.trim(),
        cliente: clienteSel?.id,
        cliente_datos: hayDatosNuevos ? datosCliente : undefined,
        caja: cajaId ? Number(cajaId) : undefined,
        permitir_faltante: permitirFaltante || undefined,
        items: lineas.map((l) => ({
          tipo: l.tipo,
          producto: l.producto?.id,
          item_service: l.itemServiceId,
          descripcion: l.descripcion.trim(),
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
        `${money0(Number(venta.total))} en ${venta.sucursal_nombre} — stock descontado${arqueo}.` +
          (venta.cliente_nombre ? ` Quedó en el historial de ${venta.cliente_nombre}.` : ''),
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
              descripcion: l.descripcion.trim() || l.producto?.nombre || 'Ítem',
              cantidad: l.cantidad,
              precioFinal: Number.isFinite(l.precio) ? l.precio : 0,
            })),
            observaciones: `Venta de mostrador #${venta.id}`,
            // El cliente del mostrador viaja a la factura: no se retipea nada.
            cliente: clienteNombre.trim()
              ? {
                  nombre: clienteNombre.trim(),
                  telefono: clienteTelefono.trim(),
                  email: clienteEmail.trim(),
                  docTipo: clienteSel?.doc_tipo,
                  docNumero: clienteSel?.doc_numero,
                  condicion: clienteSel?.condicion,
                }
              : undefined,
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
      const faltantes = lineas.filter(
        (l) => l.producto != null && l.cantidad > disponibles(l.producto.id),
      )
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
                  <span className="min-w-0 truncate">{l.producto!.nombre}</span>
                  <span className="tnum shrink-0 font-medium text-ink-900">
                    quedan {num(disponibles(l.producto!.id))} · vendés {num(l.cantidad)}
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

        {/* Cliente: opcional, pero si va queda toda su compra en su historial */}
        <div className="rounded-2xl border border-line bg-canvas/40 p-3.5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-500">
              <UserRound className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Cliente <span className="text-ink-400">(opcional)</span>
            </span>
            {clienteSel && (
              <button
                type="button"
                onClick={quitarCliente}
                className="inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-xs text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
                Quitar
              </button>
            )}
          </div>

          {clienteSel ? (
            <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink-100 text-xs font-bold text-ink-900">
                {inicialesCliente(clienteSel.nombre)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink-900">{clienteSel.nombre}</p>
                <p className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-ink-400">
                  {clienteSel.telefono && (
                    <span className="inline-flex items-center gap-1">
                      <Phone className="h-3 w-3 shrink-0" aria-hidden />
                      {clienteSel.telefono}
                    </span>
                  )}
                  {clienteSel.email && (
                    <span className="inline-flex min-w-0 items-center gap-1">
                      <Mail className="h-3 w-3 shrink-0" aria-hidden />
                      <span className="truncate">{clienteSel.email}</span>
                    </span>
                  )}
                  {clienteSel.doc_numero && (
                    <span className="inline-flex items-center gap-1">
                      <IdCard className="h-3 w-3 shrink-0" aria-hidden />
                      {clienteSel.doc_numero}
                    </span>
                  )}
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <div className="relative sm:col-span-2">
                  <Input
                    value={clienteNombre}
                    onChange={(e) => {
                      setClienteNombre(e.target.value)
                      setSugerenciasAbiertas(true)
                    }}
                    onFocus={() => setSugerenciasAbiertas(true)}
                    onBlur={() => setSugerenciasAbiertas(false)}
                    placeholder="Nombre del cliente…"
                    autoComplete="off"
                    aria-label="Nombre del cliente"
                  />
                  {sugerenciasAbiertas && sugerenciasClientes.length > 0 && (
                    <div
                      onMouseDown={(e) => e.preventDefault()}
                      className="ct-dropdown absolute left-0 right-0 z-40 mt-2 max-h-52 overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-[0_18px_50px_rgba(10,10,11,0.16)]"
                    >
                      <p className="flex items-center gap-1.5 px-2 py-1 text-[0.7rem] font-medium uppercase tracking-[0.12em] text-ink-400">
                        <Search className="h-3 w-3" aria-hidden /> Clientes guardados
                      </p>
                      {sugerenciasClientes.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => elegirCliente(c)}
                          className="flex w-full flex-col items-start gap-0.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-ink-50"
                        >
                          <span className="w-full truncate text-sm font-medium text-ink-900">{c.nombre}</span>
                          <span className="flex w-full flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-ink-400">
                            {c.telefono && <span>{c.telefono}</span>}
                            {c.email && <span className="truncate">{c.email}</span>}
                            {c.doc_numero && <span>{c.doc_numero}</span>}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
                  <Input
                    value={clienteTelefono}
                    onChange={(e) => setClienteTelefono(e.target.value)}
                    placeholder="381 555 1234"
                    inputMode="tel"
                    aria-label="Teléfono del cliente"
                    className="pl-10"
                  />
                </div>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
                  <Input
                    type="email"
                    value={clienteEmail}
                    onChange={(e) => setClienteEmail(e.target.value)}
                    placeholder="cliente@correo.com"
                    inputMode="email"
                    autoComplete="off"
                    aria-label="Email del cliente"
                    className="pl-10"
                  />
                </div>
              </div>
              <p className="mt-2 text-[0.7rem] leading-relaxed text-ink-400">
                Con teléfono o email queda guardado en tu base y esta venta entra a su historial de
                compras. Sin esos datos, la venta se registra igual pero sin cliente.
              </p>
            </>
          )}
        </div>

        {/* Qué se cobra: mercadería del catálogo, service del taller o algo suelto */}
        <div>
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <label className="text-xs font-medium text-ink-500">¿Qué se cobra?</label>
            <button
              type="button"
              onClick={agregarLibre}
              className="inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-xs font-medium text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Ítem libre
            </button>
          </div>
          <div className={cn('grid gap-2.5', hayService && 'sm:grid-cols-2')}>
            <Select
              options={opcionesProducto}
              value={buscar}
              onChange={agregar}
              searchable
              searchPlaceholder="funda 13, cargador 20w…"
              placeholder="Producto del catálogo…"
            />
            {hayService && (
              <Select
                options={opcionesService}
                value={buscarService}
                onChange={agregarService}
                searchable
                searchPlaceholder="bateria 13, modulo 11…"
                placeholder="Service del taller…"
              />
            )}
          </div>
          <p className="mt-1 text-xs text-ink-400">
            La mercadería descuenta stock; los services y los ítems libres se cobran sin tocar el
            inventario.
          </p>
        </div>

        {lineas.length > 0 && (
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {lineas.map((linea) => {
              const esProducto = linea.producto != null
              const enStock = esProducto ? disponibles(linea.producto!.id) : 0
              const falta = esProducto && linea.cantidad > enStock
              const nombreLinea = linea.descripcion || linea.producto?.nombre || 'Ítem'
              return (
                <li key={linea.key} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:px-4">
                  <div className="min-w-0 flex-1 basis-40">
                    {linea.tipo === 'otro' ? (
                      <Input
                        value={linea.descripcion}
                        onChange={(e) =>
                          setLineas((ls) =>
                            ls.map((l) =>
                              l.key === linea.key ? { ...l, descripcion: e.target.value } : l,
                            ),
                          )
                        }
                        placeholder="¿Qué se cobra? Ej: mano de obra"
                        maxLength={200}
                        aria-label="Descripción del ítem"
                        className="h-9 text-sm"
                      />
                    ) : (
                      <>
                        <p className="truncate text-sm font-medium text-ink-900">{nombreLinea}</p>
                        {esProducto ? (
                          <p className={cn('tnum text-xs', falta ? 'font-semibold text-ink-950' : 'text-ink-400')}>
                            {sucursalId !== null && `quedan ${num(enStock)}`}
                            {falta && ' — no alcanza'}
                          </p>
                        ) : (
                          <p className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                            <Wrench className="h-3 w-3 shrink-0" aria-hidden />
                            Service · no descuenta stock
                          </p>
                        )}
                      </>
                    )}
                  </div>
                  <div className="inline-flex items-center rounded-xl border border-line-strong">
                    <button
                      type="button"
                      aria-label={`Restar ${nombreLinea}`}
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
                      aria-label={`Sumar ${nombreLinea}`}
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
                      aria-label={`Precio de ${nombreLinea}`}
                      className="tnum h-10 pl-6 pr-2 text-sm"
                    />
                  </div>
                  <span className="tnum hidden w-24 text-right text-sm font-semibold text-ink-900 sm:block">
                    {money(linea.cantidad * (Number.isFinite(linea.precio) ? linea.precio : 0))}
                  </span>
                  <button
                    type="button"
                    aria-label={`Quitar ${nombreLinea}`}
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
