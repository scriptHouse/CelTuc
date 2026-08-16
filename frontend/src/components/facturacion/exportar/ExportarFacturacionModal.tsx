import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Bookmark,
  BookmarkPlus,
  CalendarRange,
  Columns3,
  Download,
  FileSpreadsheet,
  GripVertical,
  Info,
  Palette,
  Plus,
  Settings2,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from 'lucide-react'
import {
  listarEmisores,
  obtenerResumenFacturacion,
  type ResumenFacturacion,
} from '@/services/facturacion'
import { LOGO_CELTUC } from '@/documentos/assets'
import { money, money0, num } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ToastProvider'
import {
  COLUMNAS,
  FAMILIAS,
  MESES,
  PLANTILLAS_FABRICA,
  aplicarPlantilla,
  configInicial,
  fusionarConfig,
  nombreMes,
  resolverNombreArchivo,
  TOKENS_NOMBRE,
  type ConfigFacturacion,
  type FamiliaColumna,
  type PlantillaFacturacion,
} from './tipos'
import {
  MEDIO_LABEL,
  construirDataset,
  cuentaParaNombre,
  definicionDe,
  type DatasetFacturacion,
} from './datos'

/**
 * Studio de exportación de Facturación.
 *
 * Un panel de configuración a la izquierda y la PLANILLA en vivo a la derecha,
 * con los colores exactos del Excel: cada cambio se ve antes de bajar el
 * archivo. Sale lo facturado con factura electrónica (CAE) del mes elegido,
 * día por día y por medio de cobro, en el formato de siempre.
 *
 * Lo que se elige se recuerda entre visitas, y una configuración que se usa
 * seguido se guarda como plantilla (además de las tres de fábrica).
 */

type SeccionId = 'periodo' | 'columnas' | 'diseno' | 'excel' | 'archivo'

const CLAVE_CONFIG = 'celtuc:facturacion:export:v1'
const CLAVE_PLANTILLAS = 'celtuc:facturacion:export:plantillas:v1'

interface Props {
  abierto: boolean
  onCerrar: () => void
  /** Nombre de quien exporta (va en el encabezado del archivo). */
  usuario: string
  /** Mes inicial (por defecto, el mes en curso). */
  anioInicial?: number
  mesInicial?: number
  /** Cuenta preseleccionada (la que se está mirando en Facturación). */
  emisorInicial?: number | null
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
    /* sin localStorage no se recuerda nada; el Studio funciona igual */
  }
}

