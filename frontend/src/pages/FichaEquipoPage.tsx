import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  MessageCircle,
  Puzzle,
  ScanSearch,
  ShoppingBag,
  Smartphone,
  Wrench,
} from 'lucide-react'
import type { ItemPrecioService, ModeloEquipo, ProductoCatalogo } from '@/types'
import { listarDispositivos, listarSecciones } from '@/services/preciosService'
import { listarModelos } from '@/services/cotizaciones'
import { listarCategorias, listarProductos } from '@/services/productos'
import { listarStock, listarSucursales } from '@/services/inventario'
import { useAuth } from '@/store/auth'
import { money0, num, usd, usd0 } from '@/lib/format'
import { cn, ctStagger } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { AyudaInfo } from '@/components/ui/AyudaInfo'
import { AyudaFichaEquipo } from '@/components/AyudaContenidos'
import { useToast } from '@/components/ToastProvider'
import { opcionesDeEquipo } from '@/pages/PreciosServicePage'
import { PrecioLineasCatalogo } from '@/pages/ProductosPage'

/**
 * Ficha 360° del equipo: elegís un equipo (o una línea completa) y ves TODO
 * lo que el negocio sabe de él, cruzando los módulos con datos vivos:
 * venta (Productos), toma de usado (Cotizaciones), precios de reparación
 * (Service) y accesorios compatibles (Productos).
 *
 * Cada bloque respeta el permiso de su módulo: si la cuenta no puede ver
 * Cotizaciones, ese bloque no aparece. Y un bloque sin datos no se muestra.
 */

const tienePermiso = (permisos: string[] | undefined, codigo: string, esAdmin?: boolean) =>
  Boolean(esAdmin) || (permisos ?? []).includes(codigo)

