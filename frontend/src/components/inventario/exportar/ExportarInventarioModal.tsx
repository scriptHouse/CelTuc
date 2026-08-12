import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Check,
  ClipboardCopy,
  Columns3,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  GripVertical,
  Image as ImageIcon,
  Loader2,
  Palette,
  Plus,
  RotateCcw,
  Save,
  Settings2,
  Sparkles,
  Star,
  Table2,
  Trash2,
  X,
} from 'lucide-react'
import type { CategoriaCatalogo, ProductoCatalogo } from '@/types'
import { listarMovimientos, type StockRow, type Sucursal } from '@/services/inventario'
import { LOGO_CELTUC } from '@/documentos/assets'
import { cn } from '@/lib/utils'
import { num } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ToastProvider'
import {
  COLUMNAS,
  CONFIG_POR_DEFECTO,
  EXTENSION,
  FAMILIAS,
  PLANTILLAS_FABRICA,
  aplicarPlantilla,
  colSucursal,
  esColSucursal,
  fusionarConfig,
  idDeColSucursal,
  type ConfigExport,
  type FormatoExport,
  type PlantillaExport,
} from './tipos'
import {
  construirDataset,
  definicionDe,
  resolverNombreArchivo,
  textoCelda,
  type Dataset,
  type FuentesExport,
} from './datos'
import type { FilaKardex } from './xlsx'

/**
 * Studio de exportación del Inventario.
 *
 * Un panel de configuración a la izquierda y una VISTA PREVIA en vivo a la
 * derecha: cada cambio se ve antes de bajar el archivo. Los tres formatos
 * comparten el mismo dataset (`datos.ts`) y cada uno tiene sus opciones
 * propias, porque un Excel, un informe para firmar y un CSV para analizar no
 * se piden igual.
 *
 * Lo que se elige se recuerda entre visitas, y una configuración que se usa
 * seguido se guarda como plantilla (además de las cinco de fábrica).
 */

type SeccionId = 'datos' | 'columnas' | 'diseno' | 'formato' | 'archivo' | 'preview'

const CLAVE_CONFIG = 'celtuc:inventario:export:v1'
const CLAVE_PLANTILLAS = 'celtuc:inventario:export:plantillas:v1'

const FORMATOS: Array<{
  id: FormatoExport
  nombre: string
  icono: typeof FileSpreadsheet
  pitch: string
}> = [
  { id: 'xlsx', nombre: 'Excel', icono: FileSpreadsheet, pitch: 'Con fórmulas, filtros y resumen' },
  { id: 'pdf', nombre: 'PDF', icono: FileText, pitch: 'Informe listo para imprimir' },
  { id: 'csv', nombre: 'CSV', icono: Table2, pitch: 'Datos crudos para analizar' },
]

interface Props {
  abierto: boolean
  onCerrar: () => void
  productos: ProductoCatalogo[]
  categorias: CategoriaCatalogo[]
  stock: StockRow[]
  /** Sucursales activas del negocio. */
  sucursales: Sucursal[]
  admin: boolean
  usuario: string
  /** Ids de los productos que se están viendo en pantalla. */
  idsVisibles: number[]
  /** Los filtros de la pantalla, en castellano. */
  contextoVista: string[]
  /** La sucursal elegida arriba ('todas' o un id). */
  seleccion: number | 'todas' | null
}

/* ===================== Config inicial ===================== */

/** La config con la que abre el Studio: la de la pantalla, ya resuelta. */
function configInicial(sucursales: Sucursal[], seleccion: number | 'todas' | null): ConfigExport {
  const elegidas =
    seleccion === null || seleccion === 'todas' ? sucursales.map((s) => s.id) : [seleccion]
  const base = { ...CONFIG_POR_DEFECTO, sucursales: elegidas }
  // Con varias sucursales a la vista, cada una se lleva su columna: es lo que
  // se ve en pantalla y lo que la gente espera encontrar en el Excel.
  if (elegidas.length > 1) {
    const columnas = [...CONFIG_POR_DEFECTO.columnas]
    const donde = columnas.indexOf('total')
    columnas.splice(donde === -1 ? columnas.length : donde, 0, ...elegidas.map(colSucursal))
    return { ...base, columnas }
  }
  return base
}

/** Agrega/saca las columnas de stock cuando cambian las sucursales elegidas. */
function sincronizarColumnas(columnas: string[], elegidas: number[]): string[] {
  const vivas = columnas.filter((id) => !esColSucursal(id) || elegidas.includes(idDeColSucursal(id)))
  const yaEstan = new Set(vivas.filter(esColSucursal).map(idDeColSucursal))
  const faltan = elegidas.filter((id) => !yaEstan.has(id))
  if (!faltan.length) return vivas
  // Solo se agregan solas si YA había columnas por sucursal: si el usuario las
  // sacó a propósito, marcar una sucursal más no se las devuelve.
  if (!yaEstan.size) return vivas
  const donde = vivas.indexOf('total')
  const salida = [...vivas]
  salida.splice(donde === -1 ? salida.length : donde, 0, ...faltan.map(colSucursal))
  return salida
}

function leerGuardado<T>(clave: string): T | null {
  try {
    const crudo = localStorage.getItem(clave)
    return crudo ? (JSON.parse(crudo) as T) : null
  } catch {
    return null
  }
}

function guardar(clave: string, valor: unknown) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor))
  } catch {
    /* Sin localStorage (modo privado) la exportación funciona igual. */
  }
}

/* ===================== Componente ===================== */