export function ExportarFacturacionModal({
  abierto,
  onCerrar,
  usuario,
  anioInicial,
  mesInicial,
  emisorInicial,
}: Props) {
  const toast = useToast()
  const hoy = useMemo(() => new Date(), [])
  const [config, setConfig] = useState<ConfigFacturacion>(() =>
    configInicial(anioInicial ?? hoy.getFullYear(), mesInicial ?? hoy.getMonth() + 1),
  )
  const [seccion, setSeccion] = useState<SeccionId>('periodo')
  const [ocupado, setOcupado] = useState(false)
  const [plantillasPropias, setPlantillasPropias] = useState<PlantillaFacturacion[]>([])
  const [guardandoPlantilla, setGuardandoPlantilla] = useState(false)
  const [nombrePlantilla, setNombrePlantilla] = useState('')
  const yaAbrio = useRef(false)

  // Las cuentas del negocio: para elegir cuáles entran y nombrarlas en el
  // encabezado. Si la API no responde, el Studio sigue: van todas.
  const { data: emisores = [] } = useQuery({
    queryKey: ['emisores'],
    queryFn: listarEmisores,
    enabled: abierto,
    retry: false,
  })

  // Al abrir: se recupera lo último que usó, pero el período arranca SIEMPRE en
  // el mes que se estaba mirando (es lo que la persona vino a exportar).
  useEffect(() => {
    if (!abierto) {
      yaAbrio.current = false
      return
    }
    if (yaAbrio.current) return
    yaAbrio.current = true
    setPlantillasPropias(leerGuardado<PlantillaFacturacion[]>(CLAVE_PLANTILLAS) ?? [])
    setSeccion('periodo')
    setGuardandoPlantilla(false)
    const inicial = configInicial(
      anioInicial ?? hoy.getFullYear(),
      mesInicial ?? hoy.getMonth() + 1,
    )
    const guardada = leerGuardado<Partial<ConfigFacturacion>>(CLAVE_CONFIG)
    const base = guardada ? fusionarConfig(inicial, guardada) : inicial
    setConfig({
      ...base,
      anio: inicial.anio,
      mes: inicial.mes,
      // La cuenta que se está mirando manda sobre lo guardado.
      emisores: emisorInicial != null ? [emisorInicial] : (base.emisores ?? []),
      columnas: base.columnas?.length ? sanear(base.columnas) : inicial.columnas,
    })
  }, [abierto, anioInicial, mesInicial, emisorInicial, hoy])

  const actualizar = (patch: Partial<ConfigFacturacion>) => setConfig((c) => ({ ...c, ...patch }))
  const actualizarXlsx = (patch: Partial<ConfigFacturacion['xlsx']>) =>
    setConfig((c) => ({ ...c, xlsx: { ...c.xlsx, ...patch } }))

  /* ---- El resumen del mes (la única fuente de datos) ---- */
  const {
    data: resumen,
    isLoading,
    isFetching,
    error,
  } = useQuery({
    queryKey: ['fact-resumen', config.anio, config.mes, config.emisores, config.incluirOcultos],
    queryFn: () =>
      obtenerResumenFacturacion(config.anio, config.mes, {
        emisores: config.emisores,
        incluirOcultos: config.incluirOcultos,
      }),
    enabled: abierto,
    staleTime: 60_000,
  })

  // El dataset se arma sólo con el resumen del período que se está mostrando:
  // así, mientras se cambia de mes, nunca se ven números del mes anterior.
  const alDia = resumen?.anio === config.anio && resumen?.mes === config.mes
  const dataset = useMemo(
    () =>
      abierto && resumen && alDia
        ? construirDataset(
            config,
            resumen,
            { usuario, emisores: emisores.map((e) => ({ id: e.id, nombre: e.nombre })) },
            { logo: LOGO_CELTUC },
          )
        : null,
    [abierto, resumen, alDia, config, usuario, emisores],
  )

  const nombreArchivo = useMemo(
    () =>
      resolverNombreArchivo(config.nombreArchivo, {
        anio: config.anio,
        mes: config.mes,
        cuenta: dataset ? cuentaParaNombre(dataset) : 'todas',
        generado: new Date(),
      }),
    [config.nombreArchivo, config.anio, config.mes, dataset],
  )

  /* ---- Exportar ---- */
  async function exportar() {
    if (!dataset || ocupado) return
    if (!dataset.totales.cantidad) {
      toast.error(
        'No hay facturación en ese mes',
        `No se emitieron comprobantes en ${nombreMes(config.mes)} ${config.anio} con estas cuentas.`,
      )
      return
    }
    setOcupado(true)
    try {
      const generado = new Date()
      const ds = construirDataset(
        config,
        resumen!,
        { usuario, emisores: emisores.map((e) => ({ id: e.id, nombre: e.nombre })) },
        { logo: LOGO_CELTUC, generado },
      )
      const { construirXlsx } = await import('./xlsx')
      const blob = await construirXlsx(ds)
      descargar(blob, nombreArchivo)
      guardar(CLAVE_CONFIG, config)
      toast.success(
        'Exportado',
        `${nombreArchivo} · ${num(ds.totales.cantidad)} facturas · ${money0(ds.totales.total)}`,
      )
      onCerrar()
    } catch (e) {
      toast.error(
        'No se pudo exportar',
        e instanceof Error ? e.message : 'Probá de nuevo en un momento.',
      )
    } finally {
      setOcupado(false)
    }
  }

  /* ---- Columnas ---- */
  function setColumnas(columnas: string[]) {
    actualizar({ columnas: sanear(columnas) })
  }

  /** Suma columnas de medios dejándolas ANTES del TOTAL (donde se leen). */
  function agregarMedios(ids: string[]) {
    const nuevas = ids.filter((id) => !config.columnas.includes(id) && definicionDe(id))
    if (!nuevas.length) return
    const lista = [...config.columnas]
    const posicion = lista.indexOf('total')
    if (posicion === -1) lista.push(...nuevas)
    else lista.splice(posicion, 0, ...nuevas)
    setColumnas(lista)
    toast.success(
      nuevas.length === 1 ? 'Columna agregada' : 'Columnas agregadas',
      nuevas.map((id) => definicionDe(id)?.label ?? id).join(' · '),
    )
  }

  /* ---- Plantillas ---- */
  function usarPlantilla(plantilla: PlantillaFacturacion) {
    const nueva = aplicarPlantilla(plantilla, {
      anio: config.anio,
      mes: config.mes,
      emisores: config.emisores,
      incluirOcultos: config.incluirOcultos,
      conLogo: config.conLogo,
    })
    setConfig({ ...nueva, columnas: sanear(nueva.columnas) })
    toast.success('Plantilla aplicada', plantilla.nombre)
  }

  function guardarPlantilla() {
    const nombre = nombrePlantilla.trim()
    if (!nombre) return
    // Una plantilla guarda el DISEÑO (columnas, opciones, textos), nunca el
    // período ni las cuentas: esos son del momento y los pone quien exporta.
    // Van fuera con destructuring —no como `undefined`—, porque el spread de
    // `fusionarConfig` copiaría la clave igual y borraría el mes elegido.
    const { anio: _anio, mes: _mes, emisores: _emisores, incluirOcultos: _ocultos, ...diseno } = config
    const nueva: PlantillaFacturacion = {
      id: `propia-${Date.now()}`,
      nombre,
      descripcion: `${config.columnas.length} columnas · ${
        config.alcance === 'mes_completo' ? 'todo el mes' : 'días con facturación'
      }`,
      config: diseno,
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

  const secciones: Array<{ id: SeccionId; label: string; icono: typeof CalendarRange }> = [
    { id: 'periodo', label: 'Mes y cuentas', icono: CalendarRange },
    { id: 'columnas', label: 'Columnas', icono: Columns3 },
    { id: 'diseno', label: 'Diseño', icono: Palette },
    { id: 'excel', label: 'Opciones de Excel', icono: Settings2 },
    { id: 'archivo', label: 'Archivo', icono: Download },
  ]

  const cargando = isLoading || !alDia

  return (
    <Modal
      open={abierto}
      onClose={onCerrar}
      size="xl"
      className="sm:max-w-[74rem]"
      labelledBy="titulo-exportar-facturacion"
    >
      {/* Encabezado */}
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h2 id="titulo-exportar-facturacion" className="text-base font-semibold text-ink-900">
            Exportar facturación
          </h2>
          <p className="mt-0.5 truncate text-xs text-ink-500">
            {cargando
              ? 'Buscando lo facturado…'
              : `${num(dataset?.totales.cantidad ?? 0)} facturas · ${money0(
                  dataset?.totales.total ?? 0,
                )} · ${nombreMes(config.mes)} ${config.anio}`}{' '}
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
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:overflow-hidden xl:grid-cols-[13.5rem_minmax(0,1fr)_23rem]">
        {/* --- Rail --- */}
        <div className="shrink-0 border-b border-line px-3 py-3 lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <div className="rounded-xl border border-ink-950 bg-ink-950 px-3 py-2.5 text-on-ink">
            <span className="flex items-center gap-2.5">
              <FileSpreadsheet className="h-4 w-4 shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm font-medium">Excel</span>
                <span className="block truncate text-[0.65rem] leading-tight text-on-ink/70">
                  El formato de la planilla
                </span>
              </span>
            </span>
          </div>

          <div className="mt-3 space-y-0.5">
            {secciones.map((s) => {
              const activa = seccion === s.id
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSeccion(s.id)}
                  aria-current={activa}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors',
                    activa
                      ? 'bg-ink-100 font-medium text-ink-900'
                      : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900',
                  )}
                >
                  <s.icono className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 truncate">{s.label}</span>
                </button>
              )
            })}
          </div>

          {/* Plantillas */}
          <div className="mt-4 border-t border-line pt-3">
            <p className="mb-2 flex items-center gap-1.5 px-1 text-[0.6rem] font-semibold uppercase tracking-[0.08em] text-ink-400">
              <Sparkles className="h-3 w-3" /> Plantillas
            </p>
            <div className="space-y-1">
              {[...PLANTILLAS_FABRICA, ...plantillasPropias].map((p) => (
                <div key={p.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => usarPlantilla(p)}
                    title={p.descripcion}
                    className="flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left transition-colors hover:bg-ink-50"
                  >
                    <Bookmark className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-300" />
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium text-ink-800">
                        {p.nombre}
                      </span>
                      <span className="block truncate text-[0.65rem] leading-tight text-ink-400">
                        {p.descripcion}
                      </span>
                    </span>
                  </button>
                  {!p.deFabrica && (
                    <button
                      type="button"
                      onClick={() => borrarPlantilla(p.id)}
                      aria-label={`Borrar plantilla ${p.nombre}`}
                      className="absolute right-1.5 top-1.5 hidden rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900 group-hover:block"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
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
                  className="h-9"
                  autoFocus
                />
                <div className="flex gap-1.5">
                  <Button size="sm" className="flex-1" onClick={guardarPlantilla}>
                    Guardar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setGuardandoPlantilla(false)
                      setNombrePlantilla('')
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setGuardandoPlantilla(true)}
                className="mt-1.5 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-900"
              >
                <BookmarkPlus className="h-3.5 w-3.5 shrink-0" />
                Guardar esta configuración
              </button>
            )}
          </div>
        </div>

        {/* --- Contenido --- */}
        <div className="min-w-0 border-b border-line px-5 py-5 lg:overflow-y-auto lg:border-b-0 xl:border-r">
          {error ? (
            <div className="flex items-start gap-2.5 rounded-xl border border-line bg-ink-50 px-4 py-3 text-sm text-ink-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-ink-500" />
              <span>
                <strong className="text-ink-900">No se pudo traer la facturación del mes.</strong>{' '}
                {(error as Error).message}
              </span>
            </div>
          ) : null}

          {/* Avisos del dataset: la plata que queda fuera de las columnas. */}
          {dataset?.avisos.map((aviso, i) => (
            <div
              key={i}
              className={cn(
                'mb-4 flex items-start gap-2.5 rounded-xl border px-4 py-3 text-xs leading-relaxed',
                aviso.tono === 'alerta'
                  ? 'border-ink-950 bg-ink-50 text-ink-800'
                  : 'border-line bg-surface-2 text-ink-600',
              )}
            >
              {aviso.tono === 'alerta' ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-ink-700" />
              ) : (
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
              )}
              <span className="min-w-0">
                {aviso.texto}
                {aviso.columnasSugeridas?.length ? (
                  <button
                    type="button"
                    onClick={() => agregarMedios(aviso.columnasSugeridas!)}
                    className="ml-1.5 inline-flex items-center gap-1 rounded-lg border border-line-strong bg-surface px-2 py-0.5 text-[0.65rem] font-medium text-ink-700 transition-colors hover:border-ink-300 hover:bg-ink-50"
                  >
                    <Wand2 className="h-3 w-3" />
                    Agregar{' '}
                    {aviso.columnasSugeridas
                      .map((id) => definicionDe(id)?.label ?? id)
                      .join(' y ')}
                  </button>
                ) : null}
              </span>
            </div>
          ))}

          {seccion === 'periodo' && (
            <SeccionPeriodo
              config={config}
              emisores={emisores}
              resumen={alDia ? resumen : undefined}
              cargando={cargando}
              onCambio={actualizar}
            />
          )}
          {seccion === 'columnas' && (
            <SeccionColumnas config={config} onColumnas={setColumnas} />
          )}
          {seccion === 'diseno' && <SeccionDiseno config={config} onCambio={actualizar} />}
          {seccion === 'excel' && (
            <SeccionExcel config={config} dataset={dataset} onXlsx={actualizarXlsx} />
          )}
          {seccion === 'archivo' && (
            <SeccionArchivo config={config} nombre={nombreArchivo} onCambio={actualizar} />
          )}
        </div>

        {/* --- Vista previa --- */}
        <div className="min-w-0 bg-surface-2/60 px-4 py-5 lg:col-span-2 lg:overflow-y-auto xl:col-span-1">
          <p className="mb-2 text-[0.6rem] font-semibold uppercase tracking-[0.08em] text-ink-400">
            Así va a salir
          </p>
          {cargando ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-full" />
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>
          ) : dataset ? (
            <VistaPrevia dataset={dataset} nombre={nombreArchivo} />
          ) : null}
        </div>
      </div>

      {/* Pie */}
      <div className="flex shrink-0 flex-col gap-2.5 border-t border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-ink-400">
          {cargando
            ? 'Cargando…'
            : `${num(dataset?.filas.length ?? 0)} renglones · ${
                dataset?.columnas.length ?? 0
              } columnas${isFetching ? ' · actualizando…' : ''}`}
        </p>
        <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={exportar} disabled={ocupado || cargando || !dataset?.totales.cantidad}>
            <Download className="h-4 w-4" />
            {ocupado ? 'Generando…' : 'Descargar Excel'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/* ===================== Sección: Mes y cuentas ===================== */

function SeccionPeriodo({
  config,
  emisores,
  resumen,
  cargando,
  onCambio,
}: {
  config: ConfigFacturacion
  emisores: Array<{ id: number; nombre: string; condicion: string; activo: boolean }>
  resumen?: ResumenFacturacion
  cargando: boolean
  onCambio: (patch: Partial<ConfigFacturacion>) => void
}) {
  const hoy = new Date()
  const anios = Array.from({ length: 6 }, (_, i) => hoy.getFullYear() - i)
  const mesPasado = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)
  const esteMes = config.anio === hoy.getFullYear() && config.mes === hoy.getMonth() + 1
  const elMesPasado =
    config.anio === mesPasado.getFullYear() && config.mes === mesPasado.getMonth() + 1

  const toggleEmisor = (id: number) => {
    const actuales = config.emisores
    onCambio({
      emisores: actuales.includes(id) ? actuales.filter((x) => x !== id) : [...actuales, id],
    })
  }

  return (
    <div className="space-y-5">
      <Bloque titulo="Período" ayuda="El mes calendario que se exporta, del 1 al último día.">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={esteMes ? 'primary' : 'outline'}
            onClick={() => onCambio({ anio: hoy.getFullYear(), mes: hoy.getMonth() + 1 })}
          >
            Este mes
          </Button>
          <Button
            size="sm"
            variant={elMesPasado ? 'primary' : 'outline'}
            onClick={() =>
              onCambio({ anio: mesPasado.getFullYear(), mes: mesPasado.getMonth() + 1 })
            }
          >
            Mes pasado
          </Button>
        </div>
        <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
          <Campo etiqueta="Mes">
            <Select
              options={MESES.map((m, i) => ({ value: String(i + 1), label: capitalizar(m) }))}
              value={String(config.mes)}
              onChange={(v) => onCambio({ mes: Number(v) })}
            />
          </Campo>
          <Campo etiqueta="Año">
            <Select
              options={anios.map((a) => ({ value: String(a), label: String(a) }))}
              value={String(config.anio)}
              onChange={(v) => onCambio({ anio: Number(v) })}
            />
          </Campo>
        </div>
        {!cargando && resumen && (
          <p className="mt-2 text-xs text-ink-400">
            {resumen.totales.cantidad === 0
              ? 'No se emitieron facturas en este mes con estas cuentas.'
              : `${num(resumen.totales.cantidad)} facturas por ${money(resumen.totales.total)} · ` +
                `${num(resumen.dias.length)} ${resumen.dias.length === 1 ? 'día' : 'días'} con movimiento.`}
          </p>
        )}
      </Bloque>

      <Bloque
        titulo="Cuentas"
        ayuda="Qué cuentas entran en el archivo. Sin ninguna elegida, entran todas."
      >
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => onCambio({ emisores: [] })}
            aria-pressed={config.emisores.length === 0}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              config.emisores.length === 0
                ? 'border-ink-950 bg-ink-950 text-on-ink'
                : 'border-line-strong bg-surface text-ink-600 hover:border-ink-300 hover:bg-ink-50',
            )}
          >
            Todas
          </button>
          {emisores.map((e) => {
            const activa = config.emisores.includes(e.id)
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => toggleEmisor(e.id)}
                aria-pressed={activa}
                title={
                  e.condicion === 'responsable_inscripto'
                    ? 'Responsable Inscripto (Factura A/B)'
                    : 'Monotributo (Factura C)'
                }
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors',
                  activa
                    ? 'border-ink-950 bg-ink-950 text-on-ink'
                    : 'border-line-strong bg-surface text-ink-600 hover:border-ink-300 hover:bg-ink-50',
                  !e.activo && 'opacity-60',
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 shrink-0 rounded-full',
                    e.condicion === 'responsable_inscripto' ? 'bg-sky-500' : 'bg-emerald-500',
                  )}
                />
                <span className="max-w-[10rem] truncate">{e.nombre}</span>
              </button>
            )
          })}
        </div>
      </Bloque>

      <Bloque titulo="Renglones">
        <div className="grid gap-2 sm:grid-cols-2">
          <TarjetaOpcion
            activa={config.alcance === 'mes_completo'}
            onClick={() => onCambio({ alcance: 'mes_completo' })}
            titulo="Todo el mes"
            detalle="Un renglón por día, aunque no se haya facturado. Como la planilla de siempre."
          />
          <TarjetaOpcion
            activa={config.alcance === 'con_facturacion'}
            onClick={() => onCambio({ alcance: 'con_facturacion' })}
            titulo="Sólo días con facturas"
            detalle="Deja afuera los días vacíos. Más corto para revisar."
          />
        </div>
        <div className="mt-3">
          <Casilla
            etiqueta="Incluir comprobantes ocultados de la lista"
            ayuda="Se quitaron de Facturación, pero su CAE existe: fiscalmente se facturaron igual."
            valor={config.incluirOcultos}
            onChange={(v) => onCambio({ incluirOcultos: v })}
          />
        </div>
      </Bloque>
    </div>
  )
}

