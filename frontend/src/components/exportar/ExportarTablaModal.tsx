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
  Table2,
  Trash2,
  X,
} from 'lucide-react'
import { LOGO_CELTUC } from '@/documentos/assets'
import { descargarBlob } from '@/lib/descargar'
import { num } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAuth } from '@/store/auth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ToastProvider'
import {
  EXTENSION_TABLA,
  configPorDefecto,
  fusionarConfigTabla,
  type ConfigExportTabla,
  type FormatoExportTabla,
  type GestorExport,
  type ParcialConfigTabla,
  type PlantillaTabla,
} from './tipos'
import {
  construirDatasetTabla,
  resolverNombreArchivoTabla,
  textoCeldaTabla,
  type DatasetTabla,
} from './datos'

/**
 * Studio de exportación GENÉRICO: el mismo panel de configuración + vista
 * previa en vivo del exportador de Inventario, pero para cualquier gestor.
 *
 * Cada gestor describe sus columnas y sus filas (`GestorExport`) y obtiene:
 * XLSX / PDF / CSV con sus opciones, columnas elegibles y reordenables,
 * agrupado, orden, título/subtítulo, logo, nombre de archivo con tokens,
 * copia al portapapeles y configuraciones guardadas como plantillas.
 *
 * Lo que se elige se recuerda entre visitas, POR GESTOR (localStorage).
 */

type SeccionId = 'datos' | 'columnas' | 'diseno' | 'formato' | 'archivo' | 'preview'

const claveConfig = (gestor: string) => `celtuc:${gestor}:export:v1`
const clavePlantillas = (gestor: string) => `celtuc:${gestor}:export:plantillas:v1`

const FORMATOS: Array<{
  id: FormatoExportTabla
  nombre: string
  icono: typeof FileSpreadsheet
  pitch: string
}> = [
  { id: 'xlsx', nombre: 'Excel', icono: FileSpreadsheet, pitch: 'Con fórmulas, filtros y totales' },
  { id: 'pdf', nombre: 'PDF', icono: FileText, pitch: 'Informe listo para imprimir' },
  { id: 'csv', nombre: 'CSV', icono: Table2, pitch: 'Datos crudos para analizar' },
]