export function ExportarInventarioModal({
  abierto,
  onCerrar,
  productos,
  categorias,
  stock,
  sucursales,
  admin,
  usuario,
  idsVisibles,
  contextoVista,
  seleccion,
}: Props) {
  const toast = useToast()
  const [config, setConfig] = useState<ConfigExport>(() => configInicial(sucursales, seleccion))
  const [seccion, setSeccion] = useState<SeccionId>('datos')
  const [ocupado, setOcupado] = useState(false)
  const [plantillasPropias, setPlantillasPropias] = useState<PlantillaExport[]>([])
  const [guardandoPlantilla, setGuardandoPlantilla] = useState(false)
  const [nombrePlantilla, setNombrePlantilla] = useState('')
  const yaAbrio = useRef(false)

  // Al abrir: se recupera lo último que usó, pero las sucursales y el alcance
  // salen SIEMPRE de la pantalla actual (es lo que la persona está mirando).
  useEffect(() => {
    if (!abierto) {
      yaAbrio.current = false
      return
    }
    if (yaAbrio.current) return
    yaAbrio.current = true
    setPlantillasPropias(leerGuardado<PlantillaExport[]>(CLAVE_PLANTILLAS) ?? [])
    setSeccion('datos')
    const inicial = configInicial(sucursales, seleccion)
    const guardada = leerGuardado<Partial<ConfigExport>>(CLAVE_CONFIG)
    if (!guardada) {
      setConfig(inicial)
      return
    }
    const fusionada = fusionarConfig(inicial, guardada)
    setConfig({
      ...fusionada,
      sucursales: inicial.sucursales,
      columnas: sincronizarColumnas(
        fusionada.columnas?.length ? fusionada.columnas : inicial.columnas,
        inicial.sucursales,
      ),
    })
  }, [abierto, sucursales, seleccion])

  const actualizar = (patch: Partial<ConfigExport>) => setConfig((c) => ({ ...c, ...patch }))
  const actualizarXlsx = (patch: Partial<ConfigExport['xlsx']>) =>
    setConfig((c) => ({ ...c, xlsx: { ...c.xlsx, ...patch } }))
  const actualizarPdf = (patch: Partial<ConfigExport['pdf']>) =>
    setConfig((c) => ({ ...c, pdf: { ...c.pdf, ...patch } }))
  const actualizarCsv = (patch: Partial<ConfigExport['csv']>) =>
    setConfig((c) => ({ ...c, csv: { ...c.csv, ...patch } }))
  const actualizarFiltros = (patch: Partial<ConfigExport['filtros']>) =>
    setConfig((c) => ({ ...c, filtros: { ...c.filtros, ...patch } }))

  const fuentes: FuentesExport = useMemo(
    () => ({ productos, categorias, stock, sucursales, admin, usuario, idsVisibles, contextoVista }),
    [productos, categorias, stock, sucursales, admin, usuario, idsVisibles, contextoVista],
  )

  // El dataset completo: alimenta a la vez el contador, la vista previa y el
  // archivo final. Uno solo, así lo que se ve es exactamente lo que baja.
  const dataset = useMemo(
    () => (abierto ? construirDataset(config, fuentes, { logo: LOGO_CELTUC }) : null),
    [abierto, config, fuentes],
  )

  const nombreArchivo = useMemo(() => {
    const sucursalTexto =
      config.sucursales.length === sucursales.length && sucursales.length > 1
        ? 'todas'
        : sucursales
            .filter((s) => config.sucursales.includes(s.id))
            .map((s) => s.nombre)
            .join('-') || 'inventario'
    return resolverNombreArchivo(config.nombreArchivo, {
      sucursal: sucursalTexto,
      vista: config.alcance === 'vista' ? 'vista' : 'catalogo',
      filas: dataset?.filas.length ?? 0,
      fecha: new Date(),
      extension: EXTENSION[config.formato],
    })
  }, [config, sucursales, dataset])

  /* ---- Exportar ---- */
  async function exportar() {
    if (!dataset || ocupado) return
    if (!dataset.filas.length) {
      toast.error('No hay nada para exportar', 'Con estos filtros no queda ninguna fila.')
      return
    }
    setOcupado(true)
    try {
      const generado = new Date()
      const ds = construirDataset(config, fuentes, { logo: LOGO_CELTUC, generado })
      let blob: Blob
      if (config.formato === 'csv') {
        const { construirCsv } = await import('./csv')
        blob = construirCsv(ds)
      } else if (config.formato === 'xlsx') {
        const { construirXlsx } = await import('./xlsx')
        const movimientos = config.xlsx.hojaKardex ? await traerKardex(ds) : undefined
        blob = await construirXlsx(ds, { movimientos })
      } else {
        const { construirPdf } = await import('./pdf')
        blob = await construirPdf(ds)
      }
      descargar(blob, nombreArchivo)
      guardar(CLAVE_CONFIG, config)
      toast.success(
        'Exportado',
        `${nombreArchivo} · ${num(ds.filas.length)} filas · ${pesoLegible(blob.size)}`,
      )
      onCerrar()
    } catch (error) {
      toast.error(
        'No se pudo exportar',
        error instanceof Error ? error.message : 'Probá con menos columnas o menos filas.',
      )
    } finally {
      setOcupado(false)
    }
  }

  /** Trae el kardex de las sucursales elegidas y le resuelve los nombres. */
  async function traerKardex(ds: Dataset): Promise<FilaKardex[]> {
    const nombreProducto = new Map(productos.map((p) => [p.id, p.nombre]))
    const nombreSucursal = new Map(sucursales.map((s) => [s.id, s.nombre]))
    const limite = Math.max(1, Math.min(2000, config.xlsx.kardexLimite))
    const porSucursal = await Promise.all(
      ds.sucursales.map((s) => listarMovimientos({ sucursal: s.id, limite })),
    )
    return porSucursal
      .flat()
      .sort((a, b) => (a.creado < b.creado ? 1 : a.creado > b.creado ? -1 : 0))
      .slice(0, limite)
      .map((m) => ({
        fecha: m.creado,
        producto: nombreProducto.get(m.producto) ?? `#${m.producto}`,
        sucursal: nombreSucursal.get(m.sucursal) ?? `#${m.sucursal}`,
        tipo: ETIQUETA_MOVIMIENTO[m.tipo] ?? m.tipo,
        delta: m.delta,
        resultante: m.resultante,
        nota: m.nota,
        usuario: m.usuario ?? '',
      }))
  }

  async function copiarAlPortapapeles() {
    if (!dataset?.filas.length) return
    try {
      const { construirTsvParaPortapapeles } = await import('./csv')
      await navigator.clipboard.writeText(construirTsvParaPortapapeles(dataset))
      toast.success('Copiado', `${num(dataset.filas.length)} filas listas para pegar en una planilla.`)
    } catch {
      toast.error('No se pudo copiar', 'El navegador bloqueó el portapapeles.')
    }
  }

  /* ---- Plantillas ---- */
  function usarPlantilla(plantilla: PlantillaExport) {
    const nueva = aplicarPlantilla(plantilla, config.sucursales)
    setConfig({ ...nueva, columnas: sincronizarColumnas(nueva.columnas, config.sucursales) })
    toast.success('Plantilla aplicada', plantilla.nombre)
  }

  function guardarPlantilla() {
    const nombre = nombrePlantilla.trim()
    if (!nombre) return
    const nueva: PlantillaExport = {
      id: `propia-${Date.now()}`,
      nombre,
      descripcion: `${config.formato.toUpperCase()} · ${dataset?.columnas.length ?? 0} columnas`,
      config,
    }
    const siguientes = [...plantillasPropias.filter((p) => p.nombre !== nombre), nueva]
    setPlantillasPropias(siguientes)
    guardar(CLAVE_PLANTILLAS, siguientes)
    setGuardandoPlantilla(false)
    setNombrePlantilla('')
    toast.success('Plantilla guardada', nombre)
  }

  function borrarPlantilla(id: string) {
    const siguientes = plantillasPropias.filter((p) => p.id !== id)
    setPlantillasPropias(siguientes)
    guardar(CLAVE_PLANTILLAS, siguientes)
  }

  const secciones: Array<{ id: SeccionId; label: string; icono: typeof Filter }> = [
    { id: 'datos', label: 'Datos', icono: Filter },
    { id: 'columnas', label: 'Columnas', icono: Columns3 },
    { id: 'diseno', label: 'Diseño', icono: Palette },
    { id: 'formato', label: `Opciones de ${config.formato === 'xlsx' ? 'Excel' : config.formato.toUpperCase()}`, icono: Settings2 },
    { id: 'archivo', label: 'Archivo', icono: Download },
  ]

  return (
    <Modal
      open={abierto}
      onClose={onCerrar}
      size="xl"
      className="sm:max-w-[74rem]"
      labelledBy="titulo-exportar-inventario"
    >
      {/* Encabezado */}
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h2 id="titulo-exportar-inventario" className="text-base font-semibold text-ink-900">
            Exportar inventario
          </h2>
          <p className="mt-0.5 truncate text-xs text-ink-500">
            {dataset ? `${num(dataset.filas.length)} filas · ${dataset.columnas.length} columnas` : '—'}{' '}
            · {nombreArchivo}
          </p>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="-mr-1 shrink-0 rounded-lg p-2 text-ink-400 transition-colors hover:bg-ink-50 hover:text-ink-800"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Cuerpo: rail · contenido · vista previa */}
      {/* En móvil el cuerpo entero es UN scroll (las columnas se apilan); de lg
          en adelante cada panel scrollea por su cuenta, como un editor. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:overflow-hidden xl:grid-cols-[13.5rem_minmax(0,1fr)_21rem]">
        {/* --- Rail --- */}
        <div className="shrink-0 border-b border-line px-3 py-3 lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <div className="space-y-1.5">
            {FORMATOS.map((f) => {
              const activo = config.formato === f.id
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => actualizar({ formato: f.id })}
                  aria-pressed={activo}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors',
                    activo
                      ? 'border-ink-950 bg-ink-950 text-on-ink'
                      : 'border-line-strong bg-surface text-ink-700 hover:border-ink-300 hover:bg-ink-50',
                  )}
                >
                  <f.icono className="h-4 w-4 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{f.nombre}</span>
                    <span
                      className={cn(
                        'block truncate text-[0.65rem] leading-tight',
                        activo ? 'text-on-ink/70' : 'text-ink-400',
                      )}
                    >
                      {f.pitch}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>

          <div className="my-3 h-px bg-line" />

          <nav className="space-y-0.5">
            {secciones.map((sec) => (
              <button
                key={sec.id}
                type="button"
                onClick={() => setSeccion(sec.id)}
                aria-current={seccion === sec.id}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                  seccion === sec.id
                    ? 'bg-ink-100 font-medium text-ink-900'
                    : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900',
                )}
              >
                <sec.icono className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{sec.label}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setSeccion('preview')}
              aria-current={seccion === 'preview'}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors xl:hidden',
                seccion === 'preview'
                  ? 'bg-ink-100 font-medium text-ink-900'
                  : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900',
              )}
            >
              <Sparkles className="h-3.5 w-3.5 shrink-0" />
              Vista previa
            </button>
          </nav>

          <div className="my-3 h-px bg-line" />

          <p className="px-1 pb-1.5 text-[0.6rem] font-semibold uppercase tracking-[0.08em] text-ink-400">
            Plantillas
          </p>
          <div className="space-y-0.5">
            {PLANTILLAS_FABRICA.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => usarPlantilla(p)}
                title={p.descripcion}
                className="flex w-full items-start gap-2 rounded-lg px-2.5 py-1.5 text-left text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900"
              >
                <Star className="mt-0.5 h-3 w-3 shrink-0 text-ink-400" />
                <span className="min-w-0 truncate text-xs">{p.nombre}</span>
              </button>
            ))}
            {plantillasPropias.map((p) => (
              <div key={p.id} className="group flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => usarPlantilla(p)}
                  title={p.descripcion}
                  className="flex min-w-0 flex-1 items-start gap-2 rounded-lg px-2.5 py-1.5 text-left text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900"
                >
                  <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-ink-400" />
                  <span className="min-w-0 truncate text-xs">{p.nombre}</span>
                </button>
                <button
                  type="button"
                  onClick={() => borrarPlantilla(p.id)}
                  aria-label={`Borrar plantilla ${p.nombre}`}
                  className="shrink-0 rounded-lg p-1.5 text-ink-300 opacity-0 transition-opacity hover:bg-ink-50 hover:text-ink-700 focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>

          {guardandoPlantilla ? (
            <div className="mt-2 space-y-1.5 px-1">
              <Input
                value={nombrePlantilla}
                onChange={(e) => setNombrePlantilla(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && guardarPlantilla()}
                placeholder="Nombre"
                className="h-8 text-xs"
                autoFocus
              />
              <div className="flex gap-1.5">
                <Button size="sm" className="h-7 flex-1 px-2 text-xs" onClick={guardarPlantilla}>
                  <Check className="h-3 w-3" /> Guardar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => setGuardandoPlantilla(false)}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setGuardandoPlantilla(true)}
              className="mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-900"
            >
              <Save className="h-3 w-3 shrink-0" />
              Guardar esta configuración
            </button>
          )}
        </div>

        {/* --- Contenido --- */}
        <div
          className={cn(
            'min-h-0 px-5 py-4 lg:overflow-y-auto',
            seccion === 'preview' && 'hidden xl:block',
          )}
        >
          {seccion === 'datos' && (
            <SeccionDatos
              config={config}
              sucursales={sucursales}
              productos={productos}
              idsVisibles={idsVisibles}
              contextoVista={contextoVista}
              dataset={dataset}
              actualizar={actualizar}
              actualizarFiltros={actualizarFiltros}
              onSucursales={(ids) =>
                setConfig((c) => ({
                  ...c,
                  sucursales: ids,
                  columnas: sincronizarColumnas(c.columnas, ids),
                }))
              }
            />
          )}
          {seccion === 'columnas' && (
            <SeccionColumnas
              config={config}
              sucursales={sucursales}
              admin={admin}
              onColumnas={(columnas) => actualizar({ columnas })}
            />
          )}
          {seccion === 'diseno' && <SeccionDiseno config={config} actualizar={actualizar} />}
          {seccion === 'formato' && (
            <SeccionFormato
              config={config}
              actualizarXlsx={actualizarXlsx}
              actualizarPdf={actualizarPdf}
              actualizarCsv={actualizarCsv}
            />
          )}
          {seccion === 'archivo' && (
            <SeccionArchivo
              config={config}
              nombreArchivo={nombreArchivo}
              actualizar={actualizar}
              onCopiar={copiarAlPortapapeles}
              puedeCopiar={Boolean(dataset?.filas.length)}
            />
          )}
          {seccion === 'preview' && dataset && <VistaPrevia dataset={dataset} nombre={nombreArchivo} />}
        </div>

        {/* --- Vista previa fija (xl+) --- */}
        <div className="hidden min-h-0 border-l border-line bg-ink-50/40 px-4 py-4 xl:block xl:overflow-y-auto">
          {dataset && <VistaPrevia dataset={dataset} nombre={nombreArchivo} />}
        </div>
      </div>

      {/* Pie */}
      <div className="flex shrink-0 flex-col gap-2 border-t border-line px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => setConfig(configInicial(sucursales, seleccion))}
          className="inline-flex items-center gap-1.5 self-start text-xs text-ink-500 transition-colors hover:text-ink-900"
        >
          <RotateCcw className="h-3 w-3" />
          Volver a lo predeterminado
        </button>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onCerrar} disabled={ocupado}>
            Cancelar
          </Button>
          <Button onClick={exportar} disabled={ocupado || !dataset?.filas.length} className="min-w-[9.5rem]">
            {ocupado ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generando…
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Exportar {config.formato.toUpperCase()}
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/* ===================== Sección: Datos ===================== */

function SeccionDatos({
  config,
  sucursales,
  productos,
  idsVisibles,
  contextoVista,
  dataset,
  actualizar,
  actualizarFiltros,
  onSucursales,
}: {
  config: ConfigExport
  sucursales: Sucursal[]
  productos: ProductoCatalogo[]
  idsVisibles: number[]
  contextoVista: string[]
  dataset: Dataset | null
  actualizar: (patch: Partial<ConfigExport>) => void
  actualizarFiltros: (patch: Partial<ConfigExport['filtros']>) => void
  onSucursales: (ids: number[]) => void
}) {
  const activos = productos.filter((p) => p.activo).length
  return (
    <div className="space-y-6">
      <Bloque titulo="Qué filas entran" ayuda="El punto de partida, antes de refinar.">
        <div className="grid gap-2 sm:grid-cols-2">
          <TarjetaOpcion
            activa={config.alcance === 'vista'}
            onClick={() => actualizar({ alcance: 'vista' })}
            titulo="Lo que estoy viendo"
            detalle={`${num(idsVisibles.length)} productos${contextoVista.length ? ` · ${contextoVista.join(' · ')}` : ''}`}
          />
          <TarjetaOpcion
            activa={config.alcance === 'catalogo'}
            onClick={() => actualizar({ alcance: 'catalogo' })}
            titulo="Todo el catálogo"
            detalle={`${num(activos)} productos activos`}
          />
        </div>
      </Bloque>

      <Bloque titulo="Sucursales" ayuda="De cuáles se toman las cantidades.">
        <div className="flex flex-wrap gap-1.5">
          {sucursales.map((s) => {
            const activa = config.sucursales.includes(s.id)
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={activa}
                onClick={() => {
                  const ids = activa
                    ? config.sucursales.filter((x) => x !== s.id)
                    : [...config.sucursales, s.id]
                  // Sin ninguna marcada no habría cantidades: se deja la última.
                  onSucursales(ids.length ? ids : config.sucursales)
                }}
                className={cn(
                  'h-8 rounded-full px-3.5 text-xs font-medium transition-colors',
                  activa
                    ? 'bg-ink-950 text-on-ink'
                    : 'border border-line-strong bg-surface text-ink-600 hover:border-ink-300 hover:bg-ink-50',
                )}
              >
                {s.nombre}
              </button>
            )
          })}
        </div>
      </Bloque>

      <Bloque
        titulo="Disposición"
        ayuda="Cómo se acomodan las sucursales en la tabla."
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <TarjetaOpcion
            activa={config.disposicion === 'ancha'}
            onClick={() => actualizar({ disposicion: 'ancha' })}
            titulo="Ancha"
            detalle="Una fila por producto y una columna por sucursal. Para leer y comparar."
          />
          <TarjetaOpcion
            activa={config.disposicion === 'larga'}
            onClick={() => actualizar({ disposicion: 'larga' })}
            titulo="Larga"
            detalle="Una fila por producto y sucursal. Entra derecho en una tabla dinámica."
          />
        </div>
      </Bloque>

      <Bloque titulo="Refinar" ayuda="Se aplican encima de lo anterior.">
        <div className="grid gap-y-2 sm:grid-cols-2">
          <Casilla
            etiqueta="Solo con stock"
            valor={config.filtros.soloConStock}
            onChange={(v) => actualizarFiltros({ soloConStock: v })}
          />
          <Casilla
            etiqueta="Solo en o bajo el mínimo"
            valor={config.filtros.soloBajoMinimo}
            onChange={(v) => actualizarFiltros({ soloBajoMinimo: v })}
          />
          <Casilla
            etiqueta="Solo «(no informado)»"
            valor={config.filtros.soloNoInformado}
            onChange={(v) => actualizarFiltros({ soloNoInformado: v })}
          />
          <Casilla
            etiqueta="Solo con precio cargado"
            valor={config.filtros.soloConPrecio}
            onChange={(v) => actualizarFiltros({ soloConPrecio: v })}
          />
          <Casilla
            etiqueta="Incluir productos «a pedido»"
            valor={config.filtros.incluirAPedido}
            onChange={(v) => actualizarFiltros({ incluirAPedido: v })}
          />
          <Casilla
            etiqueta="Incluir dados de baja"
            valor={config.filtros.incluirInactivos}
            onChange={(v) => actualizarFiltros({ incluirInactivos: v })}
          />
        </div>
        {dataset && (
          <p className="mt-3 text-xs text-ink-500">
            Quedan <span className="font-semibold text-ink-900">{num(dataset.filas.length)}</span> filas
            {dataset.totales.bajoMinimo > 0 && ` · ${num(dataset.totales.bajoMinimo)} bajo mínimo`}
            {` · ${num(dataset.totales.unidades)} unidades`}
          </p>
        )}
      </Bloque>
    </div>
  )
}

/* ===================== Sección: Columnas ===================== */

function SeccionColumnas({
  config,
  sucursales,
  admin,
  onColumnas,
}: {
  config: ConfigExport
  sucursales: Sucursal[]
  admin: boolean
  onColumnas: (columnas: string[]) => void
}) {
  const [arrastrando, setArrastrando] = useState<string | null>(null)
  const larga = config.disposicion === 'larga'

  const activas = config.columnas
    .map((id) => ({ id, def: definicionDe(id, sucursales) }))
    .filter((c): c is { id: string; def: NonNullable<ReturnType<typeof definicionDe>> } => {
      if (!c.def) return false
      if (c.def.soloAdmin && !admin) return false
      if (c.def.soloLarga && !larga) return false
      if (esColSucursal(c.id) && larga) return false
      return true
    })

  const enUso = new Set(activas.map((c) => c.id))

  const disponibles = FAMILIAS.map((familia) => {
    const propias = COLUMNAS.filter(
      (c) =>
        c.familia === familia.id &&
        !enUso.has(c.id) &&
        (!c.soloAdmin || admin) &&
        (!c.soloLarga || larga),
    )
    const deSucursales =
      familia.id === 'stock' && !larga
        ? sucursales
            .filter((s) => config.sucursales.includes(s.id) && !enUso.has(colSucursal(s.id)))
            .map((s) => definicionDe(colSucursal(s.id), sucursales)!)
        : []
    return { familia, columnas: [...deSucursales, ...propias] }
  }).filter((f) => f.columnas.length)

  const mover = (desde: string, hasta: string) => {
    if (desde === hasta) return
    const lista = [...config.columnas]
    const i = lista.indexOf(desde)
    const j = lista.indexOf(hasta)
    if (i === -1 || j === -1) return
    lista.splice(i, 1)
    lista.splice(j, 0, desde)
    onColumnas(lista)
  }

  const desplazar = (id: string, delta: number) => {
    const lista = [...config.columnas]
    const i = lista.indexOf(id)
    const j = i + delta
    if (i === -1 || j < 0 || j >= lista.length) return
    ;[lista[i], lista[j]] = [lista[j], lista[i]]
    onColumnas(lista)
  }

  return (
    <div className="space-y-5">
      <Bloque
        titulo={`Columnas activas · ${activas.length}`}
        ayuda="Arrastrá para cambiar el orden. El producto va siempre primero."
      >
        <ul className="space-y-1">
          {activas.map((c, i) => (
            <li
              key={c.id}
              draggable
              onDragStart={() => setArrastrando(c.id)}
              onDragEnd={() => setArrastrando(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (arrastrando) mover(arrastrando, c.id)
                setArrastrando(null)
              }}
              className={cn(
                'flex items-center gap-2 rounded-xl border border-line bg-surface px-2.5 py-2 transition-opacity',
                arrastrando === c.id && 'opacity-40',
              )}
            >
              <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-ink-300" />
              <span className="min-w-0 flex-1 truncate text-sm text-ink-800">{c.def.label}</span>
              {c.def.ayuda && (
                <span className="hidden truncate text-[0.65rem] text-ink-400 sm:block sm:max-w-[14rem]">
                  {c.def.ayuda}
                </span>
              )}
              <div className="flex shrink-0 items-center">
                <button
                  type="button"
                  onClick={() => desplazar(c.id, -1)}
                  disabled={i === 0}
                  aria-label={`Subir ${c.def.label}`}
                  className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-ink-50 hover:text-ink-800 disabled:pointer-events-none disabled:opacity-30"
                >
                  <ArrowUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => desplazar(c.id, 1)}
                  disabled={i === activas.length - 1}
                  aria-label={`Bajar ${c.def.label}`}
                  className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-ink-50 hover:text-ink-800 disabled:pointer-events-none disabled:opacity-30"
                >
                  <ArrowDown className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onColumnas(config.columnas.filter((x) => x !== c.id))}
                  disabled={c.def.fija}
                  aria-label={`Quitar ${c.def.label}`}
                  title={c.def.fija ? 'El producto no se puede quitar' : undefined}
                  className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-ink-50 hover:text-ink-800 disabled:pointer-events-none disabled:opacity-25"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </Bloque>

      {disponibles.map(({ familia, columnas }) => (
        <Bloque key={familia.id} titulo={familia.label}>
          <div className="flex flex-wrap gap-1.5">
            {columnas.map((def) => (
              <button
                key={def.id}
                type="button"
                onClick={() => onColumnas([...config.columnas, def.id])}
                title={def.ayuda}
                className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 py-1.5 text-xs text-ink-600 transition-colors hover:border-ink-300 hover:bg-ink-50 hover:text-ink-900"
              >
                <Plus className="h-3 w-3" />
                {def.label}
              </button>
            ))}
          </div>
        </Bloque>
      ))}
    </div>
  )
}

/* ===================== Sección: Diseño ===================== */

function SeccionDiseno({
  config,
  actualizar,
}: {
  config: ConfigExport
  actualizar: (patch: Partial<ConfigExport>) => void
}) {
  return (
    <div className="space-y-6">
      <Bloque titulo="Identidad">
        <button
          type="button"
          onClick={() => actualizar({ conLogo: !config.conLogo })}
          aria-pressed={config.conLogo}
          className={cn(
            'flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors',
            config.conLogo
              ? 'border-ink-950 bg-ink-50'
              : 'border-line-strong bg-surface hover:border-ink-300',
          )}
        >
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
              config.conLogo ? 'bg-ink-950 text-on-ink' : 'bg-ink-100 text-ink-400',
            )}
          >
            <ImageIcon className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-ink-900">
              {config.conLogo ? 'Con logo de CelTuc' : 'Sin logo'}
            </span>
            <span className="block text-xs text-ink-500">
              {config.conLogo
                ? 'El logo va en el encabezado del archivo.'
                : 'Documento neutro, sin marca.'}
            </span>
          </span>
        </button>
      </Bloque>

      <Bloque titulo="Encabezado">
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Campo etiqueta="Título">
            <Input
              value={config.titulo}
              onChange={(e) => actualizar({ titulo: e.target.value })}
              placeholder="Inventario"
            />
          </Campo>
          <Campo etiqueta="Subtítulo (opcional)">
            <Input
              value={config.subtitulo}
              onChange={(e) => actualizar({ subtitulo: e.target.value })}
              placeholder="Cierre de mes, conteo, reposición…"
            />
          </Campo>
        </div>
      </Bloque>

      <Bloque titulo="Orden y agrupación">
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Campo etiqueta="Agrupar por">
            <Select
              value={config.agruparPor}
              onChange={(v) => actualizar({ agruparPor: v as ConfigExport['agruparPor'] })}
              options={[
                { value: 'categoria', label: 'Categoría' },
                { value: 'marca', label: 'Marca' },
                ...(config.disposicion === 'larga'
                  ? [{ value: 'sucursal', label: 'Sucursal' }]
                  : []),
                { value: 'ninguno', label: 'Sin agrupar' },
              ]}
            />
          </Campo>
          <Campo etiqueta="Ordenar por">
            <Select
              value={config.orden}
              onChange={(v) => actualizar({ orden: v as ConfigExport['orden'] })}
              options={[
                { value: 'catalogo', label: 'Orden del catálogo' },
                { value: 'nombre', label: 'Nombre (A→Z)' },
                { value: 'stock_desc', label: 'Más stock primero' },
                { value: 'stock_asc', label: 'Menos stock primero' },
                { value: 'valor_desc', label: 'Más valorizado primero' },
                { value: 'faltante_desc', label: 'Más faltante primero' },
              ]}
            />
          </Campo>
        </div>
      </Bloque>
    </div>
  )
}