/* ===================== Sección: Columnas ===================== */

function SeccionColumnas({
  config,
  onColumnas,
}: {
  config: ConfigFacturacion
  onColumnas: (columnas: string[]) => void
}) {
  const [arrastrando, setArrastrando] = useState<string | null>(null)

  const activas = config.columnas
    .map((id) => ({ id, def: definicionDe(id) }))
    .filter((c): c is { id: string; def: NonNullable<ReturnType<typeof definicionDe>> } =>
      Boolean(c.def),
    )
  const enUso = new Set(activas.map((c) => c.id))

  const disponibles = FAMILIAS.map((familia) => ({
    familia,
    columnas: COLUMNAS.filter((c) => c.familia === familia.id && !enUso.has(c.id)),
  })).filter((f) => f.columnas.length)

  const mover = (desde: string, hasta: string) => {
    if (desde === hasta) return
    const lista = [...config.columnas]
    const i = lista.indexOf(desde)
    const j = lista.indexOf(hasta)
    if (i === -1 || j === -1) return
    lista.splice(i, 1)
    // Al sacar la columna que se arrastra, todo lo que estaba después se corre
    // un lugar: sin esta corrección, arrastrar hacia abajo la deja DESPUÉS del
    // destino y hacia arriba antes (el movimiento no coincide con lo que se ve).
    lista.splice(i < j ? j - 1 : j, 0, desde)
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

  // Las flechas se apagan cuando el movimiento no puede pasar: la Fecha va
  // siempre primera, así que nada la pisa ni ella baja. (Sin esto el botón se
  // vería habilitado y no haría nada: `sanear` la devuelve a su lugar.)
  const puedeSubir = (i: number) => i > 0 && !activas[i - 1].def.fija
  const puedeBajar = (i: number) => i < activas.length - 1 && !activas[i].def.fija

  return (
    <div className="space-y-5">
      <Bloque
        titulo={`Columnas activas · ${activas.length}`}
        ayuda="Arrastrá para cambiar el orden. La fecha va siempre primera."
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
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-[3px] ring-1 ring-black/10"
                style={{ background: colorChip(c.def.id, c.def.familia) }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-sm text-ink-800">{c.def.label}</span>
              {c.def.ayuda && (
                <span className="hidden truncate text-[0.65rem] text-ink-400 sm:block sm:max-w-[13rem]">
                  {c.def.ayuda}
                </span>
              )}
              <div className="flex shrink-0 items-center">
                <button
                  type="button"
                  onClick={() => desplazar(c.id, -1)}
                  disabled={!puedeSubir(i)}
                  aria-label={`Subir ${c.def.label}`}
                  className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-ink-50 hover:text-ink-800 disabled:pointer-events-none disabled:opacity-30"
                >
                  <ArrowUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => desplazar(c.id, 1)}
                  disabled={!puedeBajar(i)}
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
                  title={c.def.fija ? 'La fecha no se puede quitar' : undefined}
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
        <Bloque key={familia.id} titulo={familia.label} ayuda={familia.ayuda}>
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
  onCambio,
}: {
  config: ConfigFacturacion
  onCambio: (patch: Partial<ConfigFacturacion>) => void
}) {
  return (
    <div className="space-y-5">
      <Bloque titulo="Logo" ayuda="El logo de CelTuc arriba a la izquierda del archivo.">
        <div className="grid gap-2 sm:grid-cols-2">
          <TarjetaOpcion
            activa={config.conLogo}
            onClick={() => onCambio({ conLogo: true, banda: true })}
            titulo="Con logo"
            detalle="Encabezado con el logo, el mes y las cuentas. Para presentar o imprimir."
          />
          <TarjetaOpcion
            activa={!config.conLogo}
            onClick={() => onCambio({ conLogo: false })}
            titulo="Sin logo"
            detalle="Sale la planilla sola, sin la marca."
          />
        </div>
      </Bloque>

      <Bloque titulo="Encabezado">
        <div className="grid gap-2 sm:grid-cols-2">
          <TarjetaOpcion
            activa={config.banda}
            onClick={() => onCambio({ banda: true })}
            titulo="Con encabezado"
            detalle="Título, mes, cuentas y quién lo generó, arriba de la tabla."
          />
          <TarjetaOpcion
            activa={!config.banda}
            onClick={() => onCambio({ banda: false, conLogo: false })}
            titulo="Sólo la tabla"
            detalle="Arranca en la celda A1, calcado a la planilla: ideal para pegar en otra."
          />
        </div>
      </Bloque>

      {config.banda && (
        <Bloque titulo="Textos del encabezado">
          <div className="space-y-2.5">
            <Campo etiqueta="Título">
              <Input
                value={config.titulo}
                onChange={(e) => onCambio({ titulo: e.target.value })}
                placeholder="Facturación"
              />
            </Campo>
            <Campo etiqueta="Subtítulo (opcional)">
              <Input
                value={config.subtitulo}
                onChange={(e) => onCambio({ subtitulo: e.target.value })}
                placeholder="Facturas electrónicas emitidas con CAE"
              />
            </Campo>
          </div>
        </Bloque>
      )}
    </div>
  )
}

/* ===================== Sección: Opciones de Excel ===================== */

function SeccionExcel({
  config,
  dataset,
  onXlsx,
}: {
  config: ConfigFacturacion
  dataset: DatasetFacturacion | null
  onXlsx: (patch: Partial<ConfigFacturacion['xlsx']>) => void
}) {
  const op = config.xlsx
  const conIndice = config.columnas.includes('indice')

  return (
    <div className="space-y-5">
      <Bloque titulo="Fórmulas">
        <div className="space-y-2">
          <Casilla
            etiqueta="Fórmulas vivas (TOTAL e ÍNDICE)"
            ayuda="Se edita un importe en el Excel y el total y el índice se recalculan solos."
            valor={op.formulas}
            onChange={(v) => onXlsx({ formulas: v })}
          />
          {op.formulas && dataset && !dataset.totalCubierto && (
            <p className="flex items-start gap-2 rounded-xl bg-ink-50 px-3 py-2 text-[0.7rem] leading-relaxed text-ink-600">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
              El TOTAL va a salir con su valor real (no como suma de columnas): las columnas de
              medios elegidas no cubren toda la plata del mes. El ÍNDICE sí lleva su fórmula.
            </p>
          )}
          <Casilla
            etiqueta="Fila TOTAL al pie"
            ayuda="Cierra la planilla con la suma del mes."
            valor={op.totalGeneral}
            onChange={(v) => onXlsx({ totalGeneral: v })}
          />
        </div>
      </Bloque>

      <Bloque
        titulo="Índice del día"
        ayuda="GANANCIA arriba de la meta, PERDIDA de la meta para abajo (con algo facturado)."
      >
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Campo etiqueta="Meta diaria">
            <Input
              type="number"
              min={0}
              step={1000}
              value={op.metaDiaria}
              onChange={(e) => onXlsx({ metaDiaria: Math.max(0, Number(e.target.value) || 0) })}
            />
          </Campo>
          <div className="flex items-end pb-1">
            <p className="text-xs text-ink-400">
              Hoy: {money0(op.metaDiaria)} por día.
              {!conIndice && ' (Agregá la columna ÍNDICE para verlo.)'}
            </p>
          </div>
        </div>
        <div className="mt-2.5">
          <Casilla
            etiqueta="Pintar el índice (verde / rojo)"
            ayuda="Formato condicional nativo: el color se actualiza si se edita el Excel."
            valor={op.resaltarIndice}
            onChange={(v) => onXlsx({ resaltarIndice: v })}
          />
        </div>
      </Bloque>

      <Bloque titulo="Lectura">
        <div className="grid gap-1.5 sm:grid-cols-2">
          <Casilla
            etiqueta="Congelar los títulos"
            ayuda="La fila de títulos queda fija al scrollear."
            valor={op.congelar}
            onChange={(v) => onXlsx({ congelar: v })}
          />
          <Casilla
            etiqueta="Filtros en los títulos"
            ayuda="Las flechitas para ordenar y filtrar."
            valor={op.autofiltro}
            onChange={(v) => onXlsx({ autofiltro: v })}
          />
          <Casilla
            etiqueta="Sombrear fines de semana"
            ayuda="Sábados y domingos, apenas grises."
            valor={op.finesDeSemana}
            onChange={(v) => onXlsx({ finesDeSemana: v })}
          />
        </div>
      </Bloque>

      <Bloque titulo="Hojas del libro">
        <div className="space-y-1.5">
          <Casilla
            etiqueta="Por cuenta (CUIT)"
            ayuda="Una fila por cuenta con lo que entró por efectivo, transferencia, financiera y tarjeta."
            valor={op.hojaCuentas}
            onChange={(v) => onXlsx({ hojaCuentas: v })}
          />
          <Casilla
            etiqueta="Comprobantes"
            ayuda="Una fila por factura: número, CUIT, cliente, medio, total, estado y CAE."
            valor={op.hojaComprobantes}
            onChange={(v) => onXlsx({ hojaComprobantes: v })}
          />
          <Casilla
            etiqueta="Cómo se generó"
            ayuda="Los filtros, las cuentas y quién exportó. Trazabilidad."
            valor={op.hojaComoSeGenero}
            onChange={(v) => onXlsx({ hojaComoSeGenero: v })}
          />
        </div>
      </Bloque>
    </div>
  )
}

/* ===================== Sección: Archivo ===================== */

function SeccionArchivo({
  config,
  nombre,
  onCambio,
}: {
  config: ConfigFacturacion
  nombre: string
  onCambio: (patch: Partial<ConfigFacturacion>) => void
}) {
  return (
    <div className="space-y-5">
      <Bloque titulo="Nombre del archivo" ayuda="Tocá un token para insertarlo.">
        <Input
          value={config.nombreArchivo}
          onChange={(e) => onCambio({ nombreArchivo: e.target.value })}
          placeholder="facturacion-{mes}-{anio}"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {TOKENS_NOMBRE.map(([token, que]) => (
            <button
              key={token}
              type="button"
              title={que}
              onClick={() => onCambio({ nombreArchivo: `${config.nombreArchivo}${token}` })}
              className="rounded-full border border-line-strong bg-surface px-2.5 py-1 text-[0.7rem] text-ink-600 transition-colors hover:border-ink-300 hover:bg-ink-50 hover:text-ink-900"
            >
              {token}
            </button>
          ))}
        </div>
        <p className="mt-2.5 truncate rounded-xl bg-ink-50 px-3 py-2 text-xs text-ink-600">
          {nombre}
        </p>
      </Bloque>
    </div>
  )
}

/* ===================== Vista previa ===================== */

/** Los mismos colores del Excel, para que la vista previa no mienta. */
const COLOR = {
  gris: '#D8D8D8',
  azul: '#0070C0',
  verde: '#92D050',
  rojo: '#FF0000',
  finDeSemana: '#F4F4F6',
}

/** El fondo del TÍTULO de la columna en el Excel (espeja `fondoTitulo` de xlsx.ts). */
function colorTitulo(id: string, familia: FamiliaColumna): string {
  if (id === 'indice') return COLOR.rojo
  return familia === 'medios' ? COLOR.azul : COLOR.gris
}

/** El cuadradito que identifica la columna en el selector: suma el verde del TOTAL. */
function colorChip(id: string, familia: FamiliaColumna): string {
  if (id === 'total') return COLOR.verde
  return colorTitulo(id, familia)
}

const FILAS_PREVIEW = 12

function VistaPrevia({ dataset, nombre }: { dataset: DatasetFacturacion; nombre: string }) {
  const { columnas, filas, config, meta } = dataset
  // Con la fórmula puesta, el TOTAL de un día sin facturar muestra «$ -» (la
  // fórmula da 0) — igual que en la planilla de siempre. Sin fórmula, la celda
  // queda vacía. La vista previa tiene que decir lo mismo que el archivo.
  const conFormulaTotal = config.xlsx.formulas && dataset.totalCubierto
  // Se muestran los primeros días con movimiento (o los primeros del mes si el
  // mes está vacío): es lo que deja ver de un vistazo que los números están.
  const conDatos = filas.filter((f) => !f.vacio)
  const muestra = (conDatos.length ? conDatos : filas).slice(0, FILAS_PREVIEW)
  const restantes = filas.length - muestra.length

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-line bg-white shadow-sm">
        {config.banda && (
          <div className="flex items-center gap-2.5 border-b border-line px-3 py-2.5">
            {dataset.logo && (
              <img src={dataset.logo} alt="" className="h-7 w-7 shrink-0 rounded object-contain" />
            )}
            <div className="min-w-0">
              <p className="truncate text-[0.7rem] font-bold leading-tight text-neutral-900">
                {meta.titulo}
              </p>
              <p className="truncate text-[0.6rem] leading-tight text-neutral-500">
                {[meta.periodo, meta.subtitulo, meta.cuentasTexto].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[0.6rem]">
            <thead>
              <tr>
                {columnas.map((c) => (
                  <th
                    key={c.id}
                    className="whitespace-nowrap border border-neutral-400 px-1.5 py-1 text-center font-bold text-neutral-900"
                    style={{ background: colorTitulo(c.id, c.familia) }}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {muestra.map((fila) => (
                <tr key={fila.fecha}>
                  {columnas.map((c) => {
                    const esTotal = c.id === 'total'
                    const esIndice = c.id === 'indice'
                    const indice = esIndice ? indiceTexto(fila.total, config.xlsx.metaDiaria) : null
                    const fondo = esTotal
                      ? COLOR.verde
                      : esIndice && config.xlsx.resaltarIndice && indice
                        ? indice === 'GANANCIA'
                          ? COLOR.verde
                          : COLOR.rojo
                        : config.xlsx.finesDeSemana && fila.finDeSemana
                          ? COLOR.finDeSemana
                          : undefined
                    return (
                      <td
                        key={c.id}
                        className={cn(
                          'whitespace-nowrap border border-neutral-300 px-1.5 py-1 text-neutral-800',
                          c.align === 'right'
                            ? 'text-right tabular-nums'
                            : c.align === 'center'
                              ? 'text-center'
                              : 'text-left',
                          esIndice && indice === 'PERDIDA' && config.xlsx.resaltarIndice
                            ? 'font-bold text-white'
                            : esIndice && indice
                              ? 'font-bold'
                              : '',
                        )}
                        style={fondo ? { background: fondo } : undefined}
                      >
                        {celdaPreview(c, fila, config.xlsx.metaDiaria, conFormulaTotal)}
                      </td>
                    )
                  })}
                </tr>
              ))}
              {config.xlsx.totalGeneral && filas.length > 0 && (
                <tr>
                  {columnas.map((c, i) => (
                    <td
                      key={c.id}
                      className={cn(
                        'whitespace-nowrap border-2 border-b border-l border-r border-t-neutral-800 border-neutral-300 bg-neutral-100 px-1.5 py-1 font-bold text-neutral-900',
                        c.align === 'right' ? 'text-right tabular-nums' : 'text-center',
                      )}
                    >
                      {i === 0
                        ? `TOTAL ${nombreMes(config.mes)}`
                        : c.tipo === 'ars'
                          ? money0(totalDeColumna(dataset, c.id))
                          : c.tipo === 'entero'
                            ? num(totalDeColumna(dataset, c.id))
                            : ''}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-1 text-[0.65rem] leading-relaxed text-ink-400">
        {restantes > 0 && (
          <p>
            + {num(restantes)} {restantes === 1 ? 'renglón más' : 'renglones más'} en el archivo.
          </p>
        )}
        <p>
          Hojas: Facturación
          {config.xlsx.hojaCuentas && dataset.porCuenta.length ? ' · Por cuenta' : ''}
          {config.xlsx.hojaComprobantes ? ' · Comprobantes' : ''}
          {config.xlsx.hojaComoSeGenero ? ' · Cómo se generó' : ''}
        </p>
        <p className="truncate">{nombre}</p>
      </div>

      {/* Cada cuenta con lo suyo: es la hoja «Por cuenta» del archivo. */}
      {config.xlsx.hojaCuentas && dataset.porCuenta.length > 0 && (
        <div className="rounded-xl border border-line bg-surface p-3">
          <p className="mb-2 text-[0.6rem] font-semibold uppercase tracking-[0.08em] text-ink-400">
            Por cuenta (CUIT)
          </p>
          <ul className="space-y-2">
            {dataset.porCuenta.map((cuenta) => {
              const medios = (Object.keys(MEDIO_LABEL) as Array<keyof typeof MEDIO_LABEL>)
                .filter((medio) => (cuenta.porMedio[medio] ?? 0) > 0)
              return (
                <li key={cuenta.emisor} className="border-b border-line pb-2 last:border-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-[0.7rem] font-medium text-ink-800">
                      {cuenta.nombre}
                    </span>
                    <span className="tnum shrink-0 text-[0.7rem] font-semibold text-ink-900">
                      {money0(cuenta.total)}
                    </span>
                  </div>
                  <p className="tnum text-[0.6rem] text-ink-400">
                    CUIT {cuenta.cuit} · {num(cuenta.cantidad)}{' '}
                    {cuenta.cantidad === 1 ? 'factura' : 'facturas'}
                  </p>
                  <p className="mt-0.5 text-[0.6rem] leading-snug text-ink-500">
                    {medios.length
                      ? medios
                          .map((medio) => `${MEDIO_LABEL[medio]} ${money0(cuenta.porMedio[medio] ?? 0)}`)
                          .join(' · ')
                      : 'Sin medios informados'}
                  </p>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* Reparto del mes por medio: el resumen que se lleva el archivo. */}
      <div className="rounded-xl border border-line bg-surface p-3">
        <p className="mb-2 text-[0.6rem] font-semibold uppercase tracking-[0.08em] text-ink-400">
          El mes por medio de cobro
        </p>
        <ul className="space-y-1.5">
          {(Object.keys(MEDIO_LABEL) as Array<keyof typeof MEDIO_LABEL>)
            .filter((medio) => (dataset.totales.porMedio[medio] ?? 0) > 0)
            .map((medio) => {
              const valor = dataset.totales.porMedio[medio] ?? 0
              const pct = dataset.totales.total ? (valor / dataset.totales.total) * 100 : 0
              return (
                <li key={medio}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-[0.7rem] text-ink-600">
                      {MEDIO_LABEL[medio]}
                    </span>
                    <span className="tnum shrink-0 text-[0.7rem] font-semibold text-ink-900">
                      {money0(valor)}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100">
                    <div
                      className="h-full rounded-full bg-ink-900"
                      style={{ width: `${Math.max(2, Math.round(pct))}%` }}
                    />
                  </div>
                </li>
              )
            })}
          {dataset.totales.total === 0 && (
            <li className="text-[0.7rem] text-ink-400">Sin facturación en el mes.</li>
          )}
        </ul>
      </div>
    </div>
  )
}

function indiceTexto(total: number, meta: number): 'GANANCIA' | 'PERDIDA' | null {
  if (total > meta) return 'GANANCIA'
  if (total > 0) return 'PERDIDA'
  return null
}

/** Cómo se ve una celda en la vista previa (con el mismo criterio del Excel). */
function celdaPreview(
  columna: DatasetFacturacion['columnas'][number],
  fila: DatasetFacturacion['filas'][number],
  meta: number,
  conFormulaTotal: boolean,
): string {
  // El ÍNDICE lleva fórmula siempre que haya TOTAL: muestra 0 en los días sin nada.
  if (columna.id === 'indice') return indiceTexto(fila.total, meta) ?? '0'
  if (columna.tipo === 'blanco') return ''
  const valor = columna.valor(fila)
  if (valor === null) return ''
  if (valor instanceof Date) {
    return valor.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }
  if (typeof valor === 'number') {
    // El TOTAL con fórmula existe aunque el día esté vacío (da 0 → «$ -»); las
    // columnas de importes, en cambio, quedan en blanco para anotar a mano.
    if (fila.vacio) return columna.id === 'total' && conFormulaTotal ? '$ -' : ''
    if (columna.tipo === 'ars') return valor === 0 ? '$ -' : money0(valor)
    return num(valor)
  }
  return String(valor)
}

function totalDeColumna(dataset: DatasetFacturacion, id: string): number {
  const columna = dataset.columnas.find((c) => c.id === id)
  if (!columna) return 0
  return dataset.filas.reduce((acc, fila) => {
    const valor = columna.valor(fila)
    return acc + (typeof valor === 'number' ? valor : 0)
  }, 0)
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

/** Saca ids que ya no existen, repetidos, y garantiza la fecha primera. */
function sanear(columnas: string[]): string[] {
  const vistas = new Set<string>()
  const limpias = columnas.filter((id) => {
    if (vistas.has(id) || !definicionDe(id)) return false
    vistas.add(id)
    return true
  })
  const sinFecha = limpias.filter((id) => id !== 'fecha')
  return ['fecha', ...sinFecha]
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
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
