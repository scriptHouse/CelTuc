import { useEffect, useMemo, useState } from 'react'
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
  FileText,
  Gauge,
  Mail,
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
  Cliente,
  Comprobante,
  CondicionEmisor,
  CondicionFiscal,
  DocTipo,
  Emisor,
  EstadoEfectivo,
} from '@/types'
import {
  actualizarEmisor,
  buscarClientes,
  cambiarEstadoCobro,
  crearEmisor,
  eliminarComprobante,
  emitirComprobante,
  enviarComprobanteEmail,
  guardarLimites,
  listarComprobantes,
  listarEmisores,
  obtenerComprobante,
  obtenerLimites,
  probarConexion,
  type EmisorInput,
  type LimiteExcedido,
  type LimiteMes,
  type NuevoComprobante,
} from '@/services/facturacion'
import { listarProductos } from '@/services/productos'
import { listarSucursales } from '@/services/inventario'
import {
  calcularTotales,
  condicionesClientePara,
  CONDICION_CORTA,
  CONDICION_LABEL,
  IVA_RATE,
  tipoComprobante,
} from '@/lib/afip'
import { fecha, money, money0, num, pad } from '@/lib/format'
import { ApiError } from '@/lib/api'
import { cn, ctStagger } from '@/lib/utils'
import { useAuth } from '@/store/auth'
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
import { FacturaEstadoBadge } from '@/components/ui/StatusBadge'
import { useToast } from '@/components/ToastProvider'
import { useConfirm } from '@/components/ConfirmProvider'

const DOC_LABEL: Record<DocTipo, string> = {
  CUIT: 'CUIT',
  CUIL: 'CUIL',
  DNI: 'DNI',
  CF: 'Consumidor Final',
}

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

/** Formatea un monto con separador de miles (1234567 → 1.234.567) al escribir. */
function formatMiles(value: string): string {
  const d = value.replace(/\D/g, '')
  return d ? Number(d).toLocaleString('es-AR') : ''
}