/* ===================== Sección: opciones del formato ===================== */

function SeccionFormato({
  config,
  actualizarXlsx,
  actualizarPdf,
  actualizarCsv,
}: {
  config: ConfigExport
  actualizarXlsx: (patch: Partial<ConfigExport['xlsx']>) => void
  actualizarPdf: (patch: Partial<ConfigExport['pdf']>) => void
  actualizarCsv: (patch: Partial<ConfigExport['csv']>) => void
}) {
  if (config.formato === 'xlsx') {
    const x = config.xlsx
    return (
      <div className="space-y-6">
        <Bloque titulo="La tabla" ayuda="Lo que hace que el Excel se pueda trabajar, no solo mirar.">
          <div className="grid gap-y-2 sm:grid-cols-2">
            <Casilla etiqueta="Autofiltro en los títulos" valor={x.autofiltro} onChange={(v) => actualizarXlsx({ autofiltro: v })} />
            <Casilla etiqueta="Fijar títulos al scrollear" valor={x.congelar} onChange={(v) => actualizarXlsx({ congelar: v })} />
            <Casilla etiqueta="Filas alternadas" valor={x.bandas} onChange={(v) => actualizarXlsx({ bandas: v })} />
            <Casilla etiqueta="Resaltar bajo mínimo" valor={x.resaltarBajoMinimo} onChange={(v) => actualizarXlsx({ resaltarBajoMinimo: v })} />
            <Casilla etiqueta="Barras de datos en el stock" valor={x.barrasDatos} onChange={(v) => actualizarXlsx({ barrasDatos: v })} />
            <Casilla etiqueta="Grupos plegables (+/-)" valor={x.agrupable} onChange={(v) => actualizarXlsx({ agrupable: v })} />
          </div>
        </Bloque>

        <Bloque titulo="Totales">
          <div className="grid gap-y-2 sm:grid-cols-2">
            <Casilla etiqueta="Subtotal por grupo" valor={x.subtotales} onChange={(v) => actualizarXlsx({ subtotales: v })} />
            <Casilla etiqueta="Total general" valor={x.totalGeneral} onChange={(v) => actualizarXlsx({ totalGeneral: v })} />
            <Casilla
              etiqueta="Totales como fórmula viva"
              ayuda="Con SUBTOTAL(): al filtrar, los totales se recalculan solos."
              valor={x.formulas}
              onChange={(v) => actualizarXlsx({ formulas: v })}
            />
          </div>
        </Bloque>

        <Bloque titulo="Hojas del libro">
          <div className="grid gap-y-2 sm:grid-cols-2">
            <Casilla etiqueta="Resumen (KPIs y cortes)" valor={x.hojaResumen} onChange={(v) => actualizarXlsx({ hojaResumen: v })} />
            <Casilla etiqueta="Cómo se generó" valor={x.hojaFiltros} onChange={(v) => actualizarXlsx({ hojaFiltros: v })} />
            <Casilla
              etiqueta="Kardex (últimos movimientos)"
              ayuda="Se traen del servidor al exportar."
              valor={x.hojaKardex}
              onChange={(v) => actualizarXlsx({ hojaKardex: v })}
            />
          </div>
          {x.hojaKardex && (
            <div className="mt-2.5 max-w-[12rem]">
              <Campo etiqueta="Cuántos movimientos">
                <Input
                  type="number"
                  min={10}
                  max={2000}
                  value={x.kardexLimite}
                  onChange={(e) => actualizarXlsx({ kardexLimite: Number(e.target.value) || 300 })}
                />
              </Campo>
            </div>
          )}
        </Bloque>
      </div>
    )
  }

  if (config.formato === 'pdf') {
    const p = config.pdf
    return (
      <div className="space-y-6">
        <Bloque titulo="Página">
          <div className="grid gap-2.5 sm:grid-cols-3">
            <Campo etiqueta="Tamaño">
              <Select
                value={p.tamano}
                onChange={(v) => actualizarPdf({ tamano: v as ConfigExport['pdf']['tamano'] })}
                options={[
                  { value: 'A4', label: 'A4' },
                  { value: 'LETTER', label: 'Carta' },
                ]}
              />
            </Campo>
            <Campo etiqueta="Orientación">
              <Select
                value={p.orientacion}
                onChange={(v) => actualizarPdf({ orientacion: v as ConfigExport['pdf']['orientacion'] })}
                options={[
                  { value: 'auto', label: 'Automática' },
                  { value: 'vertical', label: 'Vertical' },
                  { value: 'apaisado', label: 'Apaisada' },
                ]}
              />
            </Campo>
            <Campo etiqueta="Densidad">
              <Select
                value={p.densidad}
                onChange={(v) => actualizarPdf({ densidad: v as ConfigExport['pdf']['densidad'] })}
                options={[
                  { value: 'comoda', label: 'Cómoda' },
                  { value: 'compacta', label: 'Compacta' },
                ]}
              />
            </Campo>
          </div>
        </Bloque>

        <Bloque titulo="Contenido">
          <div className="grid gap-y-2 sm:grid-cols-2">
            <Casilla etiqueta="Banda de indicadores" valor={p.kpis} onChange={(v) => actualizarPdf({ kpis: v })} />
            <Casilla etiqueta="Hoja final de resumen" valor={p.paginaResumen} onChange={(v) => actualizarPdf({ paginaResumen: v })} />
            <Casilla etiqueta="Subtotal por grupo" valor={p.subtotales} onChange={(v) => actualizarPdf({ subtotales: v })} />
            <Casilla etiqueta="Total general" valor={p.totalGeneral} onChange={(v) => actualizarPdf({ totalGeneral: v })} />
            <Casilla etiqueta="Filas alternadas" valor={p.bandas} onChange={(v) => actualizarPdf({ bandas: v })} />
            <Casilla etiqueta="Resaltar bajo mínimo" valor={p.resaltarBajoMinimo} onChange={(v) => actualizarPdf({ resaltarBajoMinimo: v })} />
            <Casilla etiqueta="«Página X de Y» al pie" valor={p.numeroPagina} onChange={(v) => actualizarPdf({ numeroPagina: v })} />
            <Casilla etiqueta="Datos del local al pie" valor={p.pie} onChange={(v) => actualizarPdf({ pie: v })} />
            <Casilla
              etiqueta="Cada grupo en hoja nueva"
              ayuda="Para repartir una hoja por categoría."
              valor={p.saltoPorGrupo}
              onChange={(v) => actualizarPdf({ saltoPorGrupo: v })}
            />
          </div>
        </Bloque>

        <Bloque titulo="Marca de agua" ayuda="Vacío = sin marca de agua.">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={p.marcaAgua}
              onChange={(e) => actualizarPdf({ marcaAgua: e.target.value })}
              placeholder="BORRADOR, CONFIDENCIAL, COPIA…"
              className="sm:w-64"
            />
            {['BORRADOR', 'CONFIDENCIAL', 'COPIA'].map((texto) => (
              <button
                key={texto}
                type="button"
                onClick={() => actualizarPdf({ marcaAgua: p.marcaAgua === texto ? '' : texto })}
                className={cn(
                  'h-8 rounded-full px-3 text-xs font-medium transition-colors',
                  p.marcaAgua === texto
                    ? 'bg-ink-950 text-on-ink'
                    : 'border border-line-strong text-ink-600 hover:bg-ink-50',
                )}
              >
                {texto}
              </button>
            ))}
          </div>
        </Bloque>
      </div>
    )
  }

  const c = config.csv
  return (
    <div className="space-y-6">
      <Bloque
        titulo="Cómo se separan los datos"
        ayuda="El Excel en español espera punto y coma; una herramienta, coma."
      >
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Campo etiqueta="Delimitador">
            <Select
              value={c.delimitador === '\t' ? 'tab' : c.delimitador}
              onChange={(v) =>
                actualizarCsv({ delimitador: (v === 'tab' ? '\t' : v) as ConfigExport['csv']['delimitador'] })
              }
              options={[
                { value: ';', label: 'Punto y coma  ;  (Excel en español)' },
                { value: ',', label: 'Coma  ,  (estándar)' },
                { value: 'tab', label: 'Tabulador  ⇥  (pegar en planillas)' },
              ]}
            />
          </Campo>
          <Campo etiqueta="Separador decimal">
            <Select
              value={c.decimal}
              onChange={(v) => actualizarCsv({ decimal: v as ConfigExport['csv']['decimal'] })}
              options={[
                { value: ',', label: 'Coma  1.234,50  (es-AR)' },
                { value: '.', label: 'Punto  1,234.50  (inglés)' },
              ]}
            />
          </Campo>
          <Campo etiqueta="Comillas">
            <Select
              value={c.comillas}
              onChange={(v) => actualizarCsv({ comillas: v as ConfigExport['csv']['comillas'] })}
              options={[
                { value: 'minimas', label: 'Solo cuando hace falta (RFC 4180)' },
                { value: 'todas', label: 'Entrecomillar todo' },
              ]}
            />
          </Campo>
          <Campo etiqueta="Fin de línea">
            <Select
              value={c.finLinea}
              onChange={(v) => actualizarCsv({ finLinea: v as ConfigExport['csv']['finLinea'] })}
              options={[
                { value: 'crlf', label: 'CRLF (Windows / Excel)' },
                { value: 'lf', label: 'LF (Linux / macOS)' },
              ]}
            />
          </Campo>
        </div>
      </Bloque>

      <Bloque titulo="Contenido">
        <div className="grid gap-y-2 sm:grid-cols-2">
          <Casilla etiqueta="Fila de títulos" valor={c.encabezados} onChange={(v) => actualizarCsv({ encabezados: v })} />
          <Casilla
            etiqueta="Firma UTF-8 (BOM)"
            ayuda="Sin ella, Excel abre los acentos rotos."
            valor={c.bom}
            onChange={(v) => actualizarCsv({ bom: v })}
          />
          <Casilla
            etiqueta="Valores crudos"
            ayuda="1234.5 en vez de $ 1.234,50. Es lo que quiere un script o una tabla dinámica."
            valor={c.crudo}
            onChange={(v) => actualizarCsv({ crudo: v })}
          />
        </div>
      </Bloque>
    </div>
  )
}