interface Props<T> {
  abierto: boolean
  onCerrar: () => void
  gestor: GestorExport<T>
  /** Las filas tal como se ven en pantalla (filtros de la pantalla aplicados). */
  filasVista: T[]
  /** El listado completo, sin filtros. Si falta, no se ofrece elegir alcance. */
  filasTodas?: T[]
  /** Los filtros de la pantalla, en castellano, para la ficha del archivo. */
  contextoVista?: string[]
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

export function ExportarTablaModal<T>({
  abierto,
  onCerrar,
  gestor,
  filasVista,
  filasTodas,
  contextoVista = [],
}: Props<T>) {
  const toast = useToast()
  const usuario = useAuth((s) => s.usuario?.username ?? '')
  const [config, setConfig] = useState<ConfigExportTabla>(() => configPorDefecto(gestor))
  const [seccion, setSeccion] = useState<SeccionId>('datos')
  const [ocupado, setOcupado] = useState(false)
  const [plantillasPropias, setPlantillasPropias] = useState<PlantillaTabla[]>([])
  const [guardandoPlantilla, setGuardandoPlantilla] = useState(false)
  const [nombrePlantilla, setNombrePlantilla] = useState('')
  const yaAbrio = useRef(false)

  const idsValidos = useMemo(() => new Set(gestor.columnas.map((c) => c.id)), [gestor])

  /** Sanea una config que vino de localStorage o de una plantilla. */
  function sanear(cfg: ConfigExportTabla): ConfigExportTabla {
    const columnas = cfg.columnas.filter((id) => idsValidos.has(id))
    return {
      ...cfg,
      columnas: columnas.length ? columnas : configPorDefecto(gestor).columnas,
      agruparPor: gestor.grupos?.some((g) => g.id === cfg.agruparPor) ? cfg.agruparPor : '',
      ordenCol: idsValidos.has(cfg.ordenCol) ? cfg.ordenCol : '',
      alcance: cfg.alcance === 'todo' && filasTodas ? 'todo' : 'vista',
    }
  }

  // Al abrir: se recupera lo último que usó para ESTE gestor.
  useEffect(() => {
    if (!abierto) {
      yaAbrio.current = false
      return
    }
    if (yaAbrio.current) return
    yaAbrio.current = true
    setPlantillasPropias(leerGuardado<PlantillaTabla[]>(clavePlantillas(gestor.id)) ?? [])
    setSeccion('datos')
    const inicial = configPorDefecto(gestor)
    const guardada = leerGuardado<ParcialConfigTabla>(claveConfig(gestor.id))
    setConfig(sanear(guardada ? fusionarConfigTabla(inicial, guardada) : inicial))
    // `sanear` depende de props estables durante la vida del modal abierto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, gestor])

  const actualizar = (patch: Partial<ConfigExportTabla>) => setConfig((c) => ({ ...c, ...patch }))
  const actualizarXlsx = (patch: Partial<ConfigExportTabla['xlsx']>) =>
    setConfig((c) => ({ ...c, xlsx: { ...c.xlsx, ...patch } }))
  const actualizarPdf = (patch: Partial<ConfigExportTabla['pdf']>) =>
    setConfig((c) => ({ ...c, pdf: { ...c.pdf, ...patch } }))
  const actualizarCsv = (patch: Partial<ConfigExportTabla['csv']>) =>
    setConfig((c) => ({ ...c, csv: { ...c.csv, ...patch } }))

  const fuentes = useMemo(
    () => ({ filasVista, filasTodas, contexto: contextoVista, usuario }),
    [filasVista, filasTodas, contextoVista, usuario],
  )

  // El dataset completo: alimenta a la vez el contador, la vista previa y el
  // archivo final. Uno solo, así lo que se ve es exactamente lo que baja.
  const dataset = useMemo(
    () => (abierto ? construirDatasetTabla(config, gestor, fuentes, { logo: LOGO_CELTUC }) : null),
    [abierto, config, gestor, fuentes],
  )

  const nombreArchivo = useMemo(
    () =>
      resolverNombreArchivoTabla(config.nombreArchivo, {
        filas: dataset?.filas.length ?? 0,
        fecha: new Date(),
        extension: EXTENSION_TABLA[config.formato],
        base: gestor.id,
      }),
    [config, dataset, gestor.id],
  )

  /* ---- Exportar ---- */
  async function exportar() {
    if (!dataset || ocupado) return
    if (!dataset.filas.length) {
      toast.error('No hay nada para exportar', 'El listado está vacío.')
      return
    }
    setOcupado(true)
    try {
      const ds = construirDatasetTabla(config, gestor, fuentes, {
        logo: LOGO_CELTUC,
        generado: new Date(),
      })
      let blob: Blob
      if (config.formato === 'csv') {
        const { construirCsvTabla } = await import('./csv')
        blob = construirCsvTabla(ds)
      } else if (config.formato === 'xlsx') {
        const { construirXlsxTabla } = await import('./xlsx')
        blob = await construirXlsxTabla(ds)
      } else {
        const { construirPdfTabla } = await import('./pdf')
        blob = await construirPdfTabla(ds)
      }
      descargarBlob(blob, nombreArchivo)
      guardar(claveConfig(gestor.id), config)
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

  async function copiarAlPortapapeles() {
    if (!dataset?.filas.length) return
    try {
      const { construirTsvTabla } = await import('./csv')
      await navigator.clipboard.writeText(construirTsvTabla(dataset))
      toast.success('Copiado', `${num(dataset.filas.length)} filas listas para pegar en una planilla.`)
    } catch {
      toast.error('No se pudo copiar', 'El navegador bloqueó el portapapeles.')
    }
  }

  /* ---- Plantillas ---- */
  function usarPlantilla(plantilla: PlantillaTabla) {
    setConfig(sanear(fusionarConfigTabla(configPorDefecto(gestor), plantilla.config)))
    toast.success('Plantilla aplicada', plantilla.nombre)
  }

  function guardarPlantilla() {
    const nombre = nombrePlantilla.trim()
    if (!nombre) return
    const nueva: PlantillaTabla = {
      id: `propia-${Date.now()}`,
      nombre,
      descripcion: `${config.formato.toUpperCase()} · ${dataset?.columnas.length ?? 0} columnas`,
      config,
    }
    const siguientes = [...plantillasPropias.filter((p) => p.nombre !== nombre), nueva]
    setPlantillasPropias(siguientes)
    guardar(clavePlantillas(gestor.id), siguientes)
    setGuardandoPlantilla(false)
    setNombrePlantilla('')
    toast.success('Plantilla guardada', nombre)
  }

  function borrarPlantilla(id: string) {
    const siguientes = plantillasPropias.filter((p) => p.id !== id)
    setPlantillasPropias(siguientes)
    guardar(clavePlantillas(gestor.id), siguientes)
  }

  const secciones: Array<{ id: SeccionId; label: string; icono: typeof Filter }> = [
    { id: 'datos', label: 'Datos', icono: Filter },
    { id: 'columnas', label: 'Columnas', icono: Columns3 },
    { id: 'diseno', label: 'Diseño', icono: Palette },
    { id: 'formato', label: `Opciones de ${config.formato === 'xlsx' ? 'Excel' : config.formato.toUpperCase()}`, icono: Settings2 },
    { id: 'archivo', label: 'Archivo', icono: Download },
  ]

  const tituloId = `titulo-exportar-${gestor.id}`

  return (
    <Modal
      open={abierto}
      onClose={onCerrar}
      size="xl"
      className="sm:max-w-[74rem]"
      labelledBy={tituloId}
    >
      {/* Encabezado */}
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h2 id={tituloId} className="text-base font-semibold text-ink-900">
            Exportar {gestor.titulo.toLowerCase()}
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

          {plantillasPropias.length > 0 && (
            <>
              <div className="my-3 h-px bg-line" />
              <p className="px-1 pb-1.5 text-[0.6rem] font-semibold uppercase tracking-[0.08em] text-ink-400">
                Plantillas
              </p>
              <div className="space-y-0.5">
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
            </>
          )}

          {plantillasPropias.length === 0 && <div className="my-3 h-px bg-line" />}

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
              filasVista={filasVista.length}
              filasTodas={filasTodas?.length}
              contextoVista={contextoVista}
              dataset={dataset}
              actualizar={actualizar}
            />
          )}
          {seccion === 'columnas' && (
            <SeccionColumnas gestor={gestor} config={config} onColumnas={(columnas) => actualizar({ columnas })} />
          )}
          {seccion === 'diseno' && (
            <SeccionDiseno gestor={gestor} config={config} actualizar={actualizar} />
          )}
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
          onClick={() => setConfig(configPorDefecto(gestor))}
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

function SeccionDatos<T>({
  config,
  filasVista,
  filasTodas,
  contextoVista,
  dataset,
  actualizar,
}: {
  config: ConfigExportTabla
  filasVista: number
  filasTodas: number | undefined
  contextoVista: string[]
  dataset: DatasetTabla<T> | null
  actualizar: (patch: Partial<ConfigExportTabla>) => void
}) {
  return (
    <div className="space-y-6">
      {filasTodas !== undefined ? (
        <Bloque titulo="Qué filas entran" ayuda="El punto de partida del archivo.">
          <div className="grid gap-2 sm:grid-cols-2">
            <TarjetaOpcion
              activa={config.alcance === 'vista'}
              onClick={() => actualizar({ alcance: 'vista' })}
              titulo="Lo que estoy viendo"
              detalle={`${num(filasVista)} filas${contextoVista.length ? ` · ${contextoVista.join(' · ')}` : ''}`}
            />
            <TarjetaOpcion
              activa={config.alcance === 'todo'}
              onClick={() => actualizar({ alcance: 'todo' })}
              titulo="El listado completo"
              detalle={`${num(filasTodas)} filas, sin los filtros de la pantalla`}
            />
          </div>
        </Bloque>
      ) : (
        <Bloque
          titulo="Qué filas entran"
          ayuda="Se exporta lo que está cargado en pantalla, con los filtros aplicados."
        >
          <p className="rounded-xl border border-line bg-surface px-3.5 py-3 text-sm text-ink-700">
            <span className="font-semibold text-ink-900">{num(filasVista)}</span> filas
            {contextoVista.length ? ` · ${contextoVista.join(' · ')}` : ''}
          </p>
        </Bloque>
      )}

      {dataset && (
        <Bloque titulo="Resumen">
          <p className="text-xs text-ink-500">
            Se exportan <span className="font-semibold text-ink-900">{num(dataset.filas.length)}</span>{' '}
            filas con <span className="font-semibold text-ink-900">{dataset.columnas.length}</span>{' '}
            columnas
            {dataset.agrupado && dataset.grupoLabel
              ? `, agrupadas por ${dataset.grupoLabel.toLowerCase()}`
              : ''}
            .
          </p>
        </Bloque>
      )}
    </div>
  )
}

/* ===================== Sección: Columnas ===================== */

function SeccionColumnas<T>({
  gestor,
  config,
  onColumnas,
}: {
  gestor: GestorExport<T>
  config: ConfigExportTabla
  onColumnas: (columnas: string[]) => void
}) {
  const [arrastrando, setArrastrando] = useState<string | null>(null)
  const porId = useMemo(() => new Map(gestor.columnas.map((c) => [c.id, c])), [gestor])

  const activas = config.columnas
    .map((id) => porId.get(id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))

  const enUso = new Set(activas.map((c) => c.id))
  const disponibles = gestor.columnas.filter((c) => !enUso.has(c.id))
  const ancla = gestor.columnas[0]?.id

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
        ayuda="Arrastrá para cambiar el orden. La primera columna del gestor va siempre."
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
              <span className="min-w-0 flex-1 truncate text-sm text-ink-800">{c.label}</span>
              {c.ayuda && (
                <span className="hidden truncate text-[0.65rem] text-ink-400 sm:block sm:max-w-[14rem]">
                  {c.ayuda}
                </span>
              )}
              <div className="flex shrink-0 items-center">
                <button
                  type="button"
                  onClick={() => desplazar(c.id, -1)}
                  disabled={i === 0}
                  aria-label={`Subir ${c.label}`}
                  className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-ink-50 hover:text-ink-800 disabled:pointer-events-none disabled:opacity-30"
                >
                  <ArrowUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => desplazar(c.id, 1)}
                  disabled={i === activas.length - 1}
                  aria-label={`Bajar ${c.label}`}
                  className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-ink-50 hover:text-ink-800 disabled:pointer-events-none disabled:opacity-30"
                >
                  <ArrowDown className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onColumnas(config.columnas.filter((x) => x !== c.id))}
                  disabled={c.id === ancla}
                  aria-label={`Quitar ${c.label}`}
                  title={c.id === ancla ? 'Esta columna no se puede quitar' : undefined}
                  className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-ink-50 hover:text-ink-800 disabled:pointer-events-none disabled:opacity-25"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </Bloque>

      {disponibles.length > 0 && (
        <Bloque titulo="Para agregar">
          <div className="flex flex-wrap gap-1.5">
            {disponibles.map((def) => (
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
      )}
    </div>
  )
}

/* ===================== Sección: Diseño ===================== */

function SeccionDiseno<T>({
  gestor,
  config,
  actualizar,
}: {
  gestor: GestorExport<T>
  config: ConfigExportTabla
  actualizar: (patch: Partial<ConfigExportTabla>) => void
}) {
  const ordenables = gestor.columnas.filter((c) => config.columnas.includes(c.id))
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
              placeholder={gestor.titulo}
            />
          </Campo>
          <Campo etiqueta="Subtítulo (opcional)">
            <Input
              value={config.subtitulo}
              onChange={(e) => actualizar({ subtitulo: e.target.value })}
              placeholder="Cierre de mes, control, respaldo…"
            />
          </Campo>
        </div>
      </Bloque>

      <Bloque titulo="Orden y agrupación">
        <div className="grid gap-2.5 sm:grid-cols-3">
          {gestor.grupos?.length ? (
            <Campo etiqueta="Agrupar por">
              <Select
                value={config.agruparPor}
                onChange={(v) => actualizar({ agruparPor: v })}
                options={[
                  { value: '', label: 'Sin agrupar' },
                  ...gestor.grupos.map((g) => ({ value: g.id, label: g.label })),
                ]}
              />
            </Campo>
          ) : null}
          <Campo etiqueta="Ordenar por">
            <Select
              value={config.ordenCol}
              onChange={(v) => actualizar({ ordenCol: v })}
              options={[
                { value: '', label: 'Orden del gestor' },
                ...ordenables.map((c) => ({ value: c.id, label: c.label })),
              ]}
            />
          </Campo>
          {config.ordenCol && (
            <Campo etiqueta="Dirección">
              <Select
                value={config.ordenDir}
                onChange={(v) => actualizar({ ordenDir: v as ConfigExportTabla['ordenDir'] })}
                options={[
                  { value: 'asc', label: 'Ascendente (A→Z, 0→9)' },
                  { value: 'desc', label: 'Descendente (Z→A, 9→0)' },
                ]}
              />
            </Campo>
          )}
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
  config: ConfigExportTabla
  actualizarXlsx: (patch: Partial<ConfigExportTabla['xlsx']>) => void
  actualizarPdf: (patch: Partial<ConfigExportTabla['pdf']>) => void
  actualizarCsv: (patch: Partial<ConfigExportTabla['csv']>) => void
}) {
  if (config.formato === 'xlsx') {
    const x = config.xlsx
    const agrupado = Boolean(config.agruparPor)
    return (
      <div className="space-y-6">
        <Bloque titulo="La tabla" ayuda="Lo que hace que el Excel se pueda trabajar, no solo mirar.">
          <div className="grid gap-y-2 sm:grid-cols-2">
            <Casilla etiqueta="Autofiltro en los títulos" valor={x.autofiltro} onChange={(v) => actualizarXlsx({ autofiltro: v })} />
            <Casilla etiqueta="Fijar títulos al scrollear" valor={x.congelar} onChange={(v) => actualizarXlsx({ congelar: v })} />
            <Casilla etiqueta="Filas alternadas" valor={x.bandas} onChange={(v) => actualizarXlsx({ bandas: v })} />
            {agrupado && (
              <Casilla etiqueta="Grupos plegables (+/-)" valor={x.agrupable} onChange={(v) => actualizarXlsx({ agrupable: v })} />
            )}
          </div>
        </Bloque>

        <Bloque titulo="Totales" ayuda="Solo suman las columnas que son sumables (importes y cantidades).">
          <div className="grid gap-y-2 sm:grid-cols-2">
            {agrupado && (
              <Casilla etiqueta="Subtotal por grupo" valor={x.subtotales} onChange={(v) => actualizarXlsx({ subtotales: v })} />
            )}
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
          <Casilla
            etiqueta="Cómo se generó"
            ayuda="Una hoja con los filtros, columnas, usuario y fecha. Trazabilidad."
            valor={x.hojaFicha}
            onChange={(v) => actualizarXlsx({ hojaFicha: v })}
          />
        </Bloque>
      </div>
    )
  }

  if (config.formato === 'pdf') {
    const p = config.pdf
    const agrupado = Boolean(config.agruparPor)
    return (
      <div className="space-y-6">
        <Bloque titulo="Página">
          <div className="grid gap-2.5 sm:grid-cols-3">
            <Campo etiqueta="Tamaño">
              <Select
                value={p.tamano}
                onChange={(v) => actualizarPdf({ tamano: v as ConfigExportTabla['pdf']['tamano'] })}
                options={[
                  { value: 'A4', label: 'A4' },
                  { value: 'LETTER', label: 'Carta' },
                ]}
              />
            </Campo>
            <Campo etiqueta="Orientación">
              <Select
                value={p.orientacion}
                onChange={(v) => actualizarPdf({ orientacion: v as ConfigExportTabla['pdf']['orientacion'] })}
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
                onChange={(v) => actualizarPdf({ densidad: v as ConfigExportTabla['pdf']['densidad'] })}
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
            {agrupado && (
              <Casilla etiqueta="Subtotal por grupo" valor={p.subtotales} onChange={(v) => actualizarPdf({ subtotales: v })} />
            )}
            <Casilla etiqueta="Total general" valor={p.totalGeneral} onChange={(v) => actualizarPdf({ totalGeneral: v })} />
            <Casilla etiqueta="Filas alternadas" valor={p.bandas} onChange={(v) => actualizarPdf({ bandas: v })} />
            <Casilla etiqueta="«Página X de Y» al pie" valor={p.numeroPagina} onChange={(v) => actualizarPdf({ numeroPagina: v })} />
            <Casilla etiqueta="Datos del local al pie" valor={p.pie} onChange={(v) => actualizarPdf({ pie: v })} />
            {agrupado && (
              <Casilla
                etiqueta="Cada grupo en hoja nueva"
                ayuda="Para repartir una hoja por grupo."
                valor={p.saltoPorGrupo}
                onChange={(v) => actualizarPdf({ saltoPorGrupo: v })}
              />
            )}
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
                actualizarCsv({ delimitador: (v === 'tab' ? '\t' : v) as ConfigExportTabla['csv']['delimitador'] })
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
              onChange={(v) => actualizarCsv({ decimal: v as ConfigExportTabla['csv']['decimal'] })}
              options={[
                { value: ',', label: 'Coma  1.234,50  (es-AR)' },
                { value: '.', label: 'Punto  1,234.50  (inglés)' },
              ]}
            />
          </Campo>
          <Campo etiqueta="Comillas">
            <Select
              value={c.comillas}
              onChange={(v) => actualizarCsv({ comillas: v as ConfigExportTabla['csv']['comillas'] })}
              options={[
                { value: 'minimas', label: 'Solo cuando hace falta (RFC 4180)' },
                { value: 'todas', label: 'Entrecomillar todo' },
              ]}
            />
          </Campo>
          <Campo etiqueta="Fin de línea">
            <Select
              value={c.finLinea}
              onChange={(v) => actualizarCsv({ finLinea: v as ConfigExportTabla['csv']['finLinea'] })}
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
            ayuda="1234.5 en vez de $ 1.234,50 y fechas ISO. Es lo que quiere un script o una tabla dinámica."
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
  ['{n}', 'cantidad de filas'],
]

function SeccionArchivo({
  config,
  nombreArchivo,
  actualizar,
  onCopiar,
  puedeCopiar,
}: {
  config: ConfigExportTabla
  nombreArchivo: string
  actualizar: (patch: Partial<ConfigExportTabla>) => void
  onCopiar: () => void
  puedeCopiar: boolean
}) {
  return (
    <div className="space-y-6">
      <Bloque titulo="Nombre del archivo" ayuda="Podés usar tokens: se reemplazan al exportar.">
        <Input
          value={config.nombreArchivo}
          onChange={(e) => actualizar({ nombreArchivo: e.target.value })}
          placeholder="listado-{fecha}"
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

function VistaPrevia<T>({ dataset, nombre }: { dataset: DatasetTabla<T>; nombre: string }) {
  const { config, columnas, meta } = dataset

  if (config.formato === 'csv') {
    const delimitador = config.csv.delimitador === '\t' ? '\t' : config.csv.delimitador
    const filas = dataset.filas.slice(0, FILAS_PREVIEW)
    const lineas = [
      config.csv.encabezados ? columnas.map((c) => c.label).join(delimitador) : null,
      ...filas.map((fila) =>
        columnas.map((c) => textoCeldaTabla(c.valor(fila), c.tipo)).join(delimitador),
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
            {meta.subtitulo && (
              <p className="truncate text-[0.55rem] leading-tight text-ink-500">{meta.subtitulo}</p>
            )}
            <p className="truncate text-[0.55rem] leading-tight text-ink-400">
              {meta.contexto.join(' · ')}
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
                <PreviewGrupo key={grupo.clave || 'todo'} grupo={grupo} dataset={dataset} />
              ))}
              {!dataset.filas.length && (
                <tr>
                  <td colSpan={columnas.length} className="px-2 py-4 text-center text-ink-400">
                    El listado está vacío
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

function PreviewGrupo<T>({
  grupo,
  dataset,
}: {
  grupo: DatasetTabla<T>['grupos'][number]
  dataset: DatasetTabla<T>
}) {
  const { columnas } = dataset
  const filas = grupo.filas.slice(0, Math.max(2, Math.floor(FILAS_PREVIEW / 2)))
  return (
    <>
      {dataset.agrupado && (
        <tr className="bg-ink-100">
          <td colSpan={columnas.length} className="px-1.5 py-1 font-semibold uppercase tracking-wide text-ink-800">
            {grupo.titulo}
          </td>
        </tr>
      )}
      {filas.map((fila, i) => (
        <tr key={i} className={cn('border-b border-line', i % 2 === 1 && 'bg-ink-50/60')}>
          {columnas.map((c) => (
            <td
              key={c.id}
              className={cn(
                'max-w-[7rem] truncate px-1.5 py-[3px]',
                c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left',
              )}
            >
              {textoCeldaTabla(c.valor(fila), c.tipo)}
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

function PieVistaPrevia<T>({ dataset, nombre }: { dataset: DatasetTabla<T>; nombre: string }) {
  const { config } = dataset
  const partes: string[] = [`${num(dataset.filas.length)} filas`, `${dataset.columnas.length} col.`]
  if (config.formato === 'xlsx') partes.push(`${config.xlsx.hojaFicha ? 2 : 1} hojas`)
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

/** Estimación grosera del peso, solo para orientar antes de bajar el archivo. */
function pesoEstimado<T>(dataset: DatasetTabla<T>): number {
  const celdas = dataset.filas.length * dataset.columnas.length
  if (dataset.config.formato === 'csv') return celdas * 12 + 200
  if (dataset.config.formato === 'pdf') {
    return 24_000 + celdas * 42 + (dataset.logo ? 12_000 : 0)
  }
  return 18_000 + celdas * 30 + (dataset.logo ? 12_000 : 0)
}

function paginasEstimadas<T>(dataset: DatasetTabla<T>): number {
  const porPagina = dataset.config.pdf.densidad === 'compacta' ? 58 : 42
  const grupos = dataset.agrupado ? dataset.grupos.length * 2 : 0
  return Math.ceil((dataset.filas.length + grupos) / porPagina) || 1
}

function pesoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Re-export práctico para que cada página tipee su gestor sin otro import. */
export type { ColumnaTabla, GestorExport, GrupoTabla } from './tipos'