export function FichaEquipoPage() {
  const usuario = useAuth((s) => s.usuario)
  const toast = useToast()
  const [filtro, setFiltro] = useState('')

  const puedeCotizaciones = tienePermiso(usuario?.permisos, 'ver_cotizaciones', usuario?.es_administrador)
  const puedeService = tienePermiso(usuario?.permisos, 'ver_precios_service', usuario?.es_administrador)
  const puedeProductos = tienePermiso(usuario?.permisos, 'ver_productos', usuario?.es_administrador)
    || tienePermiso(usuario?.permisos, 'ver_equipos', usuario?.es_administrador)
  const puedeInventario = tienePermiso(usuario?.permisos, 'ver_inventario', usuario?.es_administrador)

  const { data: dispositivos = [], isLoading } = useQuery({
    queryKey: ['service-dispositivos'],
    queryFn: listarDispositivos,
  })
  const { data: modelos = [] } = useQuery({
    queryKey: ['cotizaciones-modelos'],
    queryFn: listarModelos,
    enabled: puedeCotizaciones,
    retry: false,
  })
  const { data: secciones = [] } = useQuery({
    queryKey: ['service-secciones'],
    queryFn: listarSecciones,
    enabled: puedeService,
    retry: false,
  })
  const { data: productos = [] } = useQuery({
    queryKey: ['productos-items'],
    queryFn: listarProductos,
    enabled: puedeProductos,
    retry: false,
  })
  const { data: categorias = [] } = useQuery({
    queryKey: ['productos-categorias'],
    queryFn: listarCategorias,
    enabled: puedeProductos,
    retry: false,
  })
  // Stock por sucursal (Inventario): suma contexto a Venta y Accesorios.
  const { data: stock = [] } = useQuery({
    queryKey: ['inv-stock'],
    queryFn: listarStock,
    enabled: puedeInventario,
    retry: false,
  })
  const { data: sucursales = [] } = useQuery({
    queryKey: ['inv-sucursales'],
    queryFn: listarSucursales,
    enabled: puedeInventario,
    retry: false,
  })
  const stockDe = useMemo(() => {
    const porProducto = new Map<number, Array<{ sucursal: string; cantidad: number }>>()
    if (!puedeInventario) return porProducto
    const nombreSucursal = new Map(sucursales.map((s) => [s.id, s.nombre]))
    for (const fila of stock) {
      if (fila.cantidad <= 0) continue
      const lista = porProducto.get(fila.producto) ?? []
      lista.push({ sucursal: nombreSucursal.get(fila.sucursal) ?? '', cantidad: fila.cantidad })
      porProducto.set(fila.producto, lista)
    }
    return porProducto
  }, [stock, sucursales, puedeInventario])

  const activos = useMemo(
    () =>
      dispositivos
        .filter((d) => d.activo)
        .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre)),
    [dispositivos],
  )
  const opciones = useMemo(() => {
    const base = opcionesDeEquipo(activos)
    return [{ value: '', label: 'Elegí un equipo o línea…' }, ...base.slice(1)]
  }, [activos])

  /** Ids de equipos seleccionados (uno, o toda la línea). */
  const idsEquipo = useMemo(() => {
    if (!filtro) return null
    const [tipo, valor] = filtro.split(':')
    if (tipo === 'disp') return new Set([Number(valor)])
    return new Set(activos.filter((d) => d.linea === valor).map((d) => d.id))
  }, [filtro, activos])

  const etiquetaFiltro = opciones.find((o) => o.value === filtro)?.label
  const seleccionEsLinea = filtro.startsWith('linea:')

  // ===== Bloques =====
  const categoriaPorId = useMemo(() => new Map(categorias.map((c) => [c.id, c])), [categorias])
  const esVentaDeEquipo = (p: ProductoCatalogo) => {
    const propia = categoriaPorId.get(p.categoria)
    const raiz = propia?.padre !== null && propia !== undefined ? categoriaPorId.get(propia.padre!) : propia
    return Boolean(propia?.es_equipo || raiz?.es_equipo)
  }

  const venta = useMemo(
    () =>
      idsEquipo === null
        ? []
        : productos.filter(
            (p) => p.activo && esVentaDeEquipo(p) && p.dispositivos.some((id) => idsEquipo.has(id)),
          ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [productos, idsEquipo, categoriaPorId],
  )
  const accesorios = useMemo(
    () =>
      idsEquipo === null
        ? []
        : productos.filter(
            (p) => p.activo && !esVentaDeEquipo(p) && p.dispositivos.some((id) => idsEquipo.has(id)),
          ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [productos, idsEquipo, categoriaPorId],
  )
  const toma = useMemo(
    () =>
      idsEquipo === null
        ? []
        : modelos
            .filter((m) => m.activo && m.dispositivo !== null && idsEquipo.has(m.dispositivo))
            .sort((a, b) => a.orden - b.orden),
    [modelos, idsEquipo],
  )
  const service = useMemo(() => {
    if (idsEquipo === null) return []
    return secciones
      .filter((s) => s.activo)
      .sort((a, b) => a.orden - b.orden)
      .map((seccion) => ({
        seccion,
        items: seccion.items.filter(
          (i) => i.activo && i.dispositivos.some((id) => idsEquipo.has(id)),
        ),
      }))
      .filter((g) => g.items.length > 0)
  }, [secciones, idsEquipo])

  const sinDatos =
    idsEquipo !== null && venta.length === 0 && toma.length === 0 && service.length === 0 && accesorios.length === 0

  async function copiarWhatsapp(modelo: ModeloEquipo) {
    if (modelo.cotizaciones.length === 0) return
    const min = Math.min(...modelo.cotizaciones.map((c) => Number(c.precio_min)))
    const max = Math.max(...modelo.cotizaciones.map((c) => Number(c.precio_max)))
    const punta = Math.round((min + max) / 2)
    const mensaje =
      `Al ${modelo.nombre_completo} podríamos tomarlo en el orden de los USD ${num(punta)}. ` +
      'Esto siempre y cuando el equipo se encuentre en condiciones estándar y no haya que reacondicionarlo. ' +
      'La valuación final se pasa en el local a la hora de cotizar el equipo.'
    try {
      await navigator.clipboard.writeText(mensaje)
      toast.success('Respuesta copiada', 'Pegala en el chat de WhatsApp.')
    } catch {
      toast.error('No se pudo copiar')
    }
  }

  let indiceBloque = 0

  return (
    <div className="animate-fade-in">
      <PageHeader
        icon={ScanSearch}
        eyebrow="Vista 360°"
        title="Ficha de equipo"
        subtitle="Elegí un equipo y mirá todo junto: venta, toma de usado, service y accesorios."
        className="ct-rise"
        actions={
          <AyudaInfo titulo="Cómo usar la Ficha de equipo">
            <AyudaFichaEquipo />
          </AyudaInfo>
        }
      />

      {/* Selector (sin overflow-hidden: el desplegable es absolute) */}
      <Card className="ct-rise mb-5 p-5 sm:p-6">
        <label className="mb-2 block text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-400">
          ¿Qué equipo buscás?
        </label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="w-full sm:max-w-[20rem]">
            <Select
              options={opciones}
              value={filtro}
              onChange={setFiltro}
              searchable
              searchPlaceholder="iPhone 13 Pro, línea 15…"
              placeholder="Elegí un equipo o línea…"
            />
          </div>
          {idsEquipo !== null && (
            <p className="text-xs text-ink-400">
              {seleccionEsLinea
                ? `Mostrando toda la ${etiquetaFiltro?.replace(' (completa)', '')}.`
                : 'También podés elegir una línea completa.'}
            </p>
          )}
        </div>
      </Card>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      ) : idsEquipo === null ? (
        <EmptyState
          icon={ScanSearch}
          title="Elegí un equipo para ver su ficha"
          description="Por ejemplo: iPhone 13 Pro para ese modelo, o Línea 13 para toda la familia."
        />
      ) : sinDatos ? (
        <EmptyState
          icon={ScanSearch}
          title={`Sin datos para ${etiquetaFiltro}`}
          description="Ese equipo todavía no tiene precios cargados en ningún módulo."
        />
      ) : (
        <div className="space-y-4">
          {/* ===== VENTA ===== */}
          {venta.length > 0 && (
            <BloqueFicha
              icono={ShoppingBag}
              titulo="Venta"
              detalle="del catálogo de Productos"
              enlace={puedeProductos ? { a: '/productos', texto: 'Ver en Productos' } : undefined}
              index={indiceBloque++}
            >
              <ul className="divide-y divide-line">
                {venta.map((p) => (
                  <li key={p.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-sm font-semibold text-ink-900">{p.nombre}</p>
                        {p.nuevo && <Badge tone="solid">Nuevo</Badge>}
                        {p.a_pedido && <Badge tone="outline">A pedido</Badge>}
                        {puedeInventario && <StockChips filas={stockDe.get(p.id)} />}
                      </div>
                      {p.nota && <p className="mt-0.5 text-xs text-ink-400">{p.nota}</p>}
                    </div>
                    <div className="shrink-0 sm:text-right">
                      <PrecioLineasCatalogo efectivo={p.efectivo} />
                    </div>
                  </li>
                ))}
              </ul>
            </BloqueFicha>
          )}

          {/* ===== TOMA DE USADO ===== */}
          {toma.length > 0 && (
            <BloqueFicha
              icono={Smartphone}
              titulo="Toma de usado"
              detalle="de Cotizaciones"
              enlace={puedeCotizaciones ? { a: '/cotizaciones', texto: 'Ver en Cotizaciones' } : undefined}
              index={indiceBloque++}
            >
              <ul className="divide-y divide-line">
                {toma.map((modelo) => (
                  <li key={modelo.id} className="px-4 py-3.5 sm:px-5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-sm font-semibold text-ink-900">
                        {modelo.nombre_completo}
                      </p>
                      {modelo.cotizaciones.length > 0 && (
                        <button
                          type="button"
                          onClick={() => copiarWhatsapp(modelo)}
                          title="Copiar la respuesta tipo para WhatsApp"
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-xs font-medium text-ink-600 transition-colors hover:border-ink-300 hover:bg-ink-50 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
                        >
                          <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                          WhatsApp
                        </button>
                      )}
                    </div>
                    <ul className="mt-2 space-y-1.5">
                      {modelo.cotizaciones.map((c) => (
                        <li key={c.id} className="flex items-baseline justify-between gap-3">
                          <span className="shrink-0 text-sm font-medium text-ink-600">{c.capacidad_label}</span>
                          <span className="tnum text-right text-base font-bold text-ink-950">
                            {usd0(Number(c.precio_min))} – {num(Number(c.precio_max))}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {modelo.servicios.length > 0 && (
                      <p className="tnum mt-2 text-xs text-ink-400">
                        Descuentos al cotizar:{' '}
                        {modelo.servicios
                          .map((s) => `${s.tipo_nombre.toLowerCase().replace('cambio de ', '')} −${usd0(Number(s.precio))}`)
                          .join(' · ')}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </BloqueFicha>
          )}

          {/* ===== SERVICE ===== */}
          {service.length > 0 && (
            <BloqueFicha
              icono={Wrench}
              titulo="Service"
              detalle="precios al público, de la lista de Service"
              enlace={puedeService ? { a: '/service', texto: 'Ver en Service' } : undefined}
              index={indiceBloque++}
            >
              <ul className="divide-y divide-line">
                {service.map(({ seccion, items }) => (
                  <li key={seccion.id} className="px-4 py-3 sm:px-5">
                    <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-ink-400">
                      {seccion.nombre}
                    </p>
                    <ul className="space-y-2.5">
                      {items.map((item) => (
                        <FilaServiceFicha key={item.id} item={item} seccion={seccion} />
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </BloqueFicha>
          )}

          {/* ===== ACCESORIOS COMPATIBLES ===== */}
          {accesorios.length > 0 && (
            <BloqueFicha
              icono={Puzzle}
              titulo="Accesorios compatibles"
              detalle="productos vinculados a este equipo"
              enlace={puedeProductos ? { a: '/productos', texto: 'Ver en Productos' } : undefined}
              index={indiceBloque++}
            >
              <ul className="divide-y divide-line">
                {accesorios.map((p) => (
                  <li key={p.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-sm font-semibold text-ink-900">{p.nombre}</p>
                        {p.calidad && <Badge tone="soft">{p.calidad}</Badge>}
                        {puedeInventario && <StockChips filas={stockDe.get(p.id)} />}
                      </div>
                      {p.nota && <p className="mt-0.5 text-xs text-ink-400">{p.nota}</p>}
                    </div>
                    <div className="shrink-0 sm:text-right">
                      <PrecioLineasCatalogo efectivo={p.efectivo} />
                    </div>
                  </li>
                ))}
              </ul>
            </BloqueFicha>
          )}
        </div>
      )}
    </div>
  )
}

/** Stock por sucursal, del Inventario: "Solar 3 · Centro 1" (o "sin stock"). */
function StockChips({ filas }: { filas?: Array<{ sucursal: string; cantidad: number }> }) {
  if (!filas || filas.length === 0) {
    return <Badge tone="outline">sin stock</Badge>
  }
  return (
    <Badge tone="soft" className="tnum">
      {filas.map((f) => `${f.sucursal} ${num(f.cantidad)}`).join(' · ')}
    </Badge>
  )
}

function BloqueFicha({
  icono: Icono,
  titulo,
  detalle,
  enlace,
  index,
  children,
}: {
  icono: typeof Wrench
  titulo: string
  detalle: string
  enlace?: { a: string; texto: string }
  index: number
  children: React.ReactNode
}) {
  return (
    <Card className="ct-stagger-item overflow-hidden p-0" style={ctStagger(index)}>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3.5 sm:px-5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink-950 text-on-ink">
          <Icono className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold text-ink-900">{titulo}</h2>
          <p className="truncate text-xs text-ink-400">{detalle}</p>
        </div>
        {enlace && (
          <Link
            to={enlace.a}
            className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-ink-500 transition-colors hover:text-ink-900"
          >
            {enlace.texto} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
      {children}
    </Card>
  )
}

function FilaServiceFicha({
  item,
  seccion,
}: {
  item: ItemPrecioService
  seccion: { variantes: { id: number; nombre: string }[] }
}) {
  const variantePorId = useMemo(
    () => new Map(seccion.variantes.map((v) => [v.id, v.nombre])),
    [seccion.variantes],
  )
  const par = (u: number | null, a: number | null) => {
    const partes: string[] = []
    if (u !== null && u !== undefined) partes.push(usd(Number(u)))
    if (a !== null && a !== undefined) partes.push(money0(Number(a)))
    return partes.join(' · ')
  }

  return (
    <li className={cn('flex flex-col gap-1.5', item.precios.length === 1 && 'sm:flex-row sm:items-center sm:justify-between')}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink-900">{item.etiqueta}</p>
        {item.nota && <p className="text-xs text-ink-400">{item.nota}</p>}
      </div>
      <div className={cn('space-y-1', item.precios.length === 1 && 'shrink-0 sm:text-right')}>
        {item.precios.map((p) => (
          <p key={p.id} className="tnum text-sm">
            {item.precios.length > 1 && (
              <span className="mr-1.5 text-[0.68rem] font-medium uppercase tracking-[0.06em] text-ink-400">
                {variantePorId.get(p.variante)}
              </span>
            )}
            <span className="font-bold text-ink-950">{par(p.efectivo.lista_usd, p.efectivo.lista_ars)}</span>
            {(p.efectivo.cash_usd !== null || p.efectivo.cash_ars !== null) && (
              <span className="text-ink-500"> · cash {par(p.efectivo.cash_usd, p.efectivo.cash_ars)}</span>
            )}
          </p>
        ))}
      </div>
    </li>
  )
}