/* ===================== Sección: Archivo ===================== */

const TOKENS: Array<[string, string]> = [
  ['{fecha}', 'aaaa-mm-dd'],
  ['{hora}', 'hhmm'],
  ['{sucursal}', 'la sucursal (o «todas»)'],
  ['{vista}', 'vista / catalogo'],
  ['{n}', 'cantidad de filas'],
]

function SeccionArchivo({
  config,
  nombreArchivo,
  actualizar,
  onCopiar,
  puedeCopiar,
}: {
  config: ConfigExport
  nombreArchivo: string
  actualizar: (patch: Partial<ConfigExport>) => void
  onCopiar: () => void
  puedeCopiar: boolean
}) {
  return (
    <div className="space-y-6">
      <Bloque titulo="Nombre del archivo" ayuda="Podés usar tokens: se reemplazan al exportar.">
        <Input
          value={config.nombreArchivo}
          onChange={(e) => actualizar({ nombreArchivo: e.target.value })}
          placeholder="inventario-{sucursal}-{fecha}"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {TOKENS.map(([token, que]) => (
            <button
              key={token}
              type="button"
              title={que}
              onClick={() => actualizar({ nombreArchivo: `${config.nombreArchivo}${token}` })}
              className="rounded-full border border-line-strong px-2.5 py-1 font-mono text-[0.65rem] text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900"
            >
              {token}
            </button>
          ))}
        </div>
        <p className="mt-2.5 rounded-lg bg-ink-50 px-3 py-2 font-mono text-xs text-ink-700">
          {nombreArchivo}
        </p>
      </Bloque>

      <Bloque
        titulo="Sin bajar el archivo"
        ayuda="Copia la tabla separada por tabuladores: se pega directo en Excel o Google Sheets."
      >
        <Button variant="outline" onClick={onCopiar} disabled={!puedeCopiar}>
          <ClipboardCopy className="h-4 w-4" />
          Copiar al portapapeles
        </Button>
      </Bloque>
    </div>
  )
}

