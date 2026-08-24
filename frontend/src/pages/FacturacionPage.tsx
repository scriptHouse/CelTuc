import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Eye,
  FileMinus2,
  FileSpreadsheet,
  FileText,
  Gauge,
  Mail,
  MessageCircle,
  PackageX,
  Pencil,
  Phone,
  Plus,
  PlugZap,
  QrCode,
  ReceiptText,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Wallet,
  X,
} from 'lucide-react'
import type { ReactNode } from 'react'
import type {
  CajaRegistradora,
  ClaseComprobante,
  Cliente,
  Comprobante,
  ConceptoFactura,
  CondicionEmisor,
  CondicionFiscal,
  DocTipo,
  Emisor,
  EstadoEfectivo,
  MedioPagoComprobante,
} from '@/types'
import { MEDIOS_PAGO_CAJA } from '@/types'
import {
  actualizarEmisor,
  buscarClientes,
  cambiarEstadoCobro,
  cambiarMedioPago,
  crearEmisor,
  eliminarComprobante,
  emitirComprobante,
  enviarComprobanteEmail,
  guardarLimites,
  listarComprobantes,
  listarConceptos,
  listarEmisores,
  obtenerComprobante,
  obtenerLimites,
  probarConexion,
  actualizarConcepto,
  crearConcepto,
  eliminarConcepto,
  type ConceptoFacturaInput,
  type EmisorInput,
  type LimiteExcedido,
  type LimiteMes,
  type NuevoComprobante,
} from '@/services/facturacion'
import { listarProductos } from '@/services/productos'
import { listarSucursales } from '@/services/inventario'
import {
  abrirCaja,
  cajasConTurnoAbierto,
  listarCajas,
  obtenerConfigCaja,
  ultimoCierreDeCaja,
  type AbrirCajaInput,
} from '@/services/caja'
import { tomarBorradorFacturaVenta, type BorradorFacturaVenta } from '@/lib/borradorFactura'
import {
  conceptoPorDefecto,
  MAX_LARGO_CONCEPTO,
} from '@/lib/conceptoGenerico'
import { AperturaModal, type AperturaValues } from '@/components/caja/AperturaModal'
import { CuentaCard } from '@/components/facturacion/CuentaCard'
import { DevolverStockModal } from '@/components/facturacion/DevolverStockModal'
import { NotaCreditoModal } from '@/components/facturacion/NotaCreditoModal'
import { ExportarFacturacionModal } from '@/components/facturacion/exportar/ExportarFacturacionModal'
import { LimiteUsoBar } from '@/components/facturacion/LimiteUsoBar'
import {
  calcularTotales,
  condicionesClientePara,
  CONDICION_CORTA,
  CONDICION_LABEL,
  IVA_RATE,
  nombreComprobante,
  signoComprobante,
  tipoComprobante,
} from '@/lib/afip'
import { fecha, formatCuit, money, money0, num, pad } from '@/lib/format'
import { waLink, waNumeroArgentino } from '@/lib/whatsapp'
import {
  CLAVE_MENSAJE_FACTURA,
  construirMensajeFactura,
  EJEMPLO_FACTURA,
  PLANTILLA_FACTURA_DEFAULT,
  plantillaEfectiva,
  valoresDeComprobante,
  VARIABLES_FACTURA,
} from '@/lib/mensajeFactura'
import { guardarPreferencia, obtenerPreferencia } from '@/services/preferencias'
import { MensajeWhatsappModal } from '@/components/MensajeWhatsappModal'
import { ApiError } from '@/lib/api'
import { cn, ctStagger } from '@/lib/utils'
import { useAuth } from '@/store/auth'
import { esAdmin } from '@/lib/permisos'
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
import { Badge } from '@/components/ui/Badge'
import { CampoBooleano } from '@/components/ui/CampoBooleano'
import { FacturaEstadoBadge } from '@/components/ui/StatusBadge'
import { useToast } from '@/components/ToastProvider'
import { useConfirm } from '@/components/ConfirmProvider'

const DOC_LABEL: Record<DocTipo, string> = {
  CUIT: 'CUIT',
  CUIL: 'CUIL',
  DNI: 'DNI',
  CF: 'Consumidor Final',
}

/**
 * Medios de cobro que se pueden anotar en una factura. Es el MISMO vocabulario
 * que la venta de mostrador, así el resumen mensual suma sin mapeos. El dato es
 * interno (no viaja a ARCA) y se puede dejar sin especificar.
 */
const OPCIONES_MEDIO_PAGO = [
  { value: '', label: 'Sin especificar' },
  ...MEDIOS_PAGO_CAJA.map((m) => ({ value: m.value, label: m.label })),
]

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const

function nombreMes(mes: number): string {
  return MESES[mes - 1] ?? String(mes)
}

/** Tipos de documento válidos según la condición del cliente. */
function docTiposPara(condicion: CondicionFiscal): DocTipo[] {
  if (condicion === 'consumidor_final') return ['CF', 'DNI', 'CUIT']
  return ['CUIT'] // Responsable Inscripto / Monotributo / Exento -> CUIT
}

/**
 * Etiqueta de la condición de un emisor. Para los Responsables Inscriptos agrega
 * la distinción de sucursal Yerba Buena / Centro (marca interna `responsable_yb`,
 * NO fiscal). `corta` para chips angostos. Los monotributistas no cambian.
 */
function condicionEmisor(
  e: Pick<Emisor, 'condicion' | 'responsable_yb'>,
  corta = false,
): string {
  if (e.condicion === 'responsable_inscripto') {
    const zona = e.responsable_yb ? 'Yerba Buena' : 'Centro'
    return corta ? `Resp. Inscripto · ${zona}` : `Responsable Inscripto ${zona}`
  }
  return corta ? CONDICION_CORTA[e.condicion] : CONDICION_LABEL[e.condicion]
}

/** Formatea un monto con separador de miles (1234567 → 1.234.567) al escribir. */
function formatMiles(value: string): string {
  const d = value.replace(/\D/g, '')
  return d ? Number(d).toLocaleString('es-AR') : ''
}

/**
 * Estado visible de un comprobante: pagada, vencida o pendiente.
 *
 * Solo tiene sentido en las FACTURAS: una nota de crédito no se cobra, acredita
 * (la lista le muestra su propia etiqueta).
 */
function estadoComprobante(c: Comprobante): EstadoEfectivo {
  if (c.estado_cobro === 'pagada') return 'pagada'
  if (c.vencimiento) {
    const venc = new Date(c.vencimiento)
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)
    if (venc.getTime() < hoy.getTime()) return 'vencida'
  }
  return 'pendiente'
}

/** Genera el PDF de la factura (carga react-pdf en diferido) y devuelve el Blob. */
async function generarFacturaPdfBlob(c: Comprobante): Promise<Blob> {
  const [{ pdf }, { FacturaPdf }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('@/documentos/FacturaPdf'),
  ])
  return pdf(<FacturaPdf c={c} />).toBlob()
}

/** Genera el PDF y lo descarga. */
async function descargarFacturaPdf(c: Comprobante) {
  const blob = await generarFacturaPdfBlob(c)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${c.clase === 'nota_credito' ? 'nota-credito' : 'factura'}-${c.tipo}-${c.numero_formateado}.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Blob (PDF) → base64 sin el prefijo "data:...;base64,". */
function blobABase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const res = String(reader.result)
      resolve(res.includes(',') ? res.slice(res.indexOf(',') + 1) : res)
    }
    reader.onerror = () => reject(new Error('No se pudo leer el PDF.'))
    reader.readAsDataURL(blob)
  })
}