/** Formatea un CUIT/CUIL como 20-14343433-6 a medida que se escribe. */
function formatCuit(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 10) return `${d.slice(0, 2)}-${d.slice(2)}`
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`
}

/** Estado visible de un comprobante: pagada, vencida o pendiente. */
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
  a.download = `factura-${c.tipo}-${c.numero_formateado}.pdf`
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

  const [facturaModal, setFacturaModal] = useState(false)
  const [emisorModal, setEmisorModal] = useState(false)
  const [emisorEdit, setEmisorEdit] = useState<Emisor | null>(null)
  const [limitesModal, setLimitesModal] = useState(false)
  const [detalleId, setDetalleId] = useState<number | null>(null)

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
  }

  const emitirMut = useMutation({
    mutationFn: (input: NuevoComprobante) => emitirComprobante(input),
    onSuccess: (c) => {
      invalidarComprobantes()
      queryClient.invalidateQueries({ queryKey: ['inv-stock'] })
      queryClient.invalidateQueries({ queryKey: ['inv-movimientos'] })
      setFacturaModal(false)
      setDetalleId(c.id)
      toast.success(`Factura ${c.tipo} emitida`, c.cae ? `CAE ${c.cae}` : `Total ${money(c.total)}`)
      // La factura salió igual: esto es solo lo que NO se pudo descontar.
      if (c.avisos_stock?.length) toast.info('Stock sin descontar', c.avisos_stock.join(' '))
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

  const stats = useMemo(() => {
    const total = comprobantes.reduce((a, c) => a + c.total, 0)
    const cobrado = comprobantes
      .filter((c) => c.estado_cobro === 'pagada')
      .reduce((a, c) => a + c.total, 0)
    const pendiente = comprobantes
      .filter((c) => c.estado_cobro !== 'pagada')
      .reduce((a, c) => a + c.total, 0)
    return { total, cobrado, pendiente, cantidad: comprobantes.length }
  }, [comprobantes])

  async function handleEliminar(c: Comprobante) {
    const ok = await confirm({
      title: `¿Quitar la factura ${c.tipo}?`,
      description: `N° ${c.numero_formateado} · ${money(c.total)}. No anula el comprobante en ARCA (para eso se emite una Nota de Crédito); solo lo oculta de la lista.`,
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
          <div className="ct-rise mb-3 flex gap-2.5 overflow-x-auto pb-1">
            {emisores.map((e) => {
              const activa = e.id === emisorId
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setEmisorId(e.id)}
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
                    <span className="flex items-center gap-1.5">
                      <span className="block truncate text-sm font-semibold">{e.nombre}</span>
                      {!e.tiene_credenciales && (
                        <ShieldAlert
                          className={cn('h-3.5 w-3.5 shrink-0', activa ? 'text-on-ink/80' : 'text-ink-400')}
                        />
                      )}
                    </span>
                    <span className={cn('tnum block truncate text-xs', activa ? 'text-on-ink/70' : 'text-ink-400')}>
                      {CONDICION_CORTA[e.condicion]} · PV {pad(e.punto_venta, 4)}
                      {!e.activo && ' · Inactivo'}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>

          {/* Barra de estado del emisor seleccionado */}
          {emisor && (
            <Card className="ct-rise mb-5 space-y-3 p-3.5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge tone={emisor.produccion ? 'solid' : 'outline'}>
                    {emisor.produccion ? 'Producción' : 'Homologación'}
                  </Badge>
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
                  {soySuper && (
                    <Button variant="outline" size="sm" onClick={() => setLimitesModal(true)}>
                      <Gauge className="h-4 w-4" />
                      Límites
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
          <StatCard className="ct-stagger-item" style={ctStagger(0)} label="Facturado" value={money(stats.total)} icon={ReceiptText} />
          <StatCard className="ct-stagger-item" style={ctStagger(1)} label="Cobrado" value={money(stats.cobrado)} icon={CheckCircle2} />
          <StatCard className="ct-stagger-item" style={ctStagger(2)} label="Pendiente" value={money(stats.pendiente)} icon={Wallet} />
          <StatCard className="ct-stagger-item" style={ctStagger(3)} label="Comprobantes" value={num(stats.cantidad)} icon={FileText} />
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
        ) : (
          <Card className="ct-rise overflow-hidden">
            <ul className="divide-y divide-line">
              {comprobantes.map((c, i) => (
                <li
                  key={c.id}
                  className="ct-stagger-fade flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-ink-50 sm:px-5"
                  style={ctStagger(i)}
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink-950 text-sm font-bold text-on-ink">
                    {c.tipo}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-900">{c.cliente_nombre}</p>
                    <p className="tnum truncate text-xs text-ink-400">
                      {c.numero_formateado} · {fecha(c.fecha)}
                    </p>
                  </div>
                  <div className="hidden shrink-0 text-right sm:block">
                    <p className="tnum text-sm font-semibold text-ink-900">{money(c.total)}</p>
                    {c.cae ? (
                      <p className="tnum text-xs text-ink-400">CAE {c.cae}</p>
                    ) : (
                      <p className="text-xs text-ink-400">sin CAE</p>
                    )}
                  </div>
                  <div className="w-[104px] shrink-0 text-center">
                    <FacturaEstadoBadge estado={estadoComprobante(c)} />
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <IconBtn label="Ver detalle" onClick={() => setDetalleId(c.id)}>
                      <Eye className="h-4 w-4" />
                    </IconBtn>
                    <IconBtn label="Descargar PDF" onClick={() => handleDescargar(c)}>
                      <Download className="h-4 w-4" />
                    </IconBtn>
                    {c.estado_cobro === 'pendiente' ? (
                      <IconBtn label="Marcar pagada" onClick={() => estadoMut.mutate({ id: c.id, estado: 'pagada' })}>
                        <CheckCircle2 className="h-4 w-4" />
                      </IconBtn>
                    ) : (
                      <IconBtn label="Marcar pendiente" onClick={() => estadoMut.mutate({ id: c.id, estado: 'pendiente' })}>
                        <Clock className="h-4 w-4" />
                      </IconBtn>
                    )}
                    <IconBtn label="Quitar" onClick={() => handleEliminar(c)}>
                      <Trash2 className="h-4 w-4" />
                    </IconBtn>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ))}

      {emisor && (
        <NuevaFacturaModal
          open={facturaModal}
          emisor={emisor}
          productos={productos}
          limites={limitesAnio?.limites}
          anioLimites={limitesAnio?.anio}
          saving={emitirMut.isPending}
          onClose={() => setFacturaModal(false)}
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

      <DetalleModal id={detalleId} onClose={() => setDetalleId(null)} />
    </div>
  )
}

// ===== Detalle (con CAE y QR) =====

function DetalleModal({ id, onClose }: { id: number | null; onClose: () => void }) {
  const toast = useToast()
  const [descargando, setDescargando] = useState(false)
  const [email, setEmail] = useState('')
  const [enviando, setEnviando] = useState(false)
  const { data: c, isLoading } = useQuery({
    queryKey: ['comprobante', id],
    queryFn: () => obtenerComprobante(id as number),
    enabled: id != null,
  })

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
                  {c.emisor_nombre} · Factura {c.tipo}
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
              <Dato label="Cliente" value={c.cliente_nombre} />
              <Dato label="Condición" value={CONDICION_LABEL[c.cliente_condicion]} />
              <Dato
                label={c.cliente_doc_tipo ? DOC_LABEL[c.cliente_doc_tipo] : 'Documento'}
                value={c.cliente_doc_numero || '—'}
              />
              <Dato label="Teléfono" value={c.cliente_telefono || '—'} />
              <Dato label="Estado" value={<FacturaEstadoBadge estado={estadoComprobante(c)} />} />
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
            <div className="flex justify-end gap-2.5">
              <Button variant="outline" onClick={onClose}>
                Cerrar
              </Button>
              <Button onClick={descargar} disabled={descargando}>
                <Download className="h-4 w-4" />
                {descargando ? 'Generando…' : 'Descargar PDF'}
              </Button>
            </div>
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
  emisor,
  productos,
  limites,
  anioLimites,
  saving,
  onClose,
  onSubmit,
}: {
  open: boolean
  emisor: Emisor
  productos: { id: string; nombre: string; precio: number }[]
  /** Límites mensuales del año en curso de la cuenta (para avisar antes de emitir). */
  limites?: LimiteMes[]
  anioLimites?: number
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
  const [observaciones, setObservaciones] = useState('')
  const [items, setItems] = useState<BorradorItem[]>([])
  const [sucursalStock, setSucursalStock] = useState('')
  const [telefono, setTelefono] = useState('')

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
    const cond = condicionesClientePara(emisor.condicion)[0]
    setNombre('')
    setCondicion(cond)
    setDocTipo(docTiposPara(cond)[0])
    setDocNumero('')
    setFormatearDoc(true)
    setFechaEmision(hoyInput())
    setVencimiento(addDaysInput(15))
    setPagada(false)
    setObservaciones('')
    setItems([{ key: nextKey(), descripcion: '', cantidad: 1, precioUnitario: 0 }])
    setSucursalStock('')
    setTelefono('')
    setSugerenciasAbiertas(false)
  }, [open, emisor])

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

  const condicionOptions = condicionesClientePara(emisor.condicion).map((c) => ({
    value: c,
    label: CONDICION_LABEL[c],
  }))
  const docTipoOptions = docTiposPara(condicion).map((d) => ({ value: d, label: DOC_LABEL[d] }))
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
  function submit() {
    if (!nombre.trim()) {
      toast.error('Falta el cliente', 'Ingresá el nombre o razón social.')
      return
    }
    if (tipo === 'A' && !docNumero.replace(/\D/g, '')) {
      toast.error('Falta el CUIT', 'La Factura A requiere el CUIT del cliente.')
      return
    }
    const validos = items
      .filter((i) => i.descripcion.trim() && i.cantidad > 0)
      .map((i) => ({
        descripcion: i.descripcion.trim(),
        cantidad: i.cantidad,
        precio_unitario: i.precioUnitario,
        // Con sucursal elegida, los ítems del catálogo descuentan stock.
        producto: sucursalStock && i.productoId ? Number(i.productoId) : undefined,
      }))
    if (validos.length === 0) {
      toast.error('Sin ítems', 'Agregá al menos un ítem con descripción y cantidad.')
      return
    }
    onSubmit({
      cliente_nombre: nombre.trim(),
      cliente_doc_tipo: docTipo,
      cliente_doc_numero: docNumero.replace(/\D/g, ''),
      cliente_condicion: condicion,
      cliente_telefono: telefono.trim() || undefined,
      fecha: fechaEmision,
      vencimiento: vencimiento || null,
      observaciones: observaciones.trim() || undefined,
      estado_cobro: pagada ? 'pagada' : 'pendiente',
      items: validos,
      sucursal_stock: sucursalStock ? Number(sucursalStock) : undefined,
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
    setSugerenciasAbiertas(false)
  }

  function handleDocChange(value: string) {
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
            {emisor.nombre} · {CONDICION_CORTA[emisor.condicion]} · PV {pad(emisor.punto_venta, 4)}
            {!emisor.produccion && ' · Homologación'}
          </p>
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
                onChange={(v) => setDocTipo(v as DocTipo)}
              />
            </Campo>
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label className="text-xs font-medium text-ink-500">Número de documento</label>
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
                placeholder={docTipo === 'CUIT' ? '30-12345678-9' : '12345678'}
                disabled={docTipo === 'CF'}
                inputMode="numeric"
              />
            </div>
          </div>
        </section>

        {/* Fechas */}
        <section className="grid gap-3 sm:grid-cols-2">
          <Campo label="Fecha de emisión">
            <Input type="date" value={fechaEmision} onChange={(e) => setFechaEmision(e.target.value)} />
          </Campo>
          <Campo label="Vencimiento de pago">
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

          {opcionesSucursalStock.length > 1 && (
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

/** Barra de uso del límite del mes en curso (en la tarjeta de la cuenta). */
function LimiteUsoBar({
  mesNombre,
  limite,
  facturado,
}: {
  mesNombre: string
  limite: number
  facturado: number
}) {
  const pct = limite > 0 ? (facturado / limite) * 100 : 100
  const excedido = facturado > limite
  const cerca = !excedido && pct >= 80
  return (
    <div className="space-y-1.5 border-t border-line pt-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
        <span className="flex items-center gap-1.5 font-medium text-ink-600">
          <Gauge className="h-3.5 w-3.5" />
          Límite de <span className="capitalize">{mesNombre}</span>
          {excedido && (
            <span className="inline-flex items-center gap-1 rounded-md bg-ink-950 px-1.5 py-0.5 text-[10px] font-semibold text-on-ink">
              <AlertTriangle className="h-3 w-3" /> Superado
            </span>
          )}
          {cerca && (
            <span className="rounded-md border border-ink-950 px-1.5 py-0.5 text-[10px] font-semibold text-ink-900">
              Cerca del tope
            </span>
          )}
        </span>
        <span className="tnum text-ink-500">
          {money(facturado)} de {money(limite)} · {Math.round(pct)}%
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-ink-100">
        <div
          className={cn('h-full rounded-full transition-all duration-300', excedido ? 'bg-ink-950' : 'bg-ink-600')}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      {excedido && (
        <p className="text-xs text-ink-500">
          Superado por {money(facturado - limite)}. Al emitir otra factura este mes se va a pedir confirmación.
        </p>
      )}
    </div>
  )
}

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