/* ===================== Vista previa ===================== */

const FILAS_PREVIEW = 9

function VistaPrevia({ dataset, nombre }: { dataset: Dataset; nombre: string }) {
  const { config, columnas, meta } = dataset
  const filas = dataset.filas.slice(0, FILAS_PREVIEW)
  const hojas = config.formato === 'xlsx' ? nombresDeHojas(dataset) : []

  if (config.formato === 'csv') {
    const lineas = [
      config.csv.encabezados ? columnas.map((c) => c.label).join(muestraDelimitador(config)) : null,
      ...filas.map((fila) =>
        columnas.map((c) => textoCelda(c.valor(fila), c.tipo)).join(muestraDelimitador(config)),
      ),
    ].filter((l): l is string => l !== null)
    return (
      <Marco titulo="Vista previa" pie={<PieVistaPrevia dataset={dataset} nombre={nombre} />}>
        <pre className="overflow-x-auto whitespace-pre rounded-lg bg-ink-950 px-3 py-2.5 font-mono text-[0.6rem] leading-relaxed text-on-ink">
          {lineas.join('\n')}
          {dataset.filas.length > FILAS_PREVIEW && '\n…'}
        </pre>
      </Marco>
    )
  }

  return (
    <Marco titulo="Vista previa" pie={<PieVistaPrevia dataset={dataset} nombre={nombre} />}>
      {hojas.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {hojas.map((hoja, i) => (
            <span
              key={hoja}
              className={cn(
                'rounded-t-md border-b-2 px-2 py-1 text-[0.6rem] font-medium',
                i === 0
                  ? 'border-ink-950 bg-ink-100 text-ink-900'
                  : 'border-transparent bg-ink-50 text-ink-500',
              )}
            >
              {hoja}
            </span>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        {/* Encabezado del documento */}
        <div className="flex items-start gap-2 border-b border-line px-2.5 py-2">
          {config.conLogo && (
            <img src={LOGO_CELTUC} alt="" className="mt-0.5 h-6 w-6 shrink-0 rounded-sm object-contain" />
          )}
          <div className="min-w-0">
            <p className="truncate text-[0.7rem] font-semibold leading-tight text-ink-900">
              {meta.titulo}
            </p>
            <p className="truncate text-[0.55rem] leading-tight text-ink-500">
              {[meta.subtitulo, meta.sucursalesTexto].filter(Boolean).join(' · ')}
            </p>
            <p className="truncate text-[0.55rem] leading-tight text-ink-400">
              {meta.filtros.join(' · ')}
            </p>
          </div>
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[0.55rem]">
            <thead>
              <tr className="bg-ink-950 text-on-ink">
                {columnas.map((c) => (
                  <th
                    key={c.id}
                    className={cn(
                      'whitespace-nowrap px-1.5 py-1 font-semibold',
                      c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left',
                    )}
                  >
                    {c.corto}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dataset.grupos.slice(0, 3).map((grupo) => (
                <PreviewGrupo
                  key={grupo.clave || 'todo'}
                  grupo={grupo}
                  dataset={dataset}
                  restantes={FILAS_PREVIEW}
                />
              ))}
              {!dataset.filas.length && (
                <tr>
                  <td colSpan={columnas.length} className="px-2 py-4 text-center text-ink-400">
                    Sin filas con estos filtros
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Marco>
  )
}

function PreviewGrupo({
  grupo,
  dataset,
  restantes,
}: {
  grupo: Dataset['grupos'][number]
  dataset: Dataset
  restantes: number
}) {
  const { columnas, config } = dataset
  const filas = grupo.filas.slice(0, Math.max(2, Math.floor(restantes / 2)))
  return (
    <>
      {dataset.agrupado && (
        <tr className="bg-ink-100">
          <td colSpan={columnas.length} className="px-1.5 py-1 font-semibold uppercase tracking-wide text-ink-800">
            {grupo.titulo}
          </td>
        </tr>
      )}
      {filas.map((fila, i) => {
        const bajo =
          fila.bajoMinimo &&
          (config.formato === 'pdf' ? config.pdf.resaltarBajoMinimo : config.xlsx.resaltarBajoMinimo)
        return (
          <tr
            key={`${fila.producto.id}-${fila.sucursal?.id ?? 0}`}
            className={cn('border-b border-line', i % 2 === 1 && 'bg-ink-50/60')}
          >
            {columnas.map((c) => (
              <td
                key={c.id}
                className={cn(
                  'max-w-[7rem] truncate px-1.5 py-[3px]',
                  c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left',
                  c.blanca && 'border border-dashed border-line-strong',
                  bajo && c.id === 'total' && 'bg-ink-950 font-semibold text-on-ink',
                )}
              >
                {textoCelda(c.valor(fila), c.tipo)}
              </td>
            ))}
          </tr>
        )
      })}
    </>
  )
}

function PieVistaPrevia({ dataset, nombre }: { dataset: Dataset; nombre: string }) {
  const { config } = dataset
  const partes: string[] = [`${num(dataset.filas.length)} filas`, `${dataset.columnas.length} col.`]
  if (config.formato === 'xlsx') partes.push(`${nombresDeHojas(dataset).length} hojas`)
  if (config.formato === 'pdf') partes.push(`~${paginasEstimadas(dataset)} pág.`)
  partes.push(`~${pesoLegible(pesoEstimado(dataset))}`)
  return (
    <>
      <p className="truncate font-mono text-[0.6rem] text-ink-500">{nombre}</p>
      <p className="text-[0.6rem] text-ink-400">{partes.join(' · ')}</p>
    </>
  )
}

function Marco({ titulo, children, pie }: { titulo: string; children: ReactNode; pie?: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[0.6rem] font-semibold uppercase tracking-[0.08em] text-ink-400">
        {titulo}
      </p>
      {children}
      {pie && <div className="mt-2 space-y-0.5">{pie}</div>}
    </div>
  )
}

/* ===================== Piezas chicas ===================== */

function Bloque({
  titulo,
  ayuda,
  children,
}: {
  titulo: string
  ayuda?: string
  children: ReactNode
}) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-700">{titulo}</h3>
      {ayuda && <p className="mb-2.5 mt-0.5 text-xs text-ink-400">{ayuda}</p>}
      <div className={ayuda ? '' : 'mt-2.5'}>{children}</div>
    </section>
  )
}

function Campo({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-600">{etiqueta}</span>
      {children}
    </label>
  )
}

function Casilla({
  etiqueta,
  ayuda,
  valor,
  onChange,
}: {
  etiqueta: string
  ayuda?: string
  valor: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer select-none items-start gap-2 pr-3 text-sm text-ink-700">
      <input
        type="checkbox"
        checked={valor}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-line-strong accent-ink-950"
      />
      <span className="min-w-0">
        {etiqueta}
        {ayuda && <span className="block text-[0.65rem] leading-tight text-ink-400">{ayuda}</span>}
      </span>
    </label>
  )
}

function TarjetaOpcion({
  activa,
  onClick,
  titulo,
  detalle,
}: {
  activa: boolean
  onClick: () => void
  titulo: string
  detalle: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      className={cn(
        'rounded-xl border px-3.5 py-3 text-left transition-colors',
        activa
          ? 'border-ink-950 bg-ink-50'
          : 'border-line-strong bg-surface hover:border-ink-300 hover:bg-ink-50',
      )}
    >
      <span className="flex items-center gap-1.5">
        <span
          className={cn(
            'h-3.5 w-3.5 shrink-0 rounded-full border-[3px] transition-colors',
            activa ? 'border-ink-950 bg-surface' : 'border-line-strong bg-surface',
          )}
        />
        <span className="text-sm font-medium text-ink-900">{titulo}</span>
      </span>
      <span className="mt-1 block text-xs leading-snug text-ink-500">{detalle}</span>
    </button>
  )
}

/* ===================== Utilidades ===================== */

const ETIQUETA_MOVIMIENTO: Record<string, string> = {
  ingreso: 'Ingreso',
  egreso: 'Egreso',
  ajuste: 'Ajuste',
  transferencia: 'Transferencia',
  venta: 'Venta',
}

function muestraDelimitador(config: ConfigExport): string {
  return config.csv.delimitador === '\t' ? '\t' : config.csv.delimitador
}

function nombresDeHojas(dataset: Dataset): string[] {
  const hojas = ['Inventario']
  if (dataset.config.xlsx.hojaResumen) hojas.push('Resumen')
  if (dataset.config.xlsx.hojaKardex) hojas.push('Kardex')
  if (dataset.config.xlsx.hojaFiltros) hojas.push('Cómo se generó')
  return hojas
}

/** Estimación grosera del peso, solo para orientar antes de bajar el archivo. */
function pesoEstimado(dataset: Dataset): number {
  const celdas = dataset.filas.length * dataset.columnas.length
  if (dataset.config.formato === 'csv') return celdas * 12 + 200
  if (dataset.config.formato === 'pdf') {
    return 24_000 + celdas * 42 + (dataset.logo ? 12_000 : 0)
  }
  return 18_000 + celdas * 30 + (dataset.logo ? 12_000 : 0)
}

function paginasEstimadas(dataset: Dataset): number {
  const porPagina = dataset.config.pdf.densidad === 'compacta' ? 58 : 42
  const grupos = dataset.agrupado ? dataset.grupos.length * 2 : 0
  const paginas = Math.ceil((dataset.filas.length + grupos) / porPagina) || 1
  return paginas + (dataset.config.pdf.paginaResumen ? 1 : 0)
}

function pesoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}