export function FacturacionPage() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const usuario = useAuth((s) => s.usuario)
  // Gestionar cuentas/credenciales de facturación es SOLO del superadministrador.
  const soySuper = Boolean(usuario?.is_superuser)
  // Los topes mensuales son control interno de gestión: los edita cualquier admin.
  const soyAdmin = esAdmin(usuario)

  const { data: emisores = [], isLoading: loadingEmisores } = useQuery({
    queryKey: ['emisores'],
    queryFn: listarEmisores,
  })

  const [emisorId, setEmisorId] = useState<number | null>(null)
  useEffect(() => {
    if (emisorId == null && emisores.length) setEmisorId(emisores[0].id)
  }, [emisores, emisorId])

  const emisor = emisores.find((e) => e.id === emisorId)

  const { data: comprobantes = [], isLoading: loadingComprobantes } = useQuery({
    queryKey: ['comprobantes', emisorId],
    queryFn: () => listarComprobantes(emisorId ?? undefined),
    enabled: emisorId != null,
  })

  // Sugerencias de ítems para la factura: el catálogo REAL (precio de lista vivo).
  const { data: catalogo = [] } = useQuery({ queryKey: ['productos-items'], queryFn: listarProductos })
  const productos = useMemo(
    () =>
      catalogo
        .filter((p) => p.activo && p.efectivo?.lista_ars != null)
        .map((p) => ({
          id: String(p.id),
          nombre: [p.nombre, p.calidad].filter(Boolean).join(' · '),
          precio: Number(p.efectivo.lista_ars),
        })),
    [catalogo],
  )

  // Banco de conceptos. Quien factura ve solo los activos (los que puede
  // elegir); el administrador los ve todos, para gestionarlos.
  const { data: conceptos = [] } = useQuery({
    queryKey: ['facturacion-conceptos'],
    queryFn: listarConceptos,
  })
  const conceptosActivos = useMemo(() => conceptos.filter((c) => c.activo), [conceptos])

  const [facturaModal, setFacturaModal] = useState(false)
  const [emisorModal, setEmisorModal] = useState(false)
  const [emisorEdit, setEmisorEdit] = useState<Emisor | null>(null)
  const [limitesModal, setLimitesModal] = useState(false)
  const [conceptoModal, setConceptoModal] = useState(false)
  const [detalleId, setDetalleId] = useState<number | null>(null)
  // Factura que se está por acreditar (abre el modal de nota de crédito).
  const [notaCreditoId, setNotaCreditoId] = useState<number | null>(null)
  // Nota recién emitida: se pregunta si la mercadería volvió al stock.
  const [notaParaStock, setNotaParaStock] = useState<Comprobante | null>(null)
  // Filtro de la lista: todo, solo facturas o solo notas de crédito.
  const [claseFiltro, setClaseFiltro] = useState<'todos' | ClaseComprobante>('todos')
  // Studio de exportación: arma la planilla del mes (formato de siempre) con lo
  // facturado con CAE. Son números del negocio: solo administradores.
  const [exportarModal, setExportarModal] = useState(false)

  // --- Facturar una venta de mostrador (viene de Caja) -----------------------
  // Si Caja dejó un borrador, se elige la cuenta que corresponde (RI o Mono),
  // se precargan los ítems y se abre el modal de emisión DE SIEMPRE: el flujo
  // de ARCA no cambia en nada, solo llega con los campos ya completos.
  const [prefill, setPrefill] = useState<PrefillFactura | null>(null)
  useEffect(() => {
    if (!emisores.length) return
    const borrador = tomarBorradorFacturaVenta()
    if (!borrador) return
    // La cuenta elegida en el mostrador manda; si ya no está disponible, se
    // cae a la primera activa de la condición que corresponde.
    const cuenta =
      (borrador.emisorId != null
        ? emisores.find((e) => e.id === borrador.emisorId && e.activo)
        : undefined) ?? emisores.find((e) => e.activo && e.condicion === borrador.emisorCondicion)
    if (!cuenta) {
      toast.error(
        'No hay una cuenta para facturar esta venta',
        borrador.emisorCondicion === 'responsable_inscripto'
          ? 'Hace falta una cuenta Responsable Inscripto activa.'
          : 'Hace falta una cuenta Monotributista activa.',
      )
      return
    }
    const esRI = cuenta.condicion === 'responsable_inscripto'
    setEmisorId(cuenta.id)
    setPrefill({
      ventaId: borrador.ventaId,
      // El precio de la venta es lo que pagó el cliente (final). En A/B el
      // ítem viaja NETO y el modal le suma el 21 %: se divide acá para que el
      // total de la factura coincida con lo cobrado en el mostrador.
      items: borrador.items.map((i) => ({
        descripcion: i.descripcion,
        cantidad: i.cantidad,
        precioUnitario: esRI
          ? Math.round((i.precioFinal / (1 + IVA_RATE)) * 100) / 100
          : i.precioFinal,
        productoId: i.productoId,
        itemServiceId: i.itemServiceId,
      })),
      observaciones: borrador.observaciones,
      pagada: true, // la venta de mostrador ya se cobró
      medioPago: borrador.medioPago,
      cliente: borrador.cliente,
    })
    setFacturaModal(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emisores])

  // --- Aviso post-emisión: la caja de esa plata no está abierta --------------
  const [avisoCajaCerrada, setAvisoCajaCerrada] = useState<CajaRegistradora | null>(null)
  const [aperturaCaja, setAperturaCaja] = useState<CajaRegistradora | null>(null)

  /** Tras emitir: si la caja del canal del emisor está cerrada, avisamos. */
  async function chequearCajaAbierta(c: Comprobante) {
    try {
      const condicion = c.emisor_condicion ?? emisor?.condicion
      if (!condicion) return
      const canal = condicion === 'responsable_inscripto' ? 'factura_ri' : 'general'
      const [cajas, abiertas] = await Promise.all([listarCajas(), cajasConTurnoAbierto()])
      const cajaCanal = cajas.find((cj) => cj.activa && cj.canal === canal)
      if (cajaCanal && !abiertas.includes(cajaCanal.id)) setAvisoCajaCerrada(cajaCanal)
    } catch {
      /* sin permiso de Caja (403) no hay aviso: la factura salió igual */
    }
  }

  // Datos para reusar la apertura de turno de Caja (solo se piden al abrirla).
  const { data: configCaja } = useQuery({
    queryKey: ['caja', 'config'],
    queryFn: obtenerConfigCaja,
    enabled: aperturaCaja != null,
    retry: false,
  })
  const { data: ultimoCierreCaja = null } = useQuery({
    queryKey: ['caja', 'ultimo', aperturaCaja?.id],
    queryFn: () => ultimoCierreDeCaja(aperturaCaja!.id),
    enabled: aperturaCaja != null,
    retry: false,
  })
  const abrirCajaMut = useMutation({
    mutationFn: (input: AbrirCajaInput) => abrirCaja(input),
    onSuccess: (s) => {
      queryClient.invalidateQueries({ queryKey: ['caja'] })
      setAperturaCaja(null)
      toast.success('Caja abierta', `Turno #${s.numero} con fondo de ${money0(s.fondoInicial)}.`)
    },
    onError: (e: Error) => toast.error('No se pudo abrir la caja', e.message),
  })

  // Límite de facturación del mes en curso (para la barra de uso de la cuenta).
  const hoyAR = hoyInput()
  const anioActual = Number(hoyAR.slice(0, 4))
  const mesActual = Number(hoyAR.slice(5, 7))
  const { data: limitesAnio } = useQuery({
    queryKey: ['fact-limites', emisorId, anioActual],
    queryFn: () => obtenerLimites(emisorId as number, anioActual),
    enabled: emisorId != null,
  })
  const limiteMesActual = limitesAnio?.limites.find((l) => l.mes === mesActual)

  const invalidarComprobantes = () => {
    queryClient.invalidateQueries({ queryKey: ['comprobantes'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    queryClient.invalidateQueries({ queryKey: ['fact-limites'] })
    // El resumen del mes que exporta el Studio: sin esto, emitir una factura y
    // abrir «Exportar facturación» dentro del minuto siguiente bajaría el Excel
    // sin esa factura (la query tiene staleTime).
    queryClient.invalidateQueries({ queryKey: ['fact-resumen'] })
  }

  const emitirMut = useMutation({
    mutationFn: (input: NuevoComprobante) => emitirComprobante(input),
    onSuccess: (c) => {
      invalidarComprobantes()
      queryClient.invalidateQueries({ queryKey: ['inv-stock'] })
      queryClient.invalidateQueries({ queryKey: ['inv-movimientos'] })
      setFacturaModal(false)
      setPrefill(null)
      setDetalleId(c.id)
      toast.success(`Factura ${c.tipo} emitida`, c.cae ? `CAE ${c.cae}` : `Total ${money(c.total)}`)
      // La factura salió igual: esto es solo lo que NO se pudo descontar.
      if (c.avisos_stock?.length) toast.info('Stock sin descontar', c.avisos_stock.join(' '))
      // ¿La caja que recibe esta plata está abierta? Si no, se avisa y se
      // ofrece abrirla acá mismo (mejor esfuerzo: no bloquea nada).
      void chequearCajaAbierta(c)
    },
    onError: async (e: Error, variables) => {
      // El backend avisa (409) ANTES de pedir el CAE si el mes queda pasado del
      // tope. Se muestra el detalle y, si el usuario confirma, se emite igual.
      const aviso = e instanceof ApiError && e.status === 409
        ? (e.data as Partial<LimiteExcedido> | null)
        : null
      if (aviso?.codigo === 'limite_mensual_excedido') {
        const ok = await confirm({
          title: `Se supera el límite de ${aviso.mes_nombre ?? 'este mes'}`,
          tone: 'warning',
          icon: Gauge,
          confirmLabel: 'Emitir de todas formas',
          cancelLabel: 'No emitir',
          description: (
            <span className="block space-y-2.5">
              <span className="block">
                Esta factura pasa el <strong>límite de facturación mensual</strong> configurado
                para la cuenta.
              </span>
              <span className="block space-y-1 rounded-xl bg-ink-50 px-3.5 py-2.5 text-left">
                <span className="flex items-center justify-between gap-3">
                  <span>Límite de {aviso.mes_nombre ?? 'el mes'}</span>
                  <span className="tnum font-medium text-ink-900">{money(aviso.limite ?? 0)}</span>
                </span>
                <span className="flex items-center justify-between gap-3">
                  <span>Ya facturado</span>
                  <span className="tnum font-medium text-ink-900">{money(aviso.facturado ?? 0)}</span>
                </span>
                <span className="flex items-center justify-between gap-3">
                  <span>Esta factura</span>
                  <span className="tnum font-medium text-ink-900">{money(aviso.total_factura ?? 0)}</span>
                </span>
                <span className="flex items-center justify-between gap-3 border-t border-line pt-1.5 font-semibold text-ink-950">
                  <span>Se pasa por</span>
                  <span className="tnum">{money(aviso.excedente ?? 0)}</span>
                </span>
              </span>
              <span className="block">¿Querés emitirla de todas formas?</span>
            </span>
          ),
        })
        if (ok) emitirMut.mutate({ ...variables, confirmar_limite: true })
        return
      }
      toast.error('No se pudo emitir', e.message)
    },
  })

  const emisorMut = useMutation({
    mutationFn: ({ id, input }: { id: number | null; input: EmisorInput }) =>
      id ? actualizarEmisor(id, input) : crearEmisor(input),
    onSuccess: (e) => {
      queryClient.invalidateQueries({ queryKey: ['emisores'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setEmisorId(e.id)
      setEmisorModal(false)
      setEmisorEdit(null)
      toast.success(emisorEdit ? 'Cuenta actualizada' : 'Cuenta creada', e.nombre)
    },
    onError: (e: Error) => toast.error('No se pudo guardar la cuenta', e.message),
  })

  const estadoMut = useMutation({
    mutationFn: ({ id, estado }: { id: number; estado: Comprobante['estado_cobro'] }) =>
      cambiarEstadoCobro(id, estado),
    onSuccess: () => invalidarComprobantes(),
  })

  const borrarMut = useMutation({
    mutationFn: (id: number) => eliminarComprobante(id),
    onSuccess: () => {
      invalidarComprobantes()
      toast.success('Comprobante quitado de la lista')
    },
  })

  const probarMut = useMutation({
    mutationFn: (id: number) => probarConexion(id),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success('Conexión correcta', `${r.mensaje} Último N° ${r.ultimo_numero ?? 0}`)
      } else {
        toast.error('Conexión con problemas', r.mensaje)
      }
    },
    onError: (e: Error) => toast.error('No se pudo probar la conexión', e.message),
  })

  /**
   * Los números de la cuenta, NETOS de notas de crédito: una nota devuelve
   * plata, así que resta de lo facturado, de lo cobrado y de lo pendiente (en el
   * balde que corresponda). `acreditado` es cuánto se devolvió, para poder
   * decirlo debajo del total.
   */
  const stats = useMemo(() => {
    const firmado = (c: Comprobante) => c.total * signoComprobante(c.clase)
    const total = comprobantes.reduce((a, c) => a + firmado(c), 0)
    const cobrado = comprobantes
      .filter((c) => c.estado_cobro === 'pagada')
      .reduce((a, c) => a + firmado(c), 0)
    const pendiente = comprobantes
      .filter((c) => c.estado_cobro !== 'pagada')
      .reduce((a, c) => a + firmado(c), 0)
    const acreditado = comprobantes
      .filter((c) => c.clase === 'nota_credito')
      .reduce((a, c) => a + c.total, 0)
    return { total, cobrado, pendiente, acreditado, cantidad: comprobantes.length }
  }, [comprobantes])

  /** Hay notas de crédito en la cuenta: recién ahí aparece el filtro. */
  const hayNotas = useMemo(
    () => comprobantes.some((c) => c.clase === 'nota_credito'),
    [comprobantes],
  )
  const visibles = useMemo(
    () => (claseFiltro === 'todos' ? comprobantes : comprobantes.filter((c) => c.clase === claseFiltro)),
    [comprobantes, claseFiltro],
  )

  async function handleEliminar(c: Comprobante) {
    const esNota = c.clase === 'nota_credito'
    const ok = await confirm({
      title: `¿Quitar la ${esNota ? 'nota de crédito' : 'factura'} ${c.tipo}?`,
      description: esNota
        ? `N° ${c.numero_formateado} · ${money(c.total)}. Solo la oculta de la lista: el CAE existe igual en ARCA y su importe sigue acreditado sobre la factura.`
        : `N° ${c.numero_formateado} · ${money(c.total)}. No anula el comprobante en ARCA (para eso se emite una nota de crédito); solo lo oculta de la lista.`,
      confirmLabel: 'Quitar',
      tone: 'danger',
    })
    if (ok) borrarMut.mutate(c.id)
  }

  async function handleDescargar(c: Comprobante) {
    try {
      // La fila trae datos resumidos; pedimos el detalle (items + QR + CAE) para el PDF.
      const completo = await obtenerComprobante(c.id)
      await descargarFacturaPdf(completo)
    } catch (e) {
      toast.error('No se pudo generar el PDF', (e as Error).message)
    }
  }

  function abrirNuevaCuenta() {
    setEmisorEdit(null)
    setEmisorModal(true)
  }
  function abrirEditarCuenta() {
    if (!emisor) return
    setEmisorEdit(emisor)
    setEmisorModal(true)
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        icon={ReceiptText}
        eyebrow="Comprobantes"
        title="Facturación"
        subtitle="Emití comprobantes A, B o C con CAE real de ARCA según la condición fiscal."
        className="ct-rise"
        actions={
          <>
            {soyAdmin && (
              <Button variant="outline" size="sm" onClick={() => setExportarModal(true)}>
                <FileSpreadsheet className="h-4 w-4" />
                Exportar facturación
              </Button>
            )}
            {soySuper && (
              <Button variant="outline" size="sm" onClick={abrirNuevaCuenta}>
                <Building2 className="h-4 w-4" />
                Nueva cuenta
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => setFacturaModal(true)}
              disabled={!emisor || !emisor.activo}
            >
              <Plus className="h-4 w-4" />
              Nueva factura
            </Button>
          </>
        }
      />

      {/* Selector de emisores (cuentas) */}
      {loadingEmisores ? (
        <Skeleton className="mb-5 h-16 w-full" />
      ) : emisores.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Sin cuentas para facturar"
          description={
            soySuper
              ? 'Creá la primera cuenta (CUIT, punto de venta y certificado de ARCA) para empezar a emitir.'
              : 'Todavía no hay cuentas configuradas. Pedile a un superadministrador que cargue una.'
          }
          action={
            soySuper ? (
              <Button onClick={abrirNuevaCuenta}>
                <Building2 className="h-4 w-4" />
                Nueva cuenta
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {(() => {
            const ris = emisores.filter((e) => e.condicion === 'responsable_inscripto')
            const monos = emisores.filter((e) => e.condicion !== 'responsable_inscripto')
            const seccion = (titulo: string, lista: Emisor[]) =>
              lista.length === 0 ? null : (
                <div key={titulo}>
                  <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                    {titulo}
                    <span className="rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold text-ink-500">
                      {lista.length}
                    </span>
                  </h3>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {lista.map((e) => (
                      <CuentaCard
                        key={e.id}
                        emisor={e}
                        activa={e.id === emisorId}
                        onSelect={() => setEmisorId(e.id)}
                      />
                    ))}
                  </div>
                </div>
              )
            return (
              <div className="ct-rise mb-3 space-y-4">
                {seccion('Responsables Inscriptos', ris)}
                {seccion('Monotributistas', monos)}
              </div>
            )
          })()}

          {/* Barra de estado del emisor seleccionado */}
          {emisor && (
            <Card className="ct-rise mb-5 space-y-3 p-3.5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge tone={emisor.produccion ? 'solid' : 'outline'}>
                    {emisor.produccion ? 'Producción' : 'Homologación'}
                  </Badge>
                  {emisor.condicion === 'responsable_inscripto' && (
                    <Badge tone="outline">{emisor.responsable_yb ? 'Yerba Buena' : 'Centro'}</Badge>
                  )}
                  {!emisor.activo && <Badge tone="outline">Inactivo</Badge>}
                  {emisor.tiene_credenciales ? (
                    <span className="inline-flex items-center gap-1.5 font-medium text-ink-600">
                      <ShieldCheck className="h-3.5 w-3.5" /> Credenciales cargadas
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 font-medium text-ink-600">
                      <ShieldAlert className="h-3.5 w-3.5" /> Faltan certificado y clave
                    </span>
                  )}
                  <span className="tnum text-ink-400">CUIT {emisor.cuit}</span>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => probarMut.mutate(emisor.id)}
                    disabled={probarMut.isPending}
                  >
                    <PlugZap className="h-4 w-4" />
                    {probarMut.isPending ? 'Probando…' : 'Probar conexión'}
                  </Button>
                  {soyAdmin && (
                    <Button variant="outline" size="sm" onClick={() => setLimitesModal(true)}>
                      <Gauge className="h-4 w-4" />
                      Límites
                    </Button>
                  )}
                  {soyAdmin && (
                    <Button variant="outline" size="sm" onClick={() => setConceptoModal(true)}>
                      <FileText className="h-4 w-4" />
                      Conceptos
                    </Button>
                  )}
                  {soySuper && (
                    <Button variant="outline" size="sm" onClick={abrirEditarCuenta}>
                      <Pencil className="h-4 w-4" />
                      Editar
                    </Button>
                  )}
                </div>
              </div>
              {limiteMesActual?.monto != null && (
                <LimiteUsoBar
                  mesNombre={nombreMes(mesActual)}
                  limite={limiteMesActual.monto}
                  facturado={limiteMesActual.facturado}
                />
              )}
            </Card>
          )}
        </>
      )}

      {/* Stats del emisor */}
      {emisor && (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            className="ct-stagger-item"
            style={ctStagger(0)}
            label="Facturado"
            value={money(stats.total)}
            hint={stats.acreditado > 0 ? `Neto de ${money(stats.acreditado)} acreditados` : undefined}
            icon={ReceiptText}
          />
          <StatCard className="ct-stagger-item" style={ctStagger(1)} label="Cobrado" value={money(stats.cobrado)} icon={CheckCircle2} />
          <StatCard className="ct-stagger-item" style={ctStagger(2)} label="Pendiente" value={money(stats.pendiente)} icon={Wallet} />
          <StatCard className="ct-stagger-item" style={ctStagger(3)} label="Comprobantes" value={num(stats.cantidad)} icon={FileText} />
        </div>
      )}

      {/* Filtro por clase: aparece recién cuando la cuenta tiene alguna nota de
          crédito, para no sumar ruido a quien solo factura. */}
      {emisor && hayNotas && !loadingComprobantes && (
        <div className="ct-rise mb-3 flex flex-wrap items-center gap-1.5">
          {([
            { valor: 'todos' as const, label: 'Todos' },
            { valor: 'factura' as const, label: 'Facturas' },
            { valor: 'nota_credito' as const, label: 'Notas de crédito' },
          ]).map((op) => (
            <button
              key={op.valor}
              type="button"
              onClick={() => setClaseFiltro(op.valor)}
              aria-pressed={claseFiltro === op.valor}
              className={cn(
                'rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900',
                claseFiltro === op.valor
                  ? 'border-ink-950 bg-ink-950 text-on-ink'
                  : 'border-line text-ink-500 hover:border-line-strong hover:text-ink-900',
              )}
            >
              {op.label}
            </button>
          ))}
          <span className="tnum ml-auto text-xs text-ink-400">
            {num(visibles.length)} de {num(comprobantes.length)}
          </span>
        </div>
      )}

      {/* Listado */}
      {emisor &&
        (loadingComprobantes ? (
          <ListaSkeleton />
        ) : comprobantes.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title="Sin comprobantes"
            description="Emití la primera factura de esta cuenta."
            action={
              <Button onClick={() => setFacturaModal(true)} disabled={!emisor.activo}>
                <Plus className="h-4 w-4" />
                Nueva factura
              </Button>
            }
          />
        ) : visibles.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title={claseFiltro === 'nota_credito' ? 'Sin notas de crédito' : 'Sin facturas'}
            description="No hay comprobantes de este tipo en la cuenta."
            action={
              <Button variant="outline" onClick={() => setClaseFiltro('todos')}>
                Ver todos
              </Button>
            }
          />
        ) : (
          <Card className="ct-rise overflow-hidden">
            <ul className="divide-y divide-line">
              {visibles.map((c, i) => {
                // Una nota de crédito se lee distinto en toda la fila: cuadro
                // «NC» en vez de la letra, importe en negativo y su propia
                // etiqueta (no se cobra, acredita).
                const esNota = c.clase === 'nota_credito'
                return (
                  <li
                    key={c.id}
                    className="ct-stagger-fade flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5 transition-colors hover:bg-ink-50 sm:flex-nowrap sm:px-5"
                    style={ctStagger(i)}
                  >
                    <span
                      className={cn(
                        'grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-bold',
                        esNota
                          ? 'border border-line-strong bg-surface text-ink-700'
                          : 'bg-ink-950 text-on-ink',
                      )}
                      title={nombreComprobante(c.clase, c.tipo)}
                    >
                      {esNota ? 'NC' : c.tipo}
                    </span>
                    <div className="min-w-0 flex-1 basis-40">
                      <p className="truncate text-sm font-medium text-ink-900">{c.cliente_nombre}</p>
                      <p className="tnum truncate text-xs text-ink-400">
                        {esNota && <span className="font-medium text-ink-500">NC {c.tipo} · </span>}
                        {c.numero_formateado} · {fecha(c.fecha)}
                      </p>
                      {/* En el celular el importe va acá: la columna de la
                          derecha no entra sin estrangular el nombre. */}
                      <p
                        className={cn(
                          'tnum mt-0.5 text-sm font-semibold sm:hidden',
                          esNota ? 'text-ink-500' : 'text-ink-900',
                        )}
                      >
                        {esNota ? `− ${money(c.total)}` : money(c.total)}
                      </p>
                    </div>
                    <div className="hidden shrink-0 text-right sm:block">
                      <p
                        className={cn(
                          'tnum text-sm font-semibold',
                          esNota ? 'text-ink-500' : 'text-ink-900',
                        )}
                      >
                        {esNota ? `− ${money(c.total)}` : money(c.total)}
                      </p>
                      {c.cae ? (
                        <p className="tnum text-xs text-ink-400">CAE {c.cae}</p>
                      ) : (
                        <p className="text-xs text-ink-400">sin CAE</p>
                      )}
                    </div>
                    <div className="ml-auto flex shrink-0 items-center gap-2">
                      <div className="w-[104px] text-center">
                        {esNota ? (
                          <Badge tone="outline">Crédito</Badge>
                        ) : (
                          <FacturaEstadoBadge estado={estadoComprobante(c)} />
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <IconBtn label="Ver detalle" onClick={() => setDetalleId(c.id)}>
                          <Eye className="h-4 w-4" />
                        </IconBtn>
                        <IconBtn label="Descargar PDF" onClick={() => handleDescargar(c)}>
                          <Download className="h-4 w-4" />
                        </IconBtn>
                        {/* Acreditar es cosa de facturas: una nota no se acredita. */}
                        {!esNota && (
                          <IconBtn label="Nota de crédito" onClick={() => setNotaCreditoId(c.id)}>
                            <FileMinus2 className="h-4 w-4" />
                          </IconBtn>
                        )}
                        {!esNota &&
                          (c.estado_cobro === 'pendiente' ? (
                            <IconBtn
                              label="Marcar pagada"
                              onClick={() => estadoMut.mutate({ id: c.id, estado: 'pagada' })}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </IconBtn>
                          ) : (
                            <IconBtn
                              label="Marcar pendiente"
                              onClick={() => estadoMut.mutate({ id: c.id, estado: 'pendiente' })}
                            >
                              <Clock className="h-4 w-4" />
                            </IconBtn>
                          ))}
                        <IconBtn label="Quitar" onClick={() => handleEliminar(c)}>
                          <Trash2 className="h-4 w-4" />
                        </IconBtn>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </Card>
        ))}

      {emisor && (
        <NuevaFacturaModal
          open={facturaModal}
          emisor={emisor}
          productos={productos}
          conceptos={conceptosActivos}
          limites={limitesAnio?.limites}
          anioLimites={limitesAnio?.anio}
          prefill={prefill}
          saving={emitirMut.isPending}
          onClose={() => {
            setFacturaModal(false)
            setPrefill(null)
          }}
          onSubmit={(payload) => emitirMut.mutate({ ...payload, emisor: emisor.id })}
        />
      )}

      {emisor && (
        <LimitesModal
          open={limitesModal}
          emisor={emisor}
          onClose={() => setLimitesModal(false)}
        />
      )}

      <ConceptosManagerModal open={conceptoModal} onClose={() => setConceptoModal(false)} />

      <EmisorModal
        open={emisorModal}
        emisor={emisorEdit}
        saving={emisorMut.isPending}
        onClose={() => {
          setEmisorModal(false)
          setEmisorEdit(null)
        }}
        onSubmit={(input) => emisorMut.mutate({ id: emisorEdit?.id ?? null, input })}
      />

      <DetalleModal
        id={detalleId}
        onClose={() => setDetalleId(null)}
        onNotaCredito={(facturaId) => {
          setDetalleId(null)
          setNotaCreditoId(facturaId)
        }}
        onVerComprobante={(otro) => setDetalleId(otro)}
      />

      {/* Nota de crédito: se abre desde la fila de la factura o desde su detalle. */}
      <NotaCreditoModal
        facturaId={notaCreditoId}
        onClose={() => setNotaCreditoId(null)}
        onEmitida={(nota) => {
          invalidarComprobantes()
          // El detalle de la factura acreditada cambió (saldo y lista de notas).
          queryClient.invalidateQueries({ queryKey: ['comprobante'] })
          setNotaCreditoId(null)
          // Recién ahora se pregunta por el stock: la nota ya tiene CAE, así que
          // la respuesta (sí o no) no puede afectar al comprobante.
          setNotaParaStock(nota)
        }}
      />

      {/* ¿Volvió la mercadería? Lo decide quien atiende, después de acreditar.
          Al cerrarlo se abre el detalle de la nota recién emitida. */}
      <DevolverStockModal
        nota={notaParaStock}
        onCerrar={() => {
          const nota = notaParaStock
          setNotaParaStock(null)
          if (nota) setDetalleId(nota.id)
        }}
      />

      {/* Studio de exportación: la planilla mensual de facturación. Arranca en
          el mes en curso y con la cuenta que se está mirando. */}
      {soyAdmin && (
        <ExportarFacturacionModal
          abierto={exportarModal}
          onCerrar={() => setExportarModal(false)}
          usuario={usuario?.username ?? ''}
          emisorInicial={emisorId}
        />
      )}

      {/* Aviso post-emisión: la caja de esa plata no tiene turno abierto. */}
      <Modal open={avisoCajaCerrada != null} onClose={() => setAvisoCajaCerrada(null)} size="md">
        {avisoCajaCerrada && (
          <div className="px-5 py-5">
            <div className="flex items-start gap-3.5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-500/10 text-amber-700 ring-1 ring-amber-500/25 dark:text-amber-400">
                <AlertTriangle className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-ink-950">Hoy no se abrió la caja</h2>
                <p className="mt-1 text-sm leading-relaxed text-ink-600">
                  La factura salió bien, pero la caja <b>«{avisoCajaCerrada.nombre}»</b> no tiene
                  ningún turno abierto: esta plata no está entrando a ningún arqueo del día.
                  Te sugerimos abrirla para llevar el control.
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setAvisoCajaCerrada(null)}>
                Ahora no
              </Button>
              <Button
                onClick={() => {
                  setAperturaCaja(avisoCajaCerrada)
                  setAvisoCajaCerrada(null)
                }}
              >
                <Wallet className="h-4 w-4" />
                Abrir la caja
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Apertura de turno reutilizada tal cual del módulo Caja. */}
      {configCaja && (
        <AperturaModal
          open={aperturaCaja != null}
          caja={aperturaCaja}
          config={configCaja}
          ultimoCierre={ultimoCierreCaja}
          saving={abrirCajaMut.isPending}
          onClose={() => setAperturaCaja(null)}
          onSubmit={async (values: AperturaValues) => {
            if (!aperturaCaja) return
            try {
              await abrirCajaMut.mutateAsync({
                cajaId: aperturaCaja.id,
                usuario: usuario?.username ?? 'operador',
                ...values,
              })
            } catch {
              /* el toast sale del onError */
            }
          }}
        />
      )}
    </div>
  )
}

// ===== Banco de conceptos =====

/**
 * Gestor del banco de conceptos: crear, editar, activar/desactivar y elegir cuál
 * es el predeterminado. Es solo para administradores (el botón que lo abre ya lo
 * está); quien factura no entra acá, solo elige uno de los activos al emitir.
 *
 * Desactivar no borra: el texto sigue existiendo en las facturas ya emitidas,
 * simplemente deja de ofrecerse para las nuevas.
 */
function ConceptosManagerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const [texto, setTexto] = useState('')
  const [editandoId, setEditandoId] = useState<number | null>(null)

  const { data: conceptos = [], isLoading } = useQuery({
    queryKey: ['facturacion-conceptos'],
    queryFn: listarConceptos,
    enabled: open,
  })

  const refrescar = () => queryClient.invalidateQueries({ queryKey: ['facturacion-conceptos'] })
  const limpiarForm = () => {
    setTexto('')
    setEditandoId(null)
  }

  const guardar = useMutation({
    mutationFn: (valor: string) =>
      editandoId != null
        ? actualizarConcepto(editandoId, { texto: valor })
        : crearConcepto({
            texto: valor,
            // El primero que se crea queda como predeterminado: siempre tiene
            // que haber uno elegible al abrir una factura.
            predeterminado: conceptos.length === 0,
            orden: conceptos.reduce((max, c) => Math.max(max, c.orden), -1) + 1,
          }),
    onSuccess: () => {
      toast.success(editandoId != null ? 'Concepto actualizado' : 'Concepto creado')
      limpiarForm()
      refrescar()
    },
    onError: (e) => toast.error('No se pudo guardar', e instanceof ApiError ? e.message : undefined),
  })

  const cambiar = useMutation({
    mutationFn: ({ id, cambios }: { id: number; cambios: Partial<ConceptoFacturaInput> }) =>
      actualizarConcepto(id, cambios),
    onSuccess: refrescar,
    onError: (e) => toast.error('No se pudo guardar', e instanceof ApiError ? e.message : undefined),
  })

  const borrar = useMutation({
    mutationFn: (id: number) => eliminarConcepto(id),
    onSuccess: () => {
      toast.success('Concepto eliminado')
      limpiarForm()
      refrescar()
    },
    onError: (e) => toast.error('No se pudo eliminar', e instanceof ApiError ? e.message : undefined),
  })

  async function handleBorrar(c: ConceptoFactura) {
    const ok = await confirm({
      title: `¿Eliminar «${c.texto}»?`,
      description:
        'Deja de estar disponible para facturas nuevas. Las facturas ya emitidas con ' +
        'este texto no se tocan. Si solo querés sacarlo de la lista por un tiempo, ' +
        'conviene desactivarlo.',
      confirmLabel: 'Eliminar',
      tone: 'danger',
    })
    if (ok) borrar.mutate(c.id)
  }

  const limpio = texto.trim()
  const hayPredeterminado = conceptos.some((c) => c.predeterminado && c.activo)

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-lg font-semibold text-ink-950">Conceptos de facturación</h2>
        <p className="text-xs text-ink-400">
          Los textos con los que se puede emitir una factura sin detallar los productos
        </p>
      </div>

      <div className="max-h-[70vh] overflow-y-auto px-5 py-5">
        {/* Alta / edición */}
        <div className="rounded-xl border border-line bg-surface-2 p-3.5">
          <label className="mb-1.5 block text-xs font-medium text-ink-500">
            {editandoId != null ? 'Editar concepto' : 'Nuevo concepto'}
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={texto}
              onChange={(e) => setTexto(e.target.value.slice(0, MAX_LARGO_CONCEPTO))}
              placeholder="Ej: Accesorios y repuestos para telefonía celular"
              className="flex-1"
            />
            <div className="flex gap-2">
              {editandoId != null && (
                <Button variant="ghost" onClick={limpiarForm}>
                  Cancelar
                </Button>
              )}
              <Button onClick={() => guardar.mutate(texto)} disabled={!limpio || guardar.isPending}>
                {guardar.isPending ? 'Guardando…' : editandoId != null ? 'Guardar' : 'Agregar'}
              </Button>
            </div>
          </div>
          <p className="mt-1.5 text-xs text-ink-400">
            {limpio.length}/{MAX_LARGO_CONCEPTO} caracteres
          </p>
        </div>

        {!hayPredeterminado && conceptos.length > 0 && (
          <p className="mt-3 rounded-xl border border-line-strong bg-surface-2 px-3.5 py-2.5 text-xs leading-relaxed text-ink-500">
            Ningún concepto activo está marcado como predeterminado. Al abrir una factura se
            va a ofrecer el primero de la lista.
          </p>
        )}

        {/* Listado */}
        <div className="mt-4 space-y-2">
          {isLoading && <Skeleton className="h-16 w-full" />}
          {!isLoading && conceptos.length === 0 && (
            <p className="py-6 text-center text-sm text-ink-400">
              Todavía no hay conceptos. Agregá el primero arriba.
            </p>
          )}
          {conceptos.map((c) => (
            <div
              key={c.id}
              className={cn(
                'flex flex-col gap-2.5 rounded-xl border px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between',
                c.activo ? 'border-line bg-surface' : 'border-line bg-surface-2 opacity-60',
              )}
            >
              <div className="min-w-0">
                {/* El texto entero, sin cortar: es lo que va a leer el cliente
                    en la factura, así que tiene que verse completo acá. */}
                <p className="text-sm font-medium leading-snug text-ink-900">{c.texto}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {c.predeterminado && <Badge tone="solid">Predeterminado</Badge>}
                  {!c.activo && <Badge tone="outline">Desactivado</Badge>}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {c.activo && !c.predeterminado && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => cambiar.mutate({ id: c.id, cambios: { predeterminado: true } })}
                  >
                    Hacer predeterminado
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditandoId(c.id)
                    setTexto(c.texto)
                  }}
                >
                  <Pencil className="h-4 w-4" />
                  Editar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => cambiar.mutate({ id: c.id, cambios: { activo: !c.activo } })}
                >
                  {c.activo ? 'Desactivar' : 'Activar'}
                </Button>
                <IconBtn label="Eliminar" onClick={() => handleBorrar(c)}>
                  <Trash2 className="h-4 w-4" />
                </IconBtn>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-4 text-xs leading-relaxed text-ink-400">
          Al emitir, quien factura decide si usa concepto o deja el detalle real, y con cuál
          de los activos. En cuentas Monotributistas el concepto viene tildado; en
          Responsable Inscripto, no. El total de la factura y el stock nunca cambian.
        </p>
      </div>

      <div className="flex justify-end border-t border-line px-5 py-4">
        <Button variant="outline" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </Modal>
  )
}

/** Precarga del modal de emisión cuando la factura nace de una venta de Caja. */
interface PrefillFactura {
  /** Venta de mostrador que se está facturando (se liga al emitir). */
  ventaId: number
  items: Array<{
    descripcion: string
    cantidad: number
    precioUnitario: number
    /** Origen del ítem: solo para el concepto genérico (el stock ya se movió). */
    productoId?: number
    itemServiceId?: number
  }>
  observaciones: string
  pagada: boolean
  /** Con qué se cobró en el mostrador (precarga el medio de la factura). */
  medioPago?: MedioPagoComprobante
  /** Cliente cargado en el mostrador (si la venta lo tenía). */
  cliente?: BorradorFacturaVenta['cliente']
}

// ===== Detalle (con CAE y QR) =====

function DetalleModal({
  id,
  onClose,
  onNotaCredito,
  onVerComprobante,
}: {
  id: number | null
  onClose: () => void
  /** Acreditar ESTA factura (abre el modal de nota de crédito). */
  onNotaCredito: (facturaId: number) => void
  /** Saltar a otro comprobante: de una nota a la factura que acredita, y al revés. */
  onVerComprobante: (id: number) => void
}) {
  const toast = useToast()
  const [descargando, setDescargando] = useState(false)
  const [email, setEmail] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [telefono, setTelefono] = useState('')
  const [msgOpen, setMsgOpen] = useState(false)
  const queryClient = useQueryClient()
  const { data: c, isLoading } = useQuery({
    queryKey: ['comprobante', id],
    queryFn: () => obtenerComprobante(id as number),
    enabled: id != null,
  })

  // Plantilla del mensaje de WhatsApp: preferencia GLOBAL guardada en el
  // backend (vale para todos los usuarios y dispositivos). Sin personalizar,
  // aún cargando o con error, se usa el texto por defecto.
  const { data: prefMensaje } = useQuery({
    queryKey: ['preferencia', CLAVE_MENSAJE_FACTURA],
    queryFn: () => obtenerPreferencia(CLAVE_MENSAJE_FACTURA),
    enabled: id != null,
    staleTime: 5 * 60 * 1000,
  })
  const plantilla = plantillaEfectiva(prefMensaje?.valor)

  // Corregir con qué se cobró: interno, no toca nada fiscal (igual que el
  // estado de cobro). Al guardarlo, el resumen mensual se recalcula.
  const medioMut = useMutation({
    mutationFn: (medio: MedioPagoComprobante) => cambiarMedioPago(id as number, medio),
    onSuccess: (actualizado) => {
      queryClient.setQueryData(['comprobante', id], actualizado)
      queryClient.invalidateQueries({ queryKey: ['comprobantes'] })
      queryClient.invalidateQueries({ queryKey: ['fact-resumen'] })
    },
    onError: (e) => toast.error('No se pudo guardar el medio de cobro', (e as Error).message),
  })

  const guardarMensaje = useMutation({
    // Guardar el texto default equivale a "sin personalizar": se manda vacío,
    // así futuras mejoras del default llegan solas a quien nunca lo tocó.
    mutationFn: (nueva: string) =>
      guardarPreferencia(CLAVE_MENSAJE_FACTURA, nueva.trim() === PLANTILLA_FACTURA_DEFAULT ? '' : nueva),
    onSuccess: (pref) => {
      queryClient.setQueryData(['preferencia', CLAVE_MENSAJE_FACTURA], pref)
      setMsgOpen(false)
      toast.success('Mensaje guardado', 'Vale para todos los usuarios y dispositivos.')
    },
    onError: (e) => toast.error('No se pudo guardar', (e as Error).message),
  })

  // El modal queda montado entre aperturas: al cambiar de comprobante se
  // precargan el WhatsApp y el email con lo guardado en ESA factura.
  const clienteTelefono = c?.cliente_telefono
  const clienteEmail = c?.cliente_email
  useEffect(() => {
    setTelefono(clienteTelefono ?? '')
  }, [id, clienteTelefono])
  useEffect(() => {
    setEmail(clienteEmail ?? '')
  }, [id, clienteEmail])

  // Facturas emitidas sin teléfono o sin email: si el cliente igual está en la
  // base (por su documento), se toman de ahí. Solo rellena si el campo sigue
  // vacío, para no pisar lo que se esté tipeando.
  const docCliente = c?.cliente_doc_numero
  const { data: clientesBase = [] } = useQuery({
    queryKey: ['fact-cliente-contacto', docCliente],
    queryFn: () => buscarClientes(docCliente as string),
    enabled: id != null && (!clienteTelefono || !clienteEmail) && !!docCliente,
  })
  useEffect(() => {
    if (clienteTelefono) return
    const enBase = clientesBase.find((cl) => cl.doc_numero === docCliente && cl.telefono)
    if (enBase) setTelefono((actual) => actual || enBase.telefono)
  }, [clienteTelefono, clientesBase, docCliente])
  useEffect(() => {
    if (clienteEmail) return
    const enBase = clientesBase.find((cl) => cl.doc_numero === docCliente && cl.email)
    if (enBase) setEmail((actual) => actual || enBase.email)
  }, [clienteEmail, clientesBase, docCliente])

  async function descargar() {
    if (!c) return
    setDescargando(true)
    try {
      await descargarFacturaPdf(c)
    } catch (e) {
      toast.error('No se pudo generar el PDF', (e as Error).message)
    } finally {
      setDescargando(false)
    }
  }

  async function enviarEmail() {
    if (!c || !email.trim()) return
    setEnviando(true)
    try {
      const blob = await generarFacturaPdfBlob(c)
      const base64 = await blobABase64(blob)
      const r = await enviarComprobanteEmail(c.id, email.trim(), base64)
      toast.success('Factura enviada', r.detail)
      setEmail('')
    } catch (e) {
      toast.error('No se pudo enviar', (e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  /** Abre WhatsApp con el resumen precargado (el PDF se adjunta a mano en el chat). */
  function enviarWhatsapp() {
    if (!c) return
    const crudo = telefono.trim()
    const numero = crudo ? waNumeroArgentino(crudo) : null
    if (crudo && !numero) {
      toast.error(
        'Teléfono inválido',
        'No parece un celular argentino. Probá con área y número, ej.: 381 555-4433.',
      )
      return
    }
    const mensaje = construirMensajeFactura(plantilla, valoresDeComprobante(c))
    window.open(waLink(mensaje, numero), '_blank', 'noopener,noreferrer')
  }


  return (
    <Modal open={id != null} onClose={onClose} size="lg">
      {isLoading || !c ? (
        <div className="space-y-4 p-6">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-ink-950 text-base font-bold text-on-ink">
                {c.tipo}
              </span>
              <div>
                <h2 className="tnum text-base font-semibold text-ink-950">{c.numero_formateado}</h2>
                <p className="text-xs text-ink-400">
                  {c.emisor_nombre} · {nombreComprobante(c.clase, c.tipo)}
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
            {/* De qué factura viene esta nota de crédito, con acceso directo. */}
            {c.clase === 'nota_credito' && c.asociado && (
              <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-start gap-2 text-sm leading-relaxed text-ink-700">
                  <FileMinus2 className="mt-0.5 h-4 w-4 shrink-0 text-ink-500" aria-hidden />
                  <span>
                    Esta nota de crédito acredita la{' '}
                    <strong className="text-ink-950">
                      Factura {c.asociado.tipo} {c.asociado.numero_formateado}
                    </strong>{' '}
                    del {fecha(c.asociado.fecha)}, por {money(c.asociado.total)}.
                  </span>
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => onVerComprobante(c.asociado!.id)}
                >
                  Ver la factura
                </Button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 text-sm">
              <Dato label="Cliente" value={c.cliente_nombre} />
              <Dato label="Condición" value={CONDICION_LABEL[c.cliente_condicion]} />
              <Dato
                label={c.cliente_doc_tipo ? DOC_LABEL[c.cliente_doc_tipo] : 'Documento'}
                value={c.cliente_doc_numero || '—'}
              />
              <Dato label="Teléfono" value={c.cliente_telefono || '—'} />
              <Dato
                label="Email"
                value={<span className="block truncate">{c.cliente_email || '—'}</span>}
              />
              <Dato
                label="Estado"
                value={
                  c.clase === 'nota_credito' ? (
                    <Badge tone="outline">Crédito emitido</Badge>
                  ) : (
                    <FacturaEstadoBadge estado={estadoComprobante(c)} />
                  )
                }
              />
              <Dato label="Emisión" value={fecha(c.fecha)} />
              <Dato label="Vencimiento" value={c.vencimiento ? fecha(c.vencimiento) : '—'} />
            </div>

            {/* CAE y QR */}
            <div className="grid gap-4 rounded-xl border border-line bg-ink-50/60 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="space-y-1 text-sm">
                <p className="text-xs uppercase tracking-wide text-ink-400">Autorización ARCA</p>
                {c.cae ? (
                  <>
                    <p className="tnum text-lg font-semibold text-ink-950">CAE {c.cae}</p>
                    <p className="tnum text-xs text-ink-500">
                      Vence {c.cae_vencimiento ? fecha(c.cae_vencimiento) : '—'}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-ink-500">Sin CAE registrado.</p>
                )}
              </div>
              {c.qr ? (
                <img src={c.qr} alt="Código QR de la factura" className="h-28 w-28 self-center rounded-lg bg-white p-1" />
              ) : (
                <span className="grid h-28 w-28 place-items-center rounded-lg border border-dashed border-line text-ink-300">
                  <QrCode className="h-8 w-8" />
                </span>
              )}
            </div>

            {/* Con qué se cobró: dato INTERNO, editable. Es lo que separa el mes
                por Efectivo / Transferencias / Tarjetas al exportar. */}
            <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink-800">
                  {c.clase === 'nota_credito' ? 'Devuelto con' : 'Cobrado con'}
                </p>
                <p className="text-xs leading-relaxed text-ink-400">
                  Dato interno para el resumen mensual. No viaja a ARCA ni cambia el comprobante.
                </p>
              </div>
              <Select
                options={OPCIONES_MEDIO_PAGO}
                value={c.medio_pago ?? ''}
                onChange={(v) => medioMut.mutate(v as MedioPagoComprobante)}
                disabled={medioMut.isPending}
                className="sm:w-56"
              />
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
                  {(c.items ?? []).map((it) => (
                    <tr key={it.id}>
                      <td className="px-3 py-2 text-ink-800">{it.descripcion}</td>
                      <td className="tnum px-3 py-2 text-center text-ink-600">{num(it.cantidad)}</td>
                      <td className="tnum px-3 py-2 text-right text-ink-600">{money(it.precio_unitario)}</td>
                      <td className="tnum px-3 py-2 text-right font-medium text-ink-900">
                        {money(it.cantidad * it.precio_unitario)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="ml-auto w-full max-w-xs space-y-1.5 text-sm">
              {c.tipo !== 'C' && (
                <>
                  <Linea label="Neto" value={money(c.neto ?? 0)} />
                  <Linea label={`IVA (${Math.round(Number(c.alicuota_iva ?? IVA_RATE * 100))}%)`} value={money(c.iva ?? 0)} />
                </>
              )}
              <div className="flex items-center justify-between border-t border-line pt-2 text-base font-semibold text-ink-950">
                <span>Total</span>
                <span className="tnum">{money(c.total)}</span>
              </div>
              {c.tipo === 'C' && (
                <p className="pt-1 text-xs text-ink-400">Comprobante C · no discrimina IVA.</p>
              )}
            </div>

            {c.observaciones && (
              <p className="rounded-xl bg-ink-50 px-4 py-3 text-sm text-ink-600">{c.observaciones}</p>
            )}

            {/* Lo que ya se acreditó de esta factura y lo que queda. */}
            {c.clase !== 'nota_credito' && (c.notas_credito?.length ?? 0) > 0 && (
              <section className="rounded-xl border border-line">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-400">
                    Notas de crédito
                  </p>
                  <p className="tnum text-xs text-ink-500">
                    Acreditado <strong className="text-ink-900">{money(c.acreditado ?? 0)}</strong>
                    {' · '}queda{' '}
                    <strong className="text-ink-900">{money(c.saldo_acreditable ?? 0)}</strong>
                  </p>
                </div>
                <ul className="divide-y divide-line">
                  {(c.notas_credito ?? []).map((n) => (
                    <li
                      key={n.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm"
                    >
                      <span className="tnum font-medium text-ink-900">
                        NC {n.tipo} {n.numero_formateado}
                      </span>
                      <span className="tnum text-xs text-ink-400">{fecha(n.fecha)}</span>
                      {n.oculto && <Badge tone="outline">Oculta</Badge>}
                      <span className="tnum ml-auto font-semibold text-ink-500">
                        − {money(n.total)}
                      </span>
                      <button
                        type="button"
                        onClick={() => onVerComprobante(n.id)}
                        className="rounded-lg px-2 py-1 text-xs font-medium text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
                      >
                        Ver
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <div className="space-y-3 border-t border-line px-5 py-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enviar por email a… (cliente@correo.com)"
                className="flex-1"
              />
              <Button variant="outline" onClick={enviarEmail} disabled={enviando || !email.trim()}>
                <Mail className="h-4 w-4" />
                {enviando ? 'Enviando…' : 'Enviar'}
              </Button>
            </div>
            <div className="space-y-1.5">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  type="tel"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="Enviar por WhatsApp a… (381 555-4433)"
                  className="flex-1"
                />
                <Button variant="outline" onClick={enviarWhatsapp}>
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setMsgOpen(true)}
                  title="Editar el mensaje de WhatsApp"
                  aria-label="Editar el mensaje de WhatsApp"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-ink-400">
                Se abre tu WhatsApp con el resumen listo para enviar; el PDF adjuntalo en el chat
                (botón «Descargar PDF»). Sin teléfono, elegís el chat en WhatsApp. Con el lápiz
                editás el texto del mensaje.
              </p>
            </div>
            <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={onClose}>
                Cerrar
              </Button>
              {/* Acreditar: solo en facturas, y solo si queda saldo. */}
              {c.clase !== 'nota_credito' && (c.saldo_acreditable ?? 0) > 0 && (
                <Button variant="outline" onClick={() => onNotaCredito(c.id)}>
                  <FileMinus2 className="h-4 w-4" />
                  Nota de crédito
                </Button>
              )}
              <Button onClick={descargar} disabled={descargando}>
                <Download className="h-4 w-4" />
                {descargando ? 'Generando…' : 'Descargar PDF'}
              </Button>
            </div>
          </div>
        </>
      )}
      <MensajeWhatsappModal
        open={msgOpen}
        onClose={() => setMsgOpen(false)}
        valorActual={plantilla}
        onGuardar={(nueva) => guardarMensaje.mutate(nueva)}
        subtitulo="El texto que abre el botón «WhatsApp» del detalle de una factura."
        variables={VARIABLES_FACTURA}
        plantillaDefault={PLANTILLA_FACTURA_DEFAULT}
        construirPreview={(p) => construirMensajeFactura(p, EJEMPLO_FACTURA)}
        notaPreview="Ejemplo con una factura de muestra. Al enviar, cada variable se reemplaza por los datos reales del comprobante."
        rows={9}
      />
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
  /** Fila de la lista del taller, si el ítem vino de una venta de Caja. */
  itemServiceId?: number
}

let _k = 0
const nextKey = () => `bi-${_k++}`

function NuevaFacturaModal({
  open,
  emisor,
  productos,
  conceptos,
  limites,
  anioLimites,
  prefill,
  saving,
  onClose,
  onSubmit,
}: {
  open: boolean
  emisor: Emisor
  productos: { id: string; nombre: string; precio: number }[]
  /** Conceptos ACTIVOS del banco, para elegir con cuál emitir. */
  conceptos: ConceptoFactura[]
  /** Límites mensuales del año en curso de la cuenta (para avisar antes de emitir). */
  limites?: LimiteMes[]
  anioLimites?: number
  /** Ítems/nota precargados cuando la factura nace de una venta de Caja. */
  prefill?: PrefillFactura | null
  saving: boolean
  onClose: () => void
  onSubmit: (payload: Omit<NuevoComprobante, 'emisor'>) => void
}) {
  const [nombre, setNombre] = useState('')
  const [condicion, setCondicion] = useState<CondicionFiscal>('consumidor_final')
  const [docTipo, setDocTipo] = useState<DocTipo>('CF')
  const [docNumero, setDocNumero] = useState('')
  const [formatearDoc, setFormatearDoc] = useState(true)
  const [fechaEmision, setFechaEmision] = useState(hoyInput())
  const [vencimiento, setVencimiento] = useState(addDaysInput(15))
  const [pagada, setPagada] = useState(false)
  // Con qué se cobra. Dato INTERNO (no viaja a ARCA): es lo que separa el mes
  // por Efectivo / Transferencias / Tarjetas en la planilla que se exporta.
  const [medioPago, setMedioPago] = useState<MedioPagoComprobante>('')
  const [observaciones, setObservaciones] = useState('')
  const [items, setItems] = useState<BorradorItem[]>([])
  const [sucursalStock, setSucursalStock] = useState('')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
  // Concepto: si se usa, la factura no detalla los productos. Arranca tildado en
  // Monotributo y destildado en Responsable Inscripto (ver `conceptoPorDefecto`).
  const [usarConcepto, setUsarConcepto] = useState(false)
  const [conceptoId, setConceptoId] = useState('')

  // Autocompletado de clientes: al escribir el nombre se busca en la base (por
  // nombre, teléfono o documento) y se puede precargar un cliente ya guardado.
  const [sugerenciasAbiertas, setSugerenciasAbiertas] = useState(false)
  const [busquedaCliente, setBusquedaCliente] = useState('')
  useEffect(() => {
    const id = setTimeout(() => setBusquedaCliente(nombre.trim()), 250)
    return () => clearTimeout(id)
  }, [nombre])
  const { data: sugerenciasClientes = [] } = useQuery({
    queryKey: ['fact-clientes', busquedaCliente],
    queryFn: () => buscarClientes(busquedaCliente),
    enabled: open && sugerenciasAbiertas && busquedaCliente.length >= 2,
  })

  // Sucursales del Inventario: si la cuenta no tiene permiso (403) el selector
  // de stock directamente no se muestra y la factura sale como siempre.
  const { data: sucursalesStock = [] } = useQuery({
    queryKey: ['inv-sucursales'],
    queryFn: listarSucursales,
    enabled: open,
    retry: false,
  })
  const opcionesSucursalStock = [
    { value: '', label: 'No descontar stock' },
    ...sucursalesStock
      .filter((s) => s.activa)
      .sort((a, b) => a.orden - b.orden)
      .map((s) => ({ value: String(s.id), label: `Descontar de ${s.nombre}` })),
  ]

  useEffect(() => {
    if (!open) return
    // Con una venta precargada que ya tenía cliente, se respeta esa condición
    // fiscal si el emisor la puede facturar; si no, la primera válida
    // (Consumidor Final, para cualquier emisor).
    const condsValidas = condicionesClientePara(emisor.condicion)
    const condCliente = prefill?.cliente?.condicion
    const cond = condCliente && condsValidas.includes(condCliente) ? condCliente : condsValidas[0]
    const tipos = docTiposPara(cond)
    const docTipoCliente = prefill?.cliente?.docTipo
    setNombre(prefill?.cliente?.nombre ?? '')
    setCondicion(cond)
    setDocTipo(docTipoCliente && tipos.includes(docTipoCliente) ? docTipoCliente : tipos[0])
    setDocNumero(prefill?.cliente?.docNumero ?? '')
    setFormatearDoc(true)
    setFechaEmision(hoyInput())
    setVencimiento(addDaysInput(15))
    // Con precarga desde una venta: los ítems ya vienen armados, la venta ya
    // se cobró en el mostrador (pagada) y NO llevan `producto` — el stock ya
    // lo descontó la venta, así que acá no se vuelve a tocar.
    setPagada(prefill?.pagada ?? false)
    // Desde una venta de mostrador ya se sabe con qué se cobró: viene elegido.
    setMedioPago(prefill?.medioPago ?? '')
    setObservaciones(prefill?.observaciones ?? '')
    setItems(
      prefill?.items.length
        ? prefill.items.map((i) => ({
            key: nextKey(),
            descripcion: i.descripcion,
            cantidad: i.cantidad,
            precioUnitario: i.precioUnitario,
            // OJO: `productoId` acá NO descuenta stock (la venta ya lo hizo: el
            // selector de sucursal ni se muestra). Viaja solo por trazabilidad.
            productoId: i.productoId != null ? String(i.productoId) : undefined,
            itemServiceId: i.itemServiceId,
          }))
        : [{ key: nextKey(), descripcion: '', cantidad: 1, precioUnitario: 0 }],
    )
    setSucursalStock('')
    setTelefono(prefill?.cliente?.telefono ?? '')
    setEmail(prefill?.cliente?.email ?? '')
    setSugerenciasAbiertas(false)
    // El concepto arranca según la condición del emisor, con el predeterminado
    // del banco elegido (o el primero activo si nadie marcó uno).
    setUsarConcepto(conceptoPorDefecto(emisor.condicion) && conceptos.length > 0)
    const inicial = conceptos.find((c) => c.predeterminado) ?? conceptos[0]
    setConceptoId(inicial ? String(inicial.id) : '')
  }, [open, emisor, prefill, conceptos])

  // El descuento de stock arranca SIEMPRE activado: preseleccionado en la sucursal
  // del empleado logueado y, si la cuenta no tiene sucursal vinculada (admins), en
  // la primera activa. Siempre se puede cambiar o volver a "No descontar stock".
  // Se aplica una sola vez por apertura, recién cuando la lista de sucursales llegó
  // — si la cuenta no puede ver inventario, el selector no existe y queda como
  // siempre. Con ítems precargados desde una venta no aplica: esa venta ya descontó
  // stock y volver a descontar duplicaría el movimiento.
  const usuarioActual = useAuth((s) => s.usuario)
  const sucursalPropiaAplicada = useRef(false)
  useEffect(() => {
    if (!open) {
      sucursalPropiaAplicada.current = false
      return
    }
    if (sucursalPropiaAplicada.current || sucursalesStock.length === 0) return
    sucursalPropiaAplicada.current = true
    if (prefill?.items.length) return
    const propia = usuarioActual?.sucursal?.id
    const activas = sucursalesStock.filter((s) => s.activa).sort((a, b) => a.orden - b.orden)
    const elegida = activas.find((s) => s.id === propia) ?? activas[0]
    if (elegida) setSucursalStock(String(elegida.id))
  }, [open, sucursalesStock, prefill, usuarioActual])

  const tipo = tipoComprobante(emisor.condicion, condicion)
  const totales = useMemo(
    () =>
      calcularTotales(
        items.map((i) => ({ id: i.key, descripcion: i.descripcion, cantidad: i.cantidad, precioUnitario: i.precioUnitario })),
        tipo,
      ),
    [items, tipo],
  )

  // Aviso preventivo: si con este total el mes de la fecha de emisión queda
  // pasado del límite de la cuenta, se avisa acá mismo (y al emitir el backend
  // vuelve a chequear y pide confirmación).
  const [anioFactura, mesFactura] = fechaEmision.split('-').map(Number)
  const limiteMesFactura =
    anioLimites === anioFactura ? limites?.find((l) => l.mes === mesFactura) : undefined
  const superaLimite =
    limiteMesFactura?.monto != null &&
    totales.total > 0 &&
    limiteMesFactura.facturado + totales.total > limiteMesFactura.monto

  // La advertencia por destildar solo tiene sentido donde el concepto venía
  // tildado (Monotributo): en Responsable Inscripto lo normal es el detalle real.
  const avisaSinConcepto = conceptoPorDefecto(emisor.condicion)

  const condicionOptions = condicionesClientePara(emisor.condicion).map((c) => ({
    value: c,
    label: CONDICION_LABEL[c],
  }))
  const docTipoOptions = docTiposPara(condicion).map((d) => ({ value: d, label: DOC_LABEL[d] }))
  const productoOptions = [
    { value: '', label: 'Agregar producto del inventario…' },
    ...productos.map((p) => ({ value: p.id, label: `${p.nombre} — ${money(p.precio)}` })),
  ]

  /**
   * Aviso de stock: qué ítems NO van a mover inventario al emitir. Solo aplica
   * si la cuenta ve inventario (hay selector de sucursal) y la factura no nace
   * de una venta de mostrador, que ya descontó lo suyo.
   */
  const avisoStock = (() => {
    if (prefill?.items.length || opcionesSucursalStock.length <= 1) return null
    const cargados = items.filter((i) => i.descripcion.trim() && i.cantidad > 0)
    const aMano = cargados.filter((i) => !i.productoId)
    const delCatalogo = cargados.filter((i) => i.productoId)
    if (sucursalStock && aMano.length > 0) {
      return {
        titulo:
          aMano.length === 1
            ? 'Un ítem no va a descontar stock.'
            : `${aMano.length} ítems no van a descontar stock.`,
        ayuda:
          'Se escribieron a mano, sin vincular al catálogo. Si son mercadería, borralos y volvé a agregarlos con «Agregar producto del inventario…».',
        cuales: aMano.map((i) => i.descripcion.trim()),
      }
    }
    if (!sucursalStock && delCatalogo.length > 0) {
      return {
        titulo:
          delCatalogo.length === 1
            ? 'El ítem del catálogo no va a descontar stock.'
            : `Los ${delCatalogo.length} ítems del catálogo no van a descontar stock.`,
        ayuda:
          'El selector de arriba está en «No descontar stock»: elegí la sucursal si querés que salgan del inventario.',
        cuales: [],
      }
    }
    return null
  })()

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
      {
        key: nextKey(),
        descripcion: prod.nombre,
        cantidad: 1,
        precioUnitario: prod.precio,
        productoId: prod.id,
      },
    ])
  }
  function removeItem(key: string) {
    setItems((list) => (list.length > 1 ? list.filter((i) => i.key !== key) : list))
  }

  const toast = useToast()
  function submit() {
    if (!nombre.trim()) {
      toast.error('Falta el cliente', 'Ingresá el nombre o razón social.')
      return
    }
    if (tipo === 'A' && !docNumero.replace(/\D/g, '')) {
      toast.error('Falta el CUIT', 'La Factura A requiere el CUIT del cliente.')
      return
    }
    const cargados = items.filter((i) => i.descripcion.trim() && i.cantidad > 0)
    const validos = cargados.map((i) => ({
      descripcion: i.descripcion.trim(),
      cantidad: i.cantidad,
      precio_unitario: i.precioUnitario,
      // El origen del ítem viaja SIEMPRE: descuenta stock solo si además se
      // eligió sucursal. `item_service` es trazabilidad, nunca toca stock.
      producto: i.productoId ? Number(i.productoId) : undefined,
      item_service: i.itemServiceId,
    }))
    if (validos.length === 0) {
      toast.error('Sin ítems', 'Agregá al menos un ítem con descripción y cantidad.')
      return
    }
    if (usarConcepto && !conceptoId) {
      toast.error('Falta el concepto', 'Elegí con qué concepto emitir, o destildá la opción.')
      return
    }
    // Un Consumidor Final al que se le empezó a cargar el documento y después se
    // borró vuelve a viajar como "CF": ARCA no acepta un DNI/CUIT con número 0.
    const docDigitos = docNumero.replace(/\D/g, '')
    const docTipoFinal = condicion === 'consumidor_final' && !docDigitos ? 'CF' : docTipo
    onSubmit({
      cliente_nombre: nombre.trim(),
      cliente_doc_tipo: docTipoFinal,
      cliente_doc_numero: docDigitos,
      cliente_condicion: condicion,
      cliente_telefono: telefono.trim() || undefined,
      cliente_email: email.trim() || undefined,
      fecha: fechaEmision,
      vencimiento: vencimiento || null,
      observaciones: observaciones.trim() || undefined,
      estado_cobro: pagada ? 'pagada' : 'pendiente',
      // Vacío = no informado: el resumen mensual lo deduce de la venta ligada
      // (si la hay) y, si no, lo muestra como «sin informar».
      medio_pago: medioPago || undefined,
      items: validos,
      // Con ítems de una venta el stock YA se movió en el mostrador: la sucursal
      // nunca viaja (el selector ni se muestra), así nada se descuenta dos veces.
      sucursal_stock:
        prefill?.items.length || !sucursalStock ? undefined : Number(sucursalStock),
      // Con concepto elegido, el backend junta TODOS los renglones en uno solo
      // con ese texto. Sin concepto, la factura sale con el detalle real.
      concepto_generico: usarConcepto && conceptoId ? Number(conceptoId) : undefined,
      // Si la factura nace de una venta de mostrador, se manda su id: la venta
      // queda ligada y esa plata no se cuenta dos veces en el cliente.
      venta: prefill?.ventaId,
    })
  }

  function elegirCliente(c: Cliente) {
    // Precarga los datos del cliente guardado, respetando lo que este emisor
    // puede facturar (condición/tipo de documento válidos).
    setNombre(c.nombre)
    const condsValidas = condicionesClientePara(emisor.condicion)
    const cond = condsValidas.includes(c.condicion) ? c.condicion : condicion
    setCondicion(cond)
    const tipos = docTiposPara(cond)
    setDocTipo(tipos.includes(c.doc_tipo) ? c.doc_tipo : tipos[0])
    setDocNumero(c.doc_numero || '')
    setTelefono(c.telefono || '')
    setEmail(c.email || '')
    setSugerenciasAbiertas(false)
  }

  function handleDocChange(value: string) {
    // A un Consumidor Final el documento NO se le exige, pero se le puede cargar.
    // El tipo "CF" es el 99 de ARCA ("sin identificar") y viaja con número 0, así
    // que en cuanto se escribe un número el tipo pasa solo a DNI (se ve en el
    // selector, y desde ahí se puede cambiar a CUIT si corresponde).
    if (docTipo === 'CF' && value.replace(/\D/g, '')) {
      setDocTipo('DNI')
      setDocNumero(value)
      return
    }
    if (formatearDoc && (docTipo === 'CUIT' || docTipo === 'CUIL')) {
      setDocNumero(formatCuit(value))
    } else {
      setDocNumero(value)
    }
  }
  function toggleFormatoDoc() {
    const siguiente = !formatearDoc
    setFormatearDoc(siguiente)
    if (siguiente) setDocNumero((d) => formatCuit(d))
  }

  return (
    <Modal open={open} onClose={onClose} size="xl">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold text-ink-950">Nueva factura</h2>
          <p className="text-xs text-ink-400">
            {emisor.nombre} · {condicionEmisor(emisor)} · PV {pad(emisor.punto_venta, 4)}
            {!emisor.produccion && ' · Homologación'}
          </p>
        </div>
        <span className="flex items-center gap-2 rounded-xl bg-ink-950 px-3 py-1.5 text-sm font-semibold text-on-ink">
          Comprobante {tipo}
        </span>
      </div>

      <div className="space-y-5 overflow-y-auto px-5 py-5">
        {prefill && (
          <p className="flex items-start gap-2 rounded-xl bg-emerald-600/10 px-3.5 py-2.5 text-xs leading-relaxed text-emerald-800 ring-1 ring-emerald-600/20 dark:text-emerald-300">
            <ReceiptText className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              Precargada desde la <b>venta de mostrador</b>: los ítems ya están y el stock ya se
              descontó al vender. Confirmá los datos del cliente y emití como siempre.
            </span>
          </p>
        )}
        {/* Cliente */}
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-400">Cliente</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Campo label="Nombre / razón social">
                <div className="relative">
                  <Input
                    value={nombre}
                    onChange={(e) => {
                      setNombre(e.target.value)
                      setSugerenciasAbiertas(true)
                    }}
                    onFocus={() => setSugerenciasAbiertas(true)}
                    onBlur={() => setSugerenciasAbiertas(false)}
                    placeholder="Juan Pérez"
                    autoComplete="off"
                  />
                  {sugerenciasAbiertas && sugerenciasClientes.length > 0 && (
                    <div
                      onMouseDown={(e) => e.preventDefault()}
                      className="ct-dropdown absolute left-0 right-0 z-40 mt-2 max-h-60 overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-[0_18px_50px_rgba(10,10,11,0.16)]"
                    >
                      <p className="flex items-center gap-1.5 px-2 py-1 text-[0.7rem] font-medium uppercase tracking-[0.12em] text-ink-400">
                        <Search className="h-3 w-3" /> Clientes guardados
                      </p>
                      {sugerenciasClientes.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => elegirCliente(c)}
                          className="flex w-full flex-col items-start gap-0.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-ink-50"
                        >
                          <span className="w-full truncate text-sm font-medium text-ink-900">{c.nombre}</span>
                          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-ink-400">
                            {c.telefono && (
                              <span className="inline-flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {c.telefono}
                              </span>
                            )}
                            {c.email && (
                              <span className="inline-flex min-w-0 items-center gap-1">
                                <Mail className="h-3 w-3 shrink-0" />
                                <span className="truncate">{c.email}</span>
                              </span>
                            )}
                            {c.doc_numero && (
                              <span>
                                {DOC_LABEL[c.doc_tipo]} {c.doc_numero}
                              </span>
                            )}
                            <span>{CONDICION_LABEL[c.condicion]}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </Campo>
            </div>
            <Campo label="Teléfono / celular">
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <Input
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="381 555 1234"
                  inputMode="tel"
                  className="pl-10"
                />
              </div>
            </Campo>
            {/* Email: no viaja a ARCA. Queda en la factura (para reenviar el PDF
                sin volver a tipearlo) y en la base de clientes. */}
            <Campo label="Email">
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="cliente@correo.com"
                  inputMode="email"
                  autoComplete="off"
                  className="pl-10"
                />
              </div>
            </Campo>
            <Campo label="Condición fiscal">
              <Select
                options={condicionOptions}
                value={condicion}
                onChange={(v) => {
                  const c = v as CondicionFiscal
                  setCondicion(c)
                  setDocTipo(docTiposPara(c)[0])
                }}
              />
            </Campo>
            <Campo label="Tipo de documento">
              <Select
                options={docTipoOptions}
                value={docTipo}
                onChange={(v) => {
                  const d = v as DocTipo
                  setDocTipo(d)
                  // Volver a "CF" es decir "sin identificar": se limpia el número.
                  if (d === 'CF') setDocNumero('')
                }}
              />
            </Campo>
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label className="text-xs font-medium text-ink-500">
                  Número de documento
                  {condicion === 'consumidor_final' && (
                    <span className="font-normal text-ink-400"> · opcional</span>
                  )}
                </label>
                {(docTipo === 'CUIT' || docTipo === 'CUIL') && (
                  <button
                    type="button"
                    onClick={toggleFormatoDoc}
                    aria-pressed={formatearDoc}
                    title="Separar el CUIT con guiones automáticamente"
                    className={cn(
                      'rounded-md border px-1.5 py-0.5 text-[10px] font-semibold leading-none transition-colors',
                      formatearDoc
                        ? 'border-ink-950 bg-ink-950 text-on-ink'
                        : 'border-line-strong text-ink-400 hover:text-ink-700',
                    )}
                  >
                    Auto
                  </button>
                )}
              </div>
              <Input
                value={docNumero}
                onChange={(e) => handleDocChange(e.target.value)}
                placeholder={
                  docTipo === 'CUIT' ? '30-12345678-9' : docTipo === 'CF' ? 'Sin documento' : '12345678'
                }
                inputMode="numeric"
              />
            </div>
          </div>
        </section>

        {/* Fechas y cobro */}
        <section className="grid gap-3 sm:grid-cols-3">
          <Campo label="Fecha de emisión">
            <Input type="date" value={fechaEmision} onChange={(e) => setFechaEmision(e.target.value)} />
          </Campo>
          <Campo label="Vencimiento de pago">
            <Input type="date" value={vencimiento} onChange={(e) => setVencimiento(e.target.value)} />
          </Campo>
          {/* Interno: no viaja a ARCA. Es lo que arma las columnas Efectivo /
              Transferencias / Tarjetas del Excel de facturación del mes. */}
          <Campo label="Cobrado con">
            <Select
              options={OPCIONES_MEDIO_PAGO}
              value={medioPago}
              onChange={(v) => setMedioPago(v as MedioPagoComprobante)}
            />
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

          {/* Con ítems precargados desde una venta el selector NO se muestra:
              esa venta ya descontó el stock en el mostrador y volver a elegir
              sucursal acá lo descontaría dos veces. */}
          {opcionesSucursalStock.length > 1 && !prefill?.items.length && (
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
              <Select
                options={opcionesSucursalStock}
                value={sucursalStock}
                onChange={setSucursalStock}
                className="sm:w-64"
              />
              <p className="text-xs text-ink-400">
                Los ítems agregados desde el catálogo descuentan stock de esa sucursal al emitir.
              </p>
            </div>
          )}

          {avisoStock && (
            <div className="flex items-start gap-2.5 rounded-xl border border-line bg-ink-50 px-4 py-3 text-xs leading-relaxed text-ink-600">
              <PackageX className="mt-0.5 h-4 w-4 shrink-0 text-ink-500" aria-hidden />
              <span>
                <strong className="text-ink-900">{avisoStock.titulo}</strong> {avisoStock.ayuda}
                {avisoStock.cuales.length > 0 && (
                  <span className="mt-1 block text-ink-500">
                    {avisoStock.cuales.slice(0, 4).map((d) => `«${d}»`).join(' · ')}
                    {avisoStock.cuales.length > 4 && ` y ${avisoStock.cuales.length - 4} más`}
                  </span>
                )}
              </span>
            </div>
          )}

          {/* Concepto: qué dice la factura. Con el check tildado NO se detallan
              los productos; sale un solo renglón con el texto elegido. */}
          {conceptos.length > 0 && (
            <div className="rounded-xl border border-line bg-surface-2 px-4 py-3">
              <CampoBooleano
                etiqueta="Facturar con concepto (sin detallar los productos)"
                valor={usarConcepto}
                onChange={setUsarConcepto}
              />
              {usarConcepto ? (
                <>
                  <Select
                    options={conceptos.map((c) => ({ value: String(c.id), label: c.texto }))}
                    value={conceptoId}
                    onChange={setConceptoId}
                    className="mt-2.5"
                  />
                  <p className="mt-1.5 text-xs leading-relaxed text-ink-400">
                    La factura va a tener un solo renglón con este texto, por {money(totales.total)}.
                    El total y el stock no cambian.
                  </p>
                </>
              ) : (
                avisaSinConcepto && (
                  <p className="mt-2 flex items-start gap-2.5 text-xs leading-relaxed text-ink-600">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-ink-500" aria-hidden />
                    <span>
                      <strong className="text-ink-900">La factura va a mostrar el nombre de cada producto.</strong>{' '}
                      En cuentas Monotributistas normalmente se factura con concepto. Volvé a
                      tildarlo si no querés que se detalle lo que se vendió.
                    </span>
                  </p>
                )
              )}
            </div>
          )}

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
                    P. unit. (neto)
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
            placeholder="Notas, forma de pago, etc."
          />
        </Campo>

        {/* Aviso de límite mensual (control interno de la cuenta) */}
        {superaLimite && limiteMesFactura?.monto != null && (
          <div className="flex items-start gap-2.5 rounded-xl border border-ink-950 bg-ink-50 px-4 py-3 text-sm text-ink-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <strong>Esta factura supera el límite mensual de la cuenta.</strong>{' '}
              Límite de {nombreMes(mesFactura)}: {money(limiteMesFactura.monto)} · ya facturado{' '}
              {money(limiteMesFactura.facturado)}. Al emitir se va a pedir confirmación.
            </span>
          </div>
        )}

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

// ===== Nueva / Editar cuenta (emisor) =====

function EmisorModal({
  open,
  emisor,
  saving,
  onClose,
  onSubmit,
}: {
  open: boolean
  emisor: Emisor | null
  saving: boolean
  onClose: () => void
  onSubmit: (input: EmisorInput) => void
}) {
  const edita = Boolean(emisor)
  const [nombre, setNombre] = useState('')
  const [condicion, setCondicion] = useState<CondicionEmisor>('responsable_inscripto')
  const [cuit, setCuit] = useState('')
  const [puntoVenta, setPuntoVenta] = useState(1)
  const [produccion, setProduccion] = useState(false)
  const [activo, setActivo] = useState(true)
  const [responsableYb, setResponsableYb] = useState(false)
  const [certificado, setCertificado] = useState('')
  const [clavePrivada, setClavePrivada] = useState('')
  const toast = useToast()

  useEffect(() => {
    if (!open) return
    setNombre(emisor?.nombre ?? '')
    setCondicion(emisor?.condicion ?? 'responsable_inscripto')
    setCuit(emisor?.cuit ?? '')
    setPuntoVenta(emisor?.punto_venta ?? 1)
    setProduccion(emisor?.produccion ?? false)
    setActivo(emisor?.activo ?? true)
    setResponsableYb(emisor?.responsable_yb ?? false)
    setCertificado('')
    setClavePrivada('')
  }, [open, emisor])

  function submit() {
    if (!nombre.trim()) {
      toast.error('Falta el nombre', 'Ingresá la razón social de la cuenta.')
      return
    }
    if (cuit.replace(/\D/g, '').length !== 11) {
      toast.error('CUIT inválido', 'El CUIT debe tener 11 dígitos.')
      return
    }
    const input: EmisorInput = {
      nombre: nombre.trim(),
      condicion,
      cuit: cuit.replace(/\D/g, ''),
      punto_venta: Number(puntoVenta) || 1,
      produccion,
      activo,
      responsable_yb: responsableYb,
    }
    // Solo enviamos credenciales si se pegaron (en edición, vacío = no cambiar).
    if (certificado.trim()) input.certificado = certificado.trim()
    if (clavePrivada.trim()) input.clave_privada = clavePrivada.trim()
    onSubmit(input)
  }

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-lg font-semibold text-ink-950">{edita ? 'Editar cuenta' : 'Nueva cuenta'}</h2>
        <p className="text-xs text-ink-400">Un emisor (CUIT + punto de venta) con sus credenciales de ARCA.</p>
      </div>

      <div className="space-y-5 overflow-y-auto px-5 py-5">
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-400">Datos fiscales</h3>
          <Campo label="Nombre / razón social">
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Razón social del emisor" />
          </Campo>
          <div className="grid gap-3 sm:grid-cols-2">
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
            <div className="flex flex-col justify-center gap-2 pt-5">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
                <input
                  type="checkbox"
                  checked={produccion}
                  onChange={(e) => setProduccion(e.target.checked)}
                  className="h-4 w-4 rounded border-line-strong accent-ink-950"
                />
                Producción (CAE real)
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
                <input
                  type="checkbox"
                  checked={activo}
                  onChange={(e) => setActivo(e.target.checked)}
                  className="h-4 w-4 rounded border-line-strong accent-ink-950"
                />
                Activo
              </label>
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={responsableYb}
              onChange={(e) => setResponsableYb(e.target.checked)}
              className="h-4 w-4 rounded border-line-strong accent-ink-950"
            />
            Responsable YB <span className="text-ink-400">(la cuenta pertenece a Yerba Buena)</span>
          </label>
          <p className="rounded-xl bg-ink-50 px-4 py-3 text-xs text-ink-500">
            {condicion === 'responsable_inscripto'
              ? 'Emitirá Factura A (a Responsables Inscriptos) o B (al resto).'
              : 'Emitirá Factura C (sin IVA discriminado).'}{' '}
            {produccion
              ? 'En PRODUCCIÓN: los CAE tienen valor fiscal.'
              : 'En HOMOLOGACIÓN: ideal para probar sin emitir comprobantes reales.'}
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-400">
            Credenciales de ARCA
          </h3>
          <p className="text-xs text-ink-500">
            Certificado (.crt/.pem) y clave privada (.key) que entrega ARCA al habilitar el Web Service
            de Facturación Electrónica (wsfe) para este CUIT. Se guardan cifrados y nunca se muestran.
            {edita && ' Dejá los campos vacíos para no cambiarlos.'}
          </p>
          <Campo label="Certificado (PEM)">
            <Textarea
              value={certificado}
              onChange={(e) => setCertificado(e.target.value)}
              placeholder={edita ? 'Pegá el nuevo certificado solo si querés reemplazarlo…' : '-----BEGIN CERTIFICATE-----\n...'}
              className="min-h-[96px] font-mono text-xs"
            />
          </Campo>
          <Campo label="Clave privada (PEM)">
            <Textarea
              value={clavePrivada}
              onChange={(e) => setClavePrivada(e.target.value)}
              placeholder={edita ? 'Pegá la nueva clave solo si querés reemplazarla…' : '-----BEGIN RSA PRIVATE KEY-----\n...'}
              className="min-h-[96px] font-mono text-xs"
            />
          </Campo>
        </section>
      </div>

      <div className="flex flex-col-reverse gap-2.5 border-t border-line px-5 py-4 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="button" onClick={submit} disabled={saving}>
          {saving ? 'Guardando…' : edita ? 'Guardar cambios' : 'Crear cuenta'}
        </Button>
      </div>
    </Modal>
  )
}

// ===== Límite de facturación mensual =====

/** Configura los topes mensuales de la cuenta: mes a mes o varios de una vez. */
function LimitesModal({
  open,
  emisor,
  onClose,
}: {
  open: boolean
  emisor: Emisor
  onClose: () => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const hoy = hoyInput()
  const anioActual = Number(hoy.slice(0, 4))
  const mesActual = Number(hoy.slice(5, 7))

  const [anio, setAnio] = useState(anioActual)
  // Borradores por año: mes -> texto del input ('' = sin límite). Se guarda TODO
  // lo editado, aunque se haya cambiado de año en el medio.
  const [drafts, setDrafts] = useState<Record<number, Record<number, string>>>({})
  const [montoLote, setMontoLote] = useState('')
  const [desde, setDesde] = useState(mesActual)
  const [hasta, setHasta] = useState(12)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!open) return
    setAnio(anioActual)
    setDrafts({})
    setMontoLote('')
    setDesde(mesActual)
    setHasta(12)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, emisor.id])

  const { data, isLoading } = useQuery({
    queryKey: ['fact-limites', emisor.id, anio],
    queryFn: () => obtenerLimites(emisor.id, anio),
    enabled: open,
  })

  // Valores del año según el servidor, listos para editar. Se derivan directo
  // de la query (nada de esperar un efecto: si los datos ya estaban cacheados
  // por la página, igual quedan disponibles al abrir). Los inputs manejan pesos
  // enteros con separador de miles, así que un monto con centavos se redondea.
  const valoresBase = useMemo(() => {
    if (!data || data.anio !== anio) return undefined
    const delAnio: Record<number, string> = {}
    for (const l of data.limites) delAnio[l.mes] = l.monto != null ? String(Math.round(l.monto)) : ''
    return delAnio
  }, [data, anio])

  // Lo editado pisa a lo del servidor; sin ediciones se muestra la base.
  const draftAnio = drafts[anio] ?? valoresBase
  const facturadoPorMes = useMemo(
    () => new Map((data?.limites ?? []).map((l) => [l.mes, l.facturado])),
    [data],
  )

  function setMes(mes: number, valor: string) {
    setDrafts((d) => ({
      ...d,
      [anio]: { ...(d[anio] ?? valoresBase ?? {}), [mes]: valor },
    }))
  }

  function aplicarRango(a: number, b: number) {
    if (!draftAnio) return
    const [ini, fin] = a <= b ? [a, b] : [b, a]
    setDrafts((d) => {
      const delAnio = { ...(d[anio] ?? valoresBase ?? {}) }
      for (let m = ini; m <= fin; m++) delAnio[m] = montoLote.trim()
      return { ...d, [anio]: delAnio }
    })
  }

  const mesOptions = MESES.map((nombre, i) => ({
    value: String(i + 1),
    label: nombre.charAt(0).toUpperCase() + nombre.slice(1),
  }))

  async function guardar() {
    // Valida todos los borradores antes de mandar nada.
    for (const meses of Object.values(drafts)) {
      for (const valor of Object.values(meses)) {
        if (valor.trim() === '') continue
        const n = Number(valor)
        if (!Number.isFinite(n) || n < 0) {
          toast.error('Monto inválido', 'Revisá los montos: deben ser números positivos (o vacío para sin límite).')
          return
        }
      }
    }
    setGuardando(true)
    try {
      for (const [anioStr, meses] of Object.entries(drafts)) {
        const limites = Object.entries(meses).map(([mes, valor]) => ({
          mes: Number(mes),
          monto: valor.trim() === '' ? null : Number(valor),
        }))
        await guardarLimites(emisor.id, Number(anioStr), limites)
      }
      queryClient.invalidateQueries({ queryKey: ['fact-limites'] })
      toast.success('Límites guardados', emisor.nombre)
      onClose()
    } catch (e) {
      toast.error('No se pudieron guardar los límites', (e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold text-ink-950">Límites de facturación</h2>
          <p className="text-xs text-ink-400">
            {emisor.nombre} · tope mensual (del 1 al último día de cada mes). Es un control interno:
            no afecta la emisión en ARCA.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setAnio((a) => a - 1)}
            aria-label="Año anterior"
            className="grid h-8 w-8 place-items-center rounded-full text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="tnum w-12 text-center text-sm font-semibold text-ink-950">{anio}</span>
          <button
            type="button"
            onClick={() => setAnio((a) => a + 1)}
            aria-label="Año siguiente"
            className="grid h-8 w-8 place-items-center rounded-full text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="space-y-4 overflow-y-auto px-5 py-5">
        {/* Carga en lote: un monto para varios meses de una vez */}
        <section className="space-y-2.5 rounded-xl border border-line bg-ink-50/60 p-3.5">
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-400">
            Aplicar a varios meses de una vez
          </h3>
          <div className="grid gap-2.5 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
            <Campo label="Monto mensual">
              <Input
                value={formatMiles(montoLote)}
                onChange={(e) => setMontoLote(e.target.value.replace(/\D/g, ''))}
                placeholder="1.000.000"
                inputMode="numeric"
                className="tnum"
              />
            </Campo>
            <Campo label="Desde">
              <Select options={mesOptions} value={String(desde)} onChange={(v) => setDesde(Number(v))} />
            </Campo>
            <Campo label="Hasta">
              <Select options={mesOptions} value={String(hasta)} onChange={(v) => setHasta(Number(v))} />
            </Campo>
            <Button
              type="button"
              variant="outline"
              onClick={() => aplicarRango(desde, hasta)}
              disabled={!draftAnio}
              className="sm:mb-0"
            >
              Aplicar
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => aplicarRango(1, 12)}
              disabled={!draftAnio}
              className="rounded-lg border border-line-strong px-2.5 py-1 text-xs font-medium text-ink-600 transition-colors hover:border-ink-950 hover:text-ink-950 disabled:opacity-40"
            >
              Todo el año
            </button>
            {anio === anioActual && (
              <button
                type="button"
                onClick={() => aplicarRango(mesActual, 12)}
                disabled={!draftAnio}
                className="rounded-lg border border-line-strong px-2.5 py-1 text-xs font-medium text-ink-600 transition-colors hover:border-ink-950 hover:text-ink-950 disabled:opacity-40"
              >
                De este mes a diciembre
              </button>
            )}
            <p className="text-xs text-ink-400">
              Con el monto vacío, aplicar <em>quita</em> el límite de esos meses.
            </p>
          </div>
        </section>

        {/* Mes a mes: cada mes con su tope y lo ya facturado */}
        {isLoading && !draftAnio ? (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : (
          <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {MESES.map((nombre, i) => {
              const mes = i + 1
              const esActual = anio === anioActual && mes === mesActual
              const valor = draftAnio?.[mes] ?? ''
              const monto = Number(valor)
              const tieneLimite = valor.trim() !== '' && Number.isFinite(monto) && monto > 0
              const facturado = facturadoPorMes.get(mes) ?? 0
              const pct = tieneLimite ? (facturado / monto) * 100 : 0
              const excedido = tieneLimite && facturado > monto
              return (
                <div
                  key={mes}
                  className={cn(
                    'space-y-1.5 rounded-xl border p-2.5 transition-colors',
                    esActual ? 'border-ink-950 bg-ink-50/60' : 'border-line',
                  )}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-semibold capitalize text-ink-900">{nombre}</span>
                    {esActual && (
                      <span className="rounded-md bg-ink-950 px-1.5 py-0.5 text-[10px] font-semibold text-on-ink">
                        Este mes
                      </span>
                    )}
                  </div>
                  <Input
                    value={formatMiles(valor)}
                    onChange={(e) => setMes(mes, e.target.value.replace(/\D/g, ''))}
                    placeholder="Sin límite"
                    inputMode="numeric"
                    className="tnum h-9 px-2.5 text-sm"
                  />
                  {(facturado > 0 || tieneLimite) && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px] text-ink-400">
                        <span>Facturado</span>
                        <span className="tnum">
                          {money0(facturado)}
                          {tieneLimite && ` · ${Math.round(pct)}%`}
                        </span>
                      </div>
                      {tieneLimite && (
                        <div className="h-1.5 overflow-hidden rounded-full bg-ink-100">
                          <div
                            className={cn('h-full rounded-full', excedido ? 'bg-ink-950' : 'bg-ink-500')}
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </section>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-ink-400">
          Se guardan los cambios de todos los años que hayas editado.
        </p>
        <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" onClick={guardar} disabled={guardando || !draftAnio}>
            {guardando ? 'Guardando…' : 'Guardar límites'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ===== Auxiliares de UI =====

function IconBtn({ children, label, onClick }: { children: ReactNode; label: string; onClick: () => void }) {
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

function Campo({ label, children }: { label: string; children: ReactNode }) {
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

/**
 * Fecha (yyyy-mm-dd) en la zona horaria de Argentina, robusta ante el TZ del
 * navegador. Antes se usaba `toISOString()` (UTC): de noche ya daba el día
 * siguiente y las facturas salían fechadas mañana.
 */
function fechaArgentina(offsetDias = 0): string {
  const hoyAR = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date()) // 'yyyy-mm-dd'
  if (offsetDias === 0) return hoyAR
  const [y, m, d] = hoyAR.split('-').map(Number)
  const base = new Date(y, m - 1, d + offsetDias)
  return `${base.getFullYear()}-${pad(base.getMonth() + 1, 2)}-${pad(base.getDate(), 2)}`
}
function hoyInput(): string {
  return fechaArgentina(0)
}
function addDaysInput(n: number): string {
  return fechaArgentina(n)
}
