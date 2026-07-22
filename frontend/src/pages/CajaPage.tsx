import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowUpFromLine,
  Banknote,
  ChevronRight,
  Clock,
  EyeOff,
  FlaskConical,
  Lock,
  LockOpen,
  Plus,
  Receipt,
  ScrollText,
  Search,
  SlidersHorizontal,
  Trash2,
  Wallet,
} from 'lucide-react'
import type { CajaRegistradora, CierreCaja, MovimientoCaja, SesionCaja } from '@/types'
import * as cajaReal from '@/services/caja'
import * as cajaPractica from '@/services/cajaPractica'
import { calcularResumenSesion } from '@/services/caja'
import { resetPractica } from '@/services/cajaPractica'
import { fechaHora, money, money0, num } from '@/lib/format'
import { cn, coincideBusqueda, ctDelay, ctStagger } from '@/lib/utils'
import { esAdmin } from '@/lib/permisos'
import { useAuth } from '@/store/auth'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ToastProvider'
import { useConfirm } from '@/components/ConfirmProvider'
import { AyudaInfo } from '@/components/ui/AyudaInfo'
import { AyudaCaja } from '@/components/AyudaContenidos'
import { CierreWizard } from '@/components/caja/CierreWizard'
import { VentaRapida } from '@/components/caja/VentaRapida'
import { GuiaPractica } from '@/components/caja/GuiaPractica'
import { VentaPracticaModal, type VentaPracticaValues } from '@/components/caja/VentaPracticaModal'
import { CajaManager } from '@/components/caja/CajaManager'
import { AperturaModal, type AperturaValues } from '@/components/caja/AperturaModal'
import { MovimientoModal, type MovimientoValues } from '@/components/caja/MovimientoModal'
import { CierreDetalleModal } from '@/components/caja/CierreDetalleModal'
import { DiffChip } from '@/components/caja/DiffChip'
import { CANAL_DESCRIPCION, FACTURACION_LABEL, MEDIO_ICONO, MEDIO_LABEL, TIPO_MOV_ICONO, operacionesLabel, signoMovimiento } from '@/components/caja/medios'
import { MEDIOS_PAGO_CAJA } from '@/types'

/**
 * Caja: turnos con fondo declarado, movimientos con motivo, arqueo guiado en
 * 3 pasos y comprobantes Z inmutables, todo contra el backend real. Incluye un
 * MODO PRÁCTICA (patrón "test mode" de Stripe): mismo módulo, servicio sandbox
 * en memoria — nada se crea ni se guarda, ideal para aprender el ciclo.
 */

const zNum = (n: number) => `Z-${String(n).padStart(4, '0')}`

function horaDe(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

function duracionDesde(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms <= 0) return '0 m'
  const min = Math.floor(ms / 60000)
  const h = Math.floor(min / 60)
  return h > 0 ? `${h} h ${min % 60} m` : `${min} m`
}

function ventasDe(cierre: CierreCaja): number {
  return Object.values(cierre.ventasPorMedio).reduce((a, v) => a + v, 0)
}

