import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowRightLeft,
  Boxes,
  Landmark,
  LayoutDashboard,
  PackageSearch,
  Receipt,
  ReceiptText,
  RefreshCw,
  Users,
  Wallet,
} from 'lucide-react'
import { obtenerResumen } from '@/services/dashboard'
import { useAuth } from '@/store/auth'
import { esAdmin } from '@/lib/permisos'
import { resetDB } from '@/lib/db'
import { CONDICION_CORTA, estadoEfectivo, numeroComprobante } from '@/lib/afip'
import { fecha, money, moneyCompact, num } from '@/lib/format'
import { cn, ctDelay, ctStagger } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { MiniBars } from '@/components/ui/MiniBars'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { Button } from '@/components/ui/Button'
import { FacturaEstadoBadge } from '@/components/ui/StatusBadge'
import { Cartelera } from '@/components/Cartelera'
import { GestorDolar } from '@/components/GestorDolar'
import { useToast } from '@/components/ToastProvider'
import { useConfirm } from '@/components/ConfirmProvider'

export function PanelPage() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const usuario = useAuth((s) => s.usuario)
  const admin = esAdmin(usuario)
  // Los números del negocio son SOLO para administradores: a los empleados ni
  // siquiera se les consulta el resumen (ven cartelera + dólar vigente).
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: obtenerResumen,
    enabled: admin,
  })

  async function handleReset() {
    const ok = await confirm({
      title: '¿Restaurar datos de demostración?',
      description: 'Se reemplazan los datos actuales (productos y facturas) por los de ejemplo.',
      confirmLabel: 'Restaurar',
      tone: 'danger',
    })
    if (!ok) return
    resetDB()
    await queryClient.invalidateQueries()
    toast.success('Datos restaurados', 'Volvimos a los datos de ejemplo.')
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        icon={LayoutDashboard}
        eyebrow="Resumen"
        title="Panel"
        subtitle={
          admin
            ? 'Una mirada rápida del negocio: ventas, stock y equipo.'
            : 'Novedades del equipo y el dólar vigente.'
        }
        className="ct-rise"
        actions={
          admin ? (
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RefreshCw className="h-4 w-4" />
              Restaurar demo
            </Button>
          ) : undefined
        }
      />

      {/* Gestor de dólar: el admin ve el del negocio + el blue de DolarAPI; los
          empleados ven SOLO el dólar vigente del negocio, en modo lectura. */}
      <div className="ct-rise mb-5">
        <GestorDolar soloLectura={!admin} soloDolarNegocio={!admin} />
      </div>

      {/* Cartelera de comunicación interna: publica el admin, el equipo marca visto. */}
      <Cartelera />

      {/* Todo lo que sigue son números del negocio: SOLO administradores. */}
      {!admin ? null : isLoading || !data ? (
        <PanelSkeleton />
      ) : (
        <div className="space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              className="ct-stagger-item"
              style={ctStagger(0)}
              label="Facturado (mes)"
              value={moneyCompact(data.facturacion.facturadoMes)}
              hint={`${num(data.facturacion.cantidadMes)} comprobantes emitidos`}
              icon={ReceiptText}
            />
            <StatCard
              className="ct-stagger-item"
              style={ctStagger(1)}
              label="Pendiente de cobro"
              value={moneyCompact(data.facturacion.pendienteTotal)}
              hint={
                data.facturacion.vencidasCount > 0
                  ? `${data.facturacion.vencidasCount} vencidas`
                  : 'Sin vencidas'
              }
              icon={Wallet}
            />
            <StatCard
              className="ct-stagger-item"
              style={ctStagger(2)}
              label="Valor inventario"
              value={moneyCompact(data.inventario.valorVenta)}
              hint={`${num(data.inventario.totalProductos)} productos · ${num(data.inventario.unidades)} u.`}
              icon={Boxes}
            />
            <StatCard
              className="ct-stagger-item"
              style={ctStagger(3)}
              label="Empleados"
              value={num(data.empleados.total)}
              hint={`${data.empleados.conAcceso} con acceso`}
              icon={Users}
            />
          </div>

          {/* Facturación real (ARCA) del mes por condición fiscal + transferencias */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatCard
              className="ct-stagger-item"
              style={ctStagger(4)}
              label="Resp. Inscripto (mes)"
              value={moneyCompact(data.facturacionReal.riMes)}
              hint={
                data.facturacionReal.riCount > 0
                  ? `${num(data.facturacionReal.riCount)} facturas A/B`
                  : 'Sin facturas A/B este mes'
              }
              icon={Landmark}
            />
            <StatCard
              className="ct-stagger-item"
              style={ctStagger(5)}
              label="Monotributo (mes)"
              value={moneyCompact(data.facturacionReal.monoMes)}
              hint={
                data.facturacionReal.monoCount > 0
                  ? `${num(data.facturacionReal.monoCount)} facturas C`
                  : 'Sin facturas C este mes'
              }
              icon={Receipt}
            />
            <StatCard
              className="ct-stagger-item"
              style={ctStagger(6)}
              label="Transferencias (mes)"
              value={moneyCompact(data.transferencias.totalMes)}
              hint={
                data.transferencias.operacionesMes > 0
                  ? `${num(data.transferencias.operacionesMes)} ventas de mostrador`
                  : 'Sin ventas por transferencia'
              }
              icon={ArrowRightLeft}
            />
          </div>

          {/* Gráfico + por cuenta */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="ct-rise p-5 lg:col-span-2" style={ctDelay(60)}>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-ink-900">Facturación</h2>
                  <p className="text-xs text-ink-400">Últimos 6 meses</p>
                </div>
                <span className="tnum text-sm font-semibold text-ink-900">
                  {money(data.facturacion.serie.reduce((a, s) => a + s.valor, 0))}
                </span>
              </div>
              <MiniBars data={data.facturacion.serie} format={money} height={140} />
            </Card>

            <Card className="ct-rise p-5" style={ctDelay(110)}>
              <h2 className="mb-4 text-base font-semibold text-ink-900">Por cuenta</h2>
              <div className="space-y-4">
                {data.facturacion.porCuenta.map(({ cuenta, total, count }) => {
                  const max = Math.max(1, ...data.facturacion.porCuenta.map((p) => p.total))
                  return (
                    <div key={cuenta.id}>
                      <div className="mb-1.5 flex items-baseline justify-between gap-2">
                        <span className="min-w-0 truncate text-sm font-medium text-ink-800">
                          {cuenta.nombre}
                        </span>
                        <span className="tnum shrink-0 text-sm font-semibold text-ink-900">
                          {moneyCompact(total)}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-ink-100">
                        <div
                          className="h-full rounded-full bg-ink-900"
                          style={{ width: `${Math.max(3, Math.round((total / max) * 100))}%` }}
                        />
                      </div>
                      <p className="mt-1 text-[0.7rem] text-ink-400">
                        {CONDICION_CORTA[cuenta.condicion]} · {num(count)} facturas
                      </p>
                    </div>
                  )
                })}
              </div>
            </Card>
          </div>

          {/* Últimos comprobantes + reposición */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="ct-rise overflow-hidden lg:col-span-2" style={ctDelay(150)}>
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <h2 className="text-base font-semibold text-ink-900">Últimos comprobantes</h2>
                <ReceiptText className="h-4 w-4 text-ink-300" />
              </div>
              <ul className="divide-y divide-line">
                {data.facturacion.ultimas.map((f, i) => (
                  <li
                    key={f.id}
                    className="ct-stagger-fade flex items-center gap-3 px-5 py-3.5"
                    style={ctStagger(i)}
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink-950 text-xs font-bold text-on-ink">
                      {f.tipo}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink-900">{f.cliente.nombre}</p>
                      <p className="tnum truncate text-xs text-ink-400">
                        {f.cuenta ? numeroComprobante(f.cuenta.puntoVenta, f.numero) : f.numero} · {fecha(f.fecha)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="tnum text-sm font-semibold text-ink-900">{money(f.total)}</span>
                      <FacturaEstadoBadge estado={estadoEfectivo(f)} />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>

            <Card className="ct-rise overflow-hidden" style={ctDelay(190)}>
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <h2 className="text-base font-semibold text-ink-900">Reposición</h2>
                <PackageSearch className="h-4 w-4 text-ink-300" />
              </div>
              {data.inventario.bajoStock.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-ink-400">
                  Todo el stock está por encima del mínimo.
                </p>
              ) : (
                <ul className="divide-y divide-line">
                  {data.inventario.bajoStock.slice(0, 6).map((p, i) => (
                    <li
                      key={p.id}
                      className="ct-stagger-fade flex items-center gap-3 px-5 py-3.5"
                      style={ctStagger(i)}
                    >
                      <AlertTriangle
                        className={cn('h-4 w-4 shrink-0', p.stock === 0 ? 'text-ink-900' : 'text-ink-400')}
                        strokeWidth={2}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink-900">{p.nombre}</p>
                        <p className="truncate text-xs text-ink-400">{p.categoria}</p>
                      </div>
                      <span className="tnum shrink-0 text-sm font-semibold text-ink-900">
                        {num(p.stock)}
                        <span className="text-ink-300"> / {num(p.stockMinimo)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}

function PanelSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-line bg-surface p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-7 w-28" />
            <Skeleton className="mt-2 h-3 w-20" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-line bg-surface p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-7 w-28" />
            <Skeleton className="mt-2 h-3 w-20" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-56 lg:col-span-2" />
        <Skeleton className="h-56" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-72 lg:col-span-2" />
        <Skeleton className="h-72" />
      </div>
    </div>
  )
}