export function CajaPage() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const usuario = useAuth((s) => s.usuario)
  const admin = esAdmin(usuario)
  const nombreUsuario = usuario?.username ?? 'operador'

  // --- Modo práctica (sandbox en memoria, patrón "test mode" de Stripe) --------
  // El mismo módulo con otro servicio detrás: nada de lo que pase acá llega al
  // backend, y el prefijo de query keys separa las cachés real/práctica.

  const [practica, setPractica] = useState(false)
  const svc = practica ? cajaPractica : cajaReal
  const kp = practica ? 'caja-practica' : 'caja'

  // --- Datos ------------------------------------------------------------------

  const { data: config } = useQuery({ queryKey: [kp, 'config'], queryFn: () => svc.obtenerConfigCaja() })
  const { data: cajas = [], isLoading: cargandoCajas } = useQuery({ queryKey: [kp, 'cajas'], queryFn: () => svc.listarCajas() })
  const { data: abiertas = [] } = useQuery({ queryKey: [kp, 'abiertas'], queryFn: () => svc.cajasConTurnoAbierto() })
  const { data: cierres = [], isLoading: cargandoCierres } = useQuery({ queryKey: [kp, 'cierres'], queryFn: () => svc.listarCierres() })

  const cajasVisibles = useMemo(() => {
    const activas = cajas.filter((c) => c.activa)
    if (!config?.multiCaja) return activas.slice(0, 1)
    return activas
  }, [cajas, config])

  const [cajaId, setCajaId] = useState('')
  useEffect(() => {
    if (cajasVisibles.length === 0) return
    if (!cajasVisibles.some((c) => c.id === cajaId)) setCajaId(cajasVisibles[0].id)
  }, [cajasVisibles, cajaId])

  const cajaActual = cajasVisibles.find((c) => c.id === cajaId) ?? null

  const { data: estado, isLoading: cargandoEstado } = useQuery({
    queryKey: [kp, 'estado', cajaId],
    queryFn: () => svc.obtenerEstadoCaja(cajaId),
    enabled: Boolean(cajaId),
  })
  const { data: ultimoCierre = null } = useQuery({
    queryKey: [kp, 'ultimo', cajaId],
    queryFn: () => svc.ultimoCierreDeCaja(cajaId),
    enabled: Boolean(cajaId),
  })

  const sesion = estado?.sesion ?? null
  const movimientos = useMemo(() => estado?.movimientos ?? [], [estado])
  const resumen = useMemo(
    () => (sesion ? calcularResumenSesion(sesion, movimientos) : null),
    [sesion, movimientos],
  )

  // En el panel, el esperado del efectivo solo lo ven administradores cuando
  // el cierre ciego está activo (en el arqueo no lo ve nadie).
  const ocultarEsperado = Boolean(config?.cierreCiego) && !admin

  const invalidar = () => queryClient.invalidateQueries({ queryKey: [kp] })

  // --- Mutaciones ---------------------------------------------------------------

  const abrir = useMutation({
    mutationFn: (input: cajaReal.AbrirCajaInput) => svc.abrirCaja(input),
    onSuccess: (s: SesionCaja) => {
      invalidar()
      toast.success('Caja abierta', `Turno #${s.numero} con fondo de ${money0(s.fondoInicial)}.`)
    },
    onError: (e: Error) => toast.error('No se pudo abrir la caja', e.message),
  })
  const registrar = useMutation({
    mutationFn: (input: cajaReal.MovimientoInput) => svc.registrarMovimiento(input),
    onSuccess: () => {
      invalidar()
      toast.success('Movimiento registrado')
    },
    onError: (e: Error) => toast.error('No se pudo registrar', e.message),
  })
  const borrarMov = useMutation({
    mutationFn: (id: string) => svc.eliminarMovimiento(id),
    onSuccess: () => {
      invalidar()
      toast.success('Movimiento eliminado')
    },
    onError: (e: Error) => toast.error('No se pudo eliminar', e.message),
  })
  const cerrar = useMutation({
    mutationFn: (input: cajaReal.CerrarCajaInput) => svc.cerrarCaja(input),
    onSuccess: invalidar,
  })

  // --- UI state -------------------------------------------------------------------

  const [modalApertura, setModalApertura] = useState(false)
  const [modalMovimiento, setModalMovimiento] = useState(false)
  const [modalVentaPractica, setModalVentaPractica] = useState(false)
  const [configAbierta, setConfigAbierta] = useState(false)
  const [detalle, setDetalle] = useState<CierreCaja | null>(null)
  const [q, setQ] = useState('')
  const [filtroCaja, setFiltroCaja] = useState('')

  function entrarPractica() {
    resetPractica()
    queryClient.removeQueries({ queryKey: ['caja-practica'] })
    // El id se fija en el mismo render: así ninguna query del sandbox sale con
    // el id de una caja real (ni al revés, al salir).
    setCajaId('practica')
    setPractica(true)
    toast.info('Modo práctica activado', 'Todo lo que hagas acá es de mentira y desaparece al salir.')
  }

  async function salirPractica(sinConfirmar = false) {
    if (!sinConfirmar) {
      const ok = await confirm({
        title: '¿Salir del modo práctica?',
        description: 'Todo lo que hiciste acá se descarta. La caja real está intacta.',
        confirmLabel: 'Salir',
        cancelLabel: 'Seguir practicando',
      })
      if (!ok) return
    }
    setPractica(false)
    setModalVentaPractica(false)
    setCajaId('') // el efecto elige la primera caja real
    resetPractica()
    queryClient.removeQueries({ queryKey: ['caja-practica'] })
  }

  // El asistente de cierre trabaja sobre una foto del turno: así la pantalla de
  // éxito (comprobante Z) sobrevive al refetch que deja la sesión en null.
  const [ctxCierre, setCtxCierre] = useState<{
    caja: CajaRegistradora
    sesion: SesionCaja
    movimientos: MovimientoCaja[]
  } | null>(null)

  const cierresFiltrados = useMemo(() => {
    const term = q.trim()
    return cierres.filter((c) => {
      const matchTerm =
        !term ||
        coincideBusqueda(
          `${zNum(c.numero)} ${c.cajaNombre} ${c.cerradoPor} ${c.abiertaPor} ${c.motivoDiferencia ?? ''}`,
          term,
        )
      const matchCaja = !filtroCaja || c.cajaId === filtroCaja
      return matchTerm && matchCaja
    })
  }, [cierres, q, filtroCaja])

  async function handleAbrir(values: AperturaValues) {
    if (!cajaActual) return
    try {
      await abrir.mutateAsync({ cajaId: cajaActual.id, usuario: nombreUsuario, ...values })
      setModalApertura(false)
    } catch {
      /* el toast sale del onError */
    }
  }

  async function handleMovimiento(values: MovimientoValues) {
    if (!sesion) return
    try {
      await registrar.mutateAsync({ sesionId: sesion.id, usuario: nombreUsuario, ...values })
      setModalMovimiento(false)
    } catch {
      /* el toast sale del onError */
    }
  }

  async function handleVentaPractica(values: VentaPracticaValues) {
    if (!sesion) return
    try {
      await registrar.mutateAsync({
        sesionId: sesion.id,
        usuario: nombreUsuario,
        tipo: 'venta',
        ...values,
      })
      setModalVentaPractica(false)
    } catch {
      /* el toast sale del onError */
    }
  }

  async function handleEliminarMovimiento(m: MovimientoCaja) {
    const ok = await confirm({
      title: '¿Eliminar el movimiento?',
      description: `${m.motivo} · ${money(m.monto)}. Solo se puede mientras el turno está abierto.`,
      confirmLabel: 'Eliminar',
      tone: 'danger',
    })
    if (ok) borrarMov.mutate(m.id)
  }

  // --- Asistente de cierre (reemplaza la página) -----------------------------------

  if (ctxCierre && config) {
    return (
      <>
        {practica && (
          <div className="animate-fade-in mx-auto mb-4 flex max-w-3xl items-center justify-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-3.5 py-1.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-500/30 dark:text-amber-400">
              <FlaskConical className="h-3.5 w-3.5" aria-hidden />
              Modo práctica — este cierre no se guarda
            </span>
          </div>
        )}
        <CierreWizard
          caja={ctxCierre.caja}
          sesion={ctxCierre.sesion}
          movimientos={ctxCierre.movimientos}
          config={config}
          onCerrar={(input) =>
            cerrar.mutateAsync({ ...input, sesionId: ctxCierre.sesion.id, usuario: nombreUsuario })
          }
          onSalir={() => {
            setCtxCierre(null)
            invalidar()
          }}
        />
      </>
    )
  }

  const cargando = !config || cargandoCajas || (Boolean(cajaId) && cargandoEstado)

  return (
    <div className="animate-fade-in">
      <PageHeader
        icon={practica ? FlaskConical : Wallet}
        eyebrow={practica ? 'Modo práctica' : 'Operación'}
        title="Caja"
        subtitle={
          practica
            ? 'Caja de mentira para aprender el ciclo completo: nada de esto se guarda.'
            : 'Turnos con fondo declarado, movimientos con motivo y arqueo con comprobante Z.'
        }
        className="ct-rise"
        actions={
          <>
            <AyudaInfo titulo="Cómo usar Caja">
              <AyudaCaja />
            </AyudaInfo>
            {!practica && (
              <Button variant="outline" onClick={entrarPractica} title="Ensayá sin tocar los datos reales">
                <FlaskConical className="h-4 w-4" />
                <span className="hidden sm:inline">Práctica</span>
              </Button>
            )}
            {admin && !practica && (
              <Button variant="outline" onClick={() => setConfigAbierta(true)}>
                <SlidersHorizontal className="h-4 w-4" />
                <span className="hidden sm:inline">Configurar</span>
              </Button>
            )}
            {sesion ? (
              <Button
                onClick={() => cajaActual && setCtxCierre({ caja: cajaActual, sesion, movimientos })}
              >
                <Lock className="h-4 w-4" />
                Cerrar caja
              </Button>
            ) : (
              <Button onClick={() => setModalApertura(true)} disabled={!cajaActual || cargando}>
                <LockOpen className="h-4 w-4" />
                Abrir caja
              </Button>
            )}
          </>
        }
      />

      {practica ? (
        /* La guía del sandbox: 4 pasos que se tildan solos a medida que ensayás. */
        <GuiaPractica
          sesion={sesion}
          movimientos={movimientos}
          cierres={cierres}
          onAbrir={() => setModalApertura(true)}
          onVenta={() => setModalVentaPractica(true)}
          onMovimiento={() => setModalMovimiento(true)}
          onCerrar={() => cajaActual && sesion && setCtxCierre({ caja: cajaActual, sesion, movimientos })}
          onSalir={() => salirPractica()}
        />
      ) : (
        /* Venta de mostrador: descuenta stock Y entra sola al arqueo de la caja
           que corresponde según cómo se factura (una sola carga). */
        <VentaRapida cajaId={cajaId || undefined} cajas={cajasVisibles} cajasAbiertas={abiertas} />
      )}

      {/* Selector multi-caja */}
      {config?.multiCaja && cajasVisibles.length > 1 && (
        <div className="ct-rise mb-5">
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Cajas">
          {cajasVisibles.map((c) => {
            const activa = c.id === cajaId
            const abierta = abiertas.includes(c.id)
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={activa}
                onClick={() => setCajaId(c.id)}
                className={cn(
                  'inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-all duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900',
                  activa
                    ? 'border-ink-950 bg-ink-950 text-on-ink shadow-[0_8px_18px_rgba(10,10,11,0.18)]'
                    : 'border-line bg-surface text-ink-600 hover:border-line-strong hover:text-ink-900',
                )}
              >
                {abierta && (
                  <span
                    aria-hidden
                    className={cn('relative inline-flex h-2 w-2', activa ? 'text-on-ink' : 'text-ink-950')}
                  >
                    <span className="ct-modal-halo absolute -inset-1 rounded-full border border-current opacity-60" />
                    <span className="h-2 w-2 rounded-full bg-current" />
                  </span>
                )}
                {c.nombre}
                {abierta && <span className={cn('text-[0.66rem] uppercase tracking-wide', activa ? 'text-on-ink/70' : 'text-ink-400')}>abierta</span>}
              </button>
            )
          })}
        </div>
        {cajaActual?.canal && (
          <p className="mt-2 text-xs text-ink-400">{CANAL_DESCRIPCION[cajaActual.canal]}</p>
        )}
        </div>
      )}

      {/* Estado del turno */}
      {cargando ? (
        <EstadoSkeleton />
      ) : sesion && resumen && cajaActual ? (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              className="ct-stagger-item"
              style={ctStagger(0)}
              label="Ventas del turno"
              value={money0(resumen.ventasTotal)}
              hint={operacionesLabel(resumen.operacionesTotal)}
              icon={Receipt}
            />
            <StatCard
              className="ct-stagger-item"
              style={ctStagger(1)}
              label="Efectivo esperado"
              value={
                ocultarEsperado ? (
                  <span className="inline-flex items-center gap-2 text-ink-400">
                    <EyeOff className="h-5 w-5" aria-hidden />
                    •••
                  </span>
                ) : (
                  money0(resumen.esperadoPorMedio.efectivo)
                )
              }
              hint={ocultarEsperado ? 'oculto por cierre ciego' : 'fondo + ventas − salidas'}
              icon={Banknote}
            />
            <StatCard
              className="ct-stagger-item"
              style={ctStagger(2)}
              label="Salidas de efectivo"
              value={money0(resumen.egresos + resumen.retiros)}
              hint={`egresos ${money0(resumen.egresos)} · retiros ${money0(resumen.retiros)}`}
              icon={ArrowUpFromLine}
            />
            <StatCard
              className="ct-stagger-item"
              style={ctStagger(3)}
              label="Turno abierto"
              value={duracionDesde(sesion.abiertaEn)}
              hint={`#${sesion.numero} · ${sesion.abiertaPor} · desde ${horaDe(sesion.abiertaEn)}`}
              icon={Clock}
            />
          </div>

          <div className="mb-8 grid gap-4 lg:grid-cols-2">
            {/* Ventas por medio */}
            <Card className="ct-rise overflow-hidden" style={ctDelay(60)}>
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-400">
                  Ventas por medio de pago
                </p>
                <span className="tnum text-xs text-ink-400">{num(resumen.operacionesTotal)} op.</span>
              </div>
              <div className="divide-y divide-line">
                {MEDIOS_PAGO_CAJA.map((m, i) => {
                  const Icon = MEDIO_ICONO[m.value]
                  const monto = resumen.ventasPorMedio[m.value]
                  return (
                    <div key={m.value} className="ct-stagger-fade flex items-center gap-3 px-4 py-3" style={ctStagger(i)}>
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-ink-50 text-ink-500 ring-1 ring-line">
                        <Icon className="h-4 w-4" strokeWidth={1.75} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink-900">{m.label}</p>
                        <p className="tnum text-xs text-ink-400">
                          {operacionesLabel(resumen.operacionesPorMedio[m.value])}
                        </p>
                      </div>
                      <span className={cn('tnum ml-auto text-sm font-semibold', monto > 0 ? 'text-ink-950' : 'text-ink-300')}>
                        {money(monto)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </Card>

            {/* Movimientos del turno */}
            <Card className="ct-rise overflow-hidden" style={ctDelay(120)}>
              <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-400">
                  Movimientos del turno
                </p>
                <Button size="sm" variant="outline" onClick={() => setModalMovimiento(true)}>
                  <Plus className="h-4 w-4" />
                  Nuevo
                </Button>
              </div>
              <div className="max-h-[26rem] divide-y divide-line overflow-y-auto">
                {movimientos.length === 0 && (
                  <p className="px-4 py-6 text-center text-sm text-ink-400">
                    Todavía no hay movimientos en este turno.
                  </p>
                )}
                {movimientos
                  .slice()
                  .reverse()
                  .map((m, i) => {
                    const Icon = TIPO_MOV_ICONO[m.tipo]
                    const negativo = signoMovimiento(m.tipo) < 0
                    return (
                      <div key={m.id} className="ct-stagger-fade group flex items-center gap-3 px-4 py-2.5" style={ctStagger(i)}>
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-ink-100 text-ink-600">
                          <Icon className="h-4 w-4" strokeWidth={1.75} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink-900">{m.motivo}</p>
                          <p className="truncate text-xs text-ink-400">
                            <span className="tnum">{horaDe(m.fecha)}</span> · {m.usuario}
                            {m.tipo !== 'venta' ? '' : ` · ${MEDIO_LABEL[m.medio]}`}
                            {m.tipo === 'venta' && m.facturacion ? ` · ${FACTURACION_LABEL[m.facturacion]}` : ''}
                            {m.detalle ? ` · ${m.detalle}` : ''}
                          </p>
                        </div>
                        <span className={cn('tnum shrink-0 text-sm font-semibold', negativo ? 'text-ink-500' : 'text-ink-950')}>
                          {negativo ? '− ' : ''}
                          {money(m.monto)}
                        </span>
                        {m.tipo !== 'venta' && (
                          <button
                            type="button"
                            onClick={() => handleEliminarMovimiento(m)}
                            aria-label={`Eliminar movimiento ${m.motivo}`}
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-300 opacity-0 transition-all hover:bg-ink-100 hover:text-ink-900 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 group-hover:opacity-100"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    )
                  })}
              </div>
            </Card>
          </div>
        </>
      ) : (
        <div className="mb-8">
          <EmptyState
            className="ct-rise"
            icon={Wallet}
            title={`${cajaActual?.nombre ?? 'Caja'} está cerrada`}
            description={
              ultimoCierre
                ? `El último cierre (${zNum(ultimoCierre.numero)}) dejó ${money(ultimoCierre.fondoSiguiente)} de fondo en caja.`
                : 'Abrí el turno declarando el fondo inicial para empezar a operar.'
            }
            action={
              <Button onClick={() => setModalApertura(true)} disabled={!cajaActual}>
                <LockOpen className="h-4 w-4" />
                Abrir caja
              </Button>
            }
          />
        </div>
      )}

      {/* ===== Historial de cierres ===== */}
      <section>
        <div className="ct-rise mb-4 flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-ink-50 text-ink-500 ring-1 ring-line">
            <ScrollText className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <div>
            <h2 className="text-lg font-bold tracking-[-0.02em] text-ink-950">Historial de cierres</h2>
            <p className="text-xs text-ink-400">
              {num(cierres.length)} {cierres.length === 1 ? 'comprobante' : 'comprobantes'} Z ·{' '}
              {practica ? 'de práctica — se descartan al salir' : 'inmutables, con arqueo completo'}
            </p>
          </div>
        </div>

        <div className="ct-rise mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por número, caja, responsable o motivo"
              className="pl-10"
            />
          </div>
          {config?.multiCaja && cajas.length > 1 && (
            <Select
              options={[{ value: '', label: 'Todas las cajas' }, ...cajas.map((c) => ({ value: c.id, label: c.nombre }))]}
              value={filtroCaja}
              onChange={setFiltroCaja}
              placeholder="Caja"
              className="sm:w-52"
            />
          )}
        </div>

        {cargandoCierres ? (
          <HistorialSkeleton />
        ) : cierresFiltrados.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title={cierres.length === 0 ? 'Todavía no hay cierres' : 'Sin resultados'}
            description={
              cierres.length === 0
                ? 'El primer comprobante Z va a aparecer acá cuando cierres un turno.'
                : 'Probá con otra búsqueda o cambiá el filtro de caja.'
            }
          />
        ) : (
          <>
            {/* Tabla (md+) */}
            <Card className="ct-rise hidden overflow-hidden md:block">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-400">
                      <th className="px-4 py-3 font-semibold">Comprobante</th>
                      <th className="px-4 py-3 font-semibold">Caja</th>
                      <th className="px-4 py-3 font-semibold">Cierre</th>
                      <th className="px-4 py-3 font-semibold">Responsable</th>
                      <th className="px-4 py-3 text-right font-semibold">Ventas</th>
                      <th className="px-4 py-3 text-right font-semibold">Diferencia</th>
                      <th className="w-10 px-2 py-3" aria-label="Ver detalle" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {cierresFiltrados.map((c, i) => (
                      <tr
                        key={c.id}
                        onClick={() => setDetalle(c)}
                        className="ct-stagger-fade group cursor-pointer hover:bg-ink-50"
                        style={ctStagger(i)}
                      >
                        <td className="px-4 py-3">
                          <p className="tnum font-semibold text-ink-950">{zNum(c.numero)}</p>
                          <p className="tnum text-xs text-ink-400">turno #{c.sesionNumero}</p>
                        </td>
                        <td className="px-4 py-3 text-ink-600">{c.cajaNombre}</td>
                        <td className="tnum px-4 py-3 text-ink-600">{fechaHora(c.cerradaEn)}</td>
                        <td className="px-4 py-3 text-ink-600">{c.cerradoPor}</td>
                        <td className="tnum px-4 py-3 text-right font-semibold text-ink-900">
                          {money0(ventasDe(c))}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <DiffChip valor={c.diferenciaTotal} />
                        </td>
                        <td className="px-2 py-3 text-ink-300 transition-colors group-hover:text-ink-600">
                          <ChevronRight className="h-4 w-4" aria-hidden />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Cards (móvil) */}
            <div className="space-y-3 md:hidden">
              {cierresFiltrados.map((c, i) => (
                <Card key={c.id} className="ct-stagger-item p-4" style={ctStagger(i)}>
                  <button type="button" onClick={() => setDetalle(c)} className="block w-full text-left">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="tnum font-semibold text-ink-950">
                          {zNum(c.numero)} <span className="font-normal text-ink-400">· {c.cajaNombre}</span>
                        </p>
                        <p className="tnum mt-0.5 text-xs text-ink-400">
                          {fechaHora(c.cerradaEn)} · {c.cerradoPor}
                        </p>
                      </div>
                      <span className="tnum shrink-0 font-semibold text-ink-900">{money0(ventasDe(c))}</span>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <DiffChip valor={c.diferenciaTotal} />
                      <span className="inline-flex items-center gap-1 text-xs text-ink-400">
                        Ver detalle <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                      </span>
                    </div>
                  </button>
                </Card>
              ))}
            </div>
          </>
        )}
      </section>

      {/* ===== Modales ===== */}
      {config && (
        <AperturaModal
          open={modalApertura}
          caja={cajaActual}
          config={config}
          ultimoCierre={ultimoCierre}
          saving={abrir.isPending}
          onClose={() => setModalApertura(false)}
          onSubmit={handleAbrir}
        />
      )}
      {config && (
        <MovimientoModal
          open={modalMovimiento}
          retirosHabilitados={config.retirosHabilitados}
          efectivoDisponible={resumen?.esperadoPorMedio.efectivo ?? 0}
          saving={registrar.isPending}
          onClose={() => setModalMovimiento(false)}
          onSubmit={handleMovimiento}
        />
      )}
      {practica && (
        <VentaPracticaModal
          open={modalVentaPractica}
          saving={registrar.isPending}
          onClose={() => setModalVentaPractica(false)}
          onSubmit={handleVentaPractica}
        />
      )}
      <CierreDetalleModal open={Boolean(detalle)} cierre={detalle} onClose={() => setDetalle(null)} />
      {admin && !practica && <CajaManager open={configAbierta} onClose={() => setConfigAbierta(false)} />}
    </div>
  )
}

// ===== Skeletons =====

function EstadoSkeleton() {
  return (
    <div className="mb-8 space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-6 w-28" />
            <Skeleton className="mt-2 h-3 w-20" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i} className="overflow-hidden">
            <div className="divide-y divide-line">
              {Array.from({ length: 5 }).map((_, j) => (
                <div key={j} className="flex items-center gap-3 px-4 py-3.5">
                  <Skeleton className="h-8 w-8 rounded-xl" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-1/3" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

function HistorialSkeleton() {
  return (
    <Card className="overflow-hidden">
      <div className="divide-y divide-line">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-4">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5 w-1/4" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-6 w-28 rounded-full" />
          </div>
        ))}
      </div>
    </Card>
  )
}
