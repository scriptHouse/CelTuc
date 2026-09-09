import { useEffect, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Info,
  ListPlus,
  Loader2,
  PencilLine,
  FileSpreadsheet,
  Search,
  SlidersHorizontal,
  Sparkles,
  Tag,
  X,
} from 'lucide-react'
import {
  analizarListaService,
  aplicarListaService,
  type AnalisisImportacionService,
  type CampoColumnaService,
  type ColumnasImportacionService,
  type EstadoFilaService,
  type FilaImportacionService,
  type ItemImportacionServiceInput,
  type OpcionImportacionService,
  type ResultadoImportacionService,
  type ResumenImportacionService,
} from '@/services/preciosService'
import { ApiError, textoDeError } from '@/lib/api'
import { money0, num, usd } from '@/lib/format'
import { cn, coincideBusqueda } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ToastProvider'
import {
  Aviso,
  PieModal,
  Procesando,
  RielImportacion,
  Tarjeta,
  ZonaArchivo,
} from '@/components/importar/piezas'

/**
 * Importar la lista de precios del taller: el MISMO archivo que baja
 * «Exportar» vuelve a entrar por acá.
 *
 * Tres actos: subir el Excel → procesar → revisar fila por fila el antes y el
 * después, y aplicar solo lo que se marca. Hasta que no se aprieta «Aplicar»
 * no se toca un precio.
 *
 * La regla que ordena todo: **el precio en dólares manda**. Los pesos los
 * calcula el sistema con el dólar del negocio, así que no se importan (si no,
 * quedarían congelados y dejarían de seguir la cotización). La excepción es la
 * fila que no trae dólares: ahí los pesos son el único precio que hay.
 */

type Paso = 'archivo' | 'procesando' | 'revision' | 'listo'

const PASOS = [
  { id: 'archivo', label: 'Archivo' },
  { id: 'revision', label: 'Revisión' },
  { id: 'listo', label: 'Listo' },
]

const ESTADO_INFO: Record<
  EstadoFilaService,
  { label: string; clase: string; ayuda: string }
> = {
  actualiza: {
    label: 'Cambia',
    clase: 'bg-ink-900 text-on-ink',
    ayuda: 'La planilla trae un precio distinto del que hay hoy.',
  },
  igual: {
    label: 'Sin cambios',
    clase: 'bg-ink-100 text-ink-500',
    ayuda: 'Ya tiene exactamente ese precio: no hay nada que hacer.',
  },
  nueva: {
    label: 'Nuevo',
    clase: 'border border-ink-900 text-ink-900',
    ayuda: 'No está en la lista. Marcalo para darlo de alta.',
  },
  revisar: {
    label: 'Revisar',
    clase: 'border border-line-strong text-ink-600',
    ayuda: 'Hay más de un lugar posible para este precio: elegí cuál.',
  },
  sin_valor: {
    label: 'Sin precio',
    clase: 'bg-ink-50 text-ink-400',
    ayuda: 'La planilla no informó ningún precio, así que no se toca nada.',
  },
}

type FiltroId = 'cambios' | 'nuevas' | 'revisar' | 'igual' | 'fuera' | 'todas'

const FILTROS: Array<{ id: FiltroId; label: string }> = [
  { id: 'cambios', label: 'Cambian' },
  { id: 'nuevas', label: 'Nuevos' },
  { id: 'revisar', label: 'A revisar' },
  { id: 'igual', label: 'Sin cambios' },
  { id: 'fuera', label: 'Sin precio' },
  { id: 'todas', label: 'Todas' },
]

/** Cuántas filas se pintan de una: el resto entra con «Ver más». */
const PAGINA = 120

/**
 * Qué precios se aplican. TODO PRENDIDO (menos los pesos) es la importación
 * normal; «Opciones avanzadas» solo sirve para dejar algo afuera.
 */
interface Opciones {
  lista_usd: boolean
  cash_usd: boolean
  pesos: boolean
  altas: boolean
}

const NORMAL: Opciones = { lista_usd: true, cash_usd: true, pesos: false, altas: true }

/** Qué campo del payload escribe cada opción. */
const CAMPOS_DE: Record<keyof Opciones, string[]> = {
  lista_usd: ['precio_lista_usd'],
  cash_usd: ['precio_cash_usd'],
  pesos: ['precio_lista_ars', 'precio_cash_ars'],
  altas: [],
}

const DATOS: Array<{ id: keyof Opciones; label: string; ayuda: string; relee?: boolean }> = [
  {
    id: 'lista_usd',
    label: 'Precio de lista USD',
    ayuda: 'El precio del que sale todo lo demás. Es lo que normalmente se importa.',
  },
  {
    id: 'cash_usd',
    label: 'Cash USD',
    ayuda: 'Solo se guarda si no coincide con el descuento de su sección.',
  },
  {
    id: 'pesos',
    label: 'Precios en pesos',
    ayuda:
      'Los calcula el sistema con el dólar del negocio. Prendelo solo para dejarlos fijos: ' +
      'dejan de seguir la cotización. (Las filas sin precio en dólares los importan igual.)',
    relee: true,
  },
  {
    id: 'altas',
    label: 'Dar de alta ítems nuevos',
    ayuda: 'Las filas de la planilla que todavía no están en la lista.',
  },
]

/** De qué columna del Excel sale cada dato. */
const COLUMNAS: Array<{ id: CampoColumnaService; label: string; obligatoria?: boolean }> = [
  { id: 'etiqueta', label: 'Ítem', obligatoria: true },
  { id: 'seccion', label: 'Sección' },
  { id: 'variante', label: 'Variante / calidad' },
  { id: 'lista_usd', label: 'Lista USD' },
  { id: 'cash_usd', label: 'Cash USD' },
  { id: 'lista_ars', label: 'Lista $' },
  { id: 'cash_ars', label: 'Cash $' },
]

/** Lo que decidió quien revisa para cada fila (se guarda por número de fila). */
interface Decision {
  marcada: boolean
  /** La opción elegida a mano cuando la fila tenía más de una. */
  opcion: string | null
}

/**
 * El error de aplicar, con el número de fila cuando el servidor rechaza un ítem
 * puntual (DRF los devuelve por posición dentro de `items`).
 */
function detalleDelError(error: ApiError, filasEnviadas: number[]): string | undefined {
  const cuerpo = error.data as { items?: unknown } | null
  const items = cuerpo && typeof cuerpo === 'object' && Array.isArray(cuerpo.items)
    ? cuerpo.items
    : null
  if (items) {
    const indice = items.findIndex((item) => textoDeError(item) !== null)
    const texto = indice >= 0 ? textoDeError(items[indice]) : null
    const fila = filasEnviadas[indice]
    if (texto && fila && typeof items[indice] !== 'string') {
      return `Fila ${fila} de la planilla: ${texto}`
    }
    if (texto) return texto
  }
  return error.message || undefined
}

export function ImportarListaModal({
  abierto,
  onCerrar,
  onAplicado,
}: {
  abierto: boolean
  onCerrar: () => void
  onAplicado: (resultado: ResultadoImportacionService) => void
}) {
  const toast = useToast()

  const [paso, setPaso] = useState<Paso>('archivo')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [analisis, setAnalisis] = useState<AnalisisImportacionService | null>(null)
  const [decisiones, setDecisiones] = useState<Record<number, Decision>>({})
  const [filtro, setFiltro] = useState<FiltroId>('cambios')
  const [busqueda, setBusqueda] = useState('')
  const [visibles, setVisibles] = useState(PAGINA)
  const [resultado, setResultado] = useState<ResultadoImportacionService | null>(null)
  const [avance, setAvance] = useState(0)
  const [opciones, setOpciones] = useState<Opciones>(NORMAL)
  const [columnas, setColumnas] = useState<Record<CampoColumnaService, number | null> | null>(null)
  const [avanzadas, setAvanzadas] = useState(false)
  const [enviadas, setEnviadas] = useState<number[]>([])

  // Cada apertura arranca de cero: importar es una operación puntual y quedarse
  // con el análisis de la vez anterior sería peligroso.
  useEffect(() => {
    if (!abierto) return
    setPaso('archivo')
    setArchivo(null)
    setAnalisis(null)
    setDecisiones({})
    setFiltro('cambios')
    setBusqueda('')
    setVisibles(PAGINA)
    setResultado(null)
    setAvance(0)
    setOpciones(NORMAL)
    setColumnas(null)
    setAvanzadas(false)
  }, [abierto])

  // --- Análisis ---------------------------------------------------------------

  const analizar = useMutation({
    // Lo que puede cambiar el diff viaja como argumento (y no desde el estado)
    // porque al corregirlo hay que releer la planilla EN EL ACTO.
    mutationFn: (entrada: {
      columnas: Record<CampoColumnaService, number | null> | null
      conPesos: boolean
    }) =>
      analizarListaService({
        archivo: archivo!,
        conPesos: entrada.conPesos,
        columnas: entrada.columnas,
      }),
    onSuccess: (data, entrada) => {
      const iniciales: Record<number, Decision> = {}
      for (const fila of data.filas) {
        iniciales[fila.fila] = { marcada: fila.sugerido, opcion: fila.elegida }
      }
      setDecisiones(iniciales)
      setAnalisis(data)
      setColumnas(entrada.columnas)
      setAvance(100)
      setTimeout(() => setPaso('revision'), 350)
    },
    onError: (e) => {
      // Si se estaba releyendo desde la revisión, se queda ahí con el análisis
      // anterior: no se pierde lo que ya estaba marcado.
      if (paso === 'procesando') {
        setPaso('archivo')
        setAvance(0)
      }
      toast.error('No se pudo leer la lista', e instanceof ApiError ? e.message : undefined)
    },
  })

  // Barra de progreso "honesta": avanza sola hasta 90 % mientras el servidor
  // trabaja y solo llega a 100 % cuando la respuesta llegó de verdad.
  useEffect(() => {
    if (paso !== 'procesando' || !analizar.isPending) return
    const id = setInterval(() => setAvance((a) => (a < 90 ? a + Math.max(1, (90 - a) / 8) : a)), 180)
    return () => clearInterval(id)
  }, [paso, analizar.isPending])

  function tomarArchivo(elegido: File | null | undefined) {
    if (!elegido) return
    if (!elegido.name.toLowerCase().endsWith('.xlsx')) {
      toast.error('Ese archivo no sirve', 'Tiene que ser un Excel .xlsx (Archivo → Guardar como).')
      return
    }
    setArchivo(elegido)
  }

  function empezarAnalisis() {
    if (!archivo) return
    setAvance(6)
    setPaso('procesando')
    analizar.mutate({ columnas, conPesos: opciones.pesos })
  }

  /** Cambia algo que el servidor tiene que recalcular: relee la planilla. */
  function releer(
    nuevas: Record<CampoColumnaService, number | null> | null,
    conPesos = opciones.pesos,
  ) {
    if (!analisis) return
    analizar.mutate({ columnas: nuevas, conPesos })
  }

  function cambiarOpciones(nuevas: Opciones) {
    setOpciones(nuevas)
    // Los pesos cambian el diff (son un valor derivado), así que se relee.
    if (nuevas.pesos !== opciones.pesos) releer(columnas, nuevas.pesos)
  }

  // --- Filas ------------------------------------------------------------------

  const filas = analisis?.filas ?? []

  function opcionDe(fila: FilaImportacionService): OpcionImportacionService | null {
    const clave = decisiones[fila.fila]?.opcion ?? fila.elegida
    return fila.opciones.find((o) => o.clave === clave) ?? null
  }

  /** Los precios que esta fila escribiría con las opciones de ahora. */
  function precioDeFila(fila: FilaImportacionService): Record<string, string | null> | null {
    const opcion = opcionDe(fila)
    const cambio = opcion?.precio.aplicar
    if (!cambio) return null
    const permitidos = new Set(
      (Object.keys(CAMPOS_DE) as Array<keyof Opciones>)
        .filter((id) => opciones[id])
        .flatMap((id) => CAMPOS_DE[id]),
    )
    const salida = Object.fromEntries(
      Object.entries(cambio).filter(([campo]) => permitidos.has(campo)),
    )
    return Object.keys(salida).length > 0 ? salida : null
  }

  /** El estado REAL de una fila: «revisar» se resuelve al elegir el destino. */
  function estadoDe(fila: FilaImportacionService): EstadoFilaService {
    if (fila.estado !== 'revisar') return fila.estado
    const opcion = opcionDe(fila)
    if (!opcion) return 'revisar'
    if (opcion.item === null) return 'nueva'
    return opcion.precio.cambia ? 'actualiza' : 'igual'
  }

  /** Si la fila puede aplicarse tal como está decidida ahora. */
  function aplicable(fila: FilaImportacionService): boolean {
    const opcion = opcionDe(fila)
    if (!opcion) return false
    if (opcion.item === null && !opciones.altas) return false
    return precioDeFila(fila) !== null
  }

  function cambiarDecision(fila: FilaImportacionService, cambio: Partial<Decision>) {
    setDecisiones((prev) => ({
      ...prev,
      [fila.fila]: {
        marcada: prev[fila.fila]?.marcada ?? false,
        opcion: prev[fila.fila]?.opcion ?? fila.elegida,
        ...cambio,
      },
    }))
  }

  const listadas = useMemo(() => {
    const termino = busqueda.trim()
    return filas.filter((fila) => {
      if (termino) {
        const opcion = opcionDe(fila)
        const texto = `${fila.etiqueta} ${fila.seccion} ${fila.variante} ${opcion?.item_nombre ?? ''} ${opcion?.seccion_nombre ?? ''}`
        if (!coincideBusqueda(texto, termino)) return false
      }
      const estado = estadoDe(fila)
      switch (filtro) {
        case 'cambios':
          return estado === 'actualiza' || estado === 'nueva'
        case 'nuevas':
          return estado === 'nueva'
        case 'revisar':
          return estado === 'revisar' || fila.duplicada_con.length > 0
        case 'igual':
          return estado === 'igual'
        case 'fuera':
          return estado === 'sin_valor'
        default:
          return true
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, filtro, busqueda, decisiones, opciones])

  useEffect(() => setVisibles(PAGINA), [filtro, busqueda])

  const marcadas = useMemo(
    () => filas.filter((f) => decisiones[f.fila]?.marcada && aplicable(f)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filas, decisiones, opciones],
  )

  const conteos = useMemo(() => {
    const c = { cambios: 0, nuevas: 0, revisar: 0, igual: 0, fuera: 0, todas: filas.length }
    for (const fila of filas) {
      const estado = estadoDe(fila)
      if (estado === 'actualiza' || estado === 'nueva') c.cambios += 1
      if (estado === 'nueva') c.nuevas += 1
      if (estado === 'revisar' || fila.duplicada_con.length > 0) c.revisar += 1
      if (estado === 'igual') c.igual += 1
      if (estado === 'sin_valor') c.fuera += 1
    }
    return c
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, decisiones, opciones])

  /**
   * Dos filas marcadas contra el MISMO precio: aplicarlas a las dos dejaría el
   * valor de la última, en silencio. Se avisa acá (el backend igual lo rechaza).
   */
  const conflictos = useMemo(() => {
    const porDestino = new Map<string, FilaImportacionService[]>()
    for (const fila of marcadas) {
      const opcion = opcionDe(fila)
      if (!opcion || opcion.item === null) continue
      const clave = `${opcion.item}:${opcion.variante}`
      porDestino.set(clave, [...(porDestino.get(clave) ?? []), fila])
    }
    return [...porDestino.values()].filter((g) => g.length > 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marcadas, decisiones])

  const impacto = useMemo(() => {
    let altas = 0
    for (const fila of marcadas) {
      if (opcionDe(fila)?.item === null) altas += 1
    }
    return { altas }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marcadas, decisiones])

  // --- Aplicar ----------------------------------------------------------------

  const aplicar = useMutation({
    mutationFn: () => {
      const items: ItemImportacionServiceInput[] = []
      for (const fila of marcadas) {
        const opcion = opcionDe(fila)!
        const precios = precioDeFila(fila)!
        const base: ItemImportacionServiceInput = {
          fila: fila.fila,
          variante: opcion.variante,
          ...precios,
        }
        if (opcion.item !== null) items.push({ ...base, item: opcion.item })
        else {
          items.push({
            ...base,
            crear: { seccion: opcion.seccion!, etiqueta: fila.etiqueta },
          })
        }
      }
      setEnviadas(items.map((i) => i.fila ?? 0))
      return aplicarListaService({ items })
    },
    onSuccess: (data) => {
      setResultado(data)
      setPaso('listo')
      onAplicado(data)
    },
    onError: (e) =>
      toast.error(
        'No se pudo importar',
        e instanceof ApiError ? detalleDelError(e, enviadas) : undefined,
      ),
  })

  // --- Marcar en bloque -------------------------------------------------------

  function marcarListadas(marcada: boolean) {
    setDecisiones((prev) => {
      const siguiente = { ...prev }
      const tomados = new Set<string>()
      if (marcada) {
        for (const fila of filas) {
          const opcion = opcionDe(fila)
          if (siguiente[fila.fila]?.marcada && opcion && opcion.item !== null) {
            tomados.add(`${opcion.item}:${opcion.variante}`)
          }
        }
      }
      for (const fila of listadas) {
        if (!marcada) {
          siguiente[fila.fila] = {
            marcada: false,
            opcion: siguiente[fila.fila]?.opcion ?? fila.elegida,
          }
          continue
        }
        if (!aplicable(fila)) continue
        const opcion = opcionDe(fila)!
        if (opcion.item !== null) {
          const clave = `${opcion.item}:${opcion.variante}`
          // Marcar en bloque nunca deja dos filas peleando por el mismo precio.
          if (tomados.has(clave)) continue
          tomados.add(clave)
        }
        siguiente[fila.fila] = { marcada: true, opcion: opcion.clave }
      }
      return siguiente
    })
  }

  const resumen = analisis?.resumen
  const pasoRiel = paso === 'procesando' ? 1 : PASOS.findIndex((p) => p.id === paso)

  const titulos: Record<Paso, { titulo: string; sub: string }> = {
    archivo: {
      titulo: 'Importar lista de precios',
      sub: 'El mismo archivo que baja «Exportar» vuelve a entrar por acá.',
    },
    procesando: { titulo: 'Leyendo la lista', sub: 'Todavía no se guardó nada.' },
    revision: {
      titulo: 'Revisá antes de aplicar',
      sub: `${analisis?.archivo ?? ''} · ${num(filas.length)} filas leídas`,
    },
    listo: { titulo: 'Importación aplicada', sub: 'Los precios ya están al día.' },
  }

  return (
    <Modal
      open={abierto}
      onClose={aplicar.isPending ? () => {} : onCerrar}
      size="xl"
      labelledBy="importar-lista-titulo"
      dismissable={!aplicar.isPending && paso !== 'procesando'}
      className={paso === 'revision' ? 'sm:max-w-5xl' : undefined}
    >
      {/* Cabecera + riel de progreso */}
      <div className="border-b border-line px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="importar-lista-titulo"
              className="flex items-center gap-2 text-lg font-semibold text-ink-950"
            >
              <FileSpreadsheet className="h-4.5 w-4.5 shrink-0 text-ink-500" aria-hidden />
              {titulos[paso].titulo}
            </h2>
            <p className="mt-0.5 truncate text-xs text-ink-400">{titulos[paso].sub}</p>
          </div>
          {paso !== 'procesando' && (
            <button
              type="button"
              onClick={onCerrar}
              disabled={aplicar.isPending}
              aria-label="Cerrar"
              className="-mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-xl text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900 disabled:opacity-40"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <RielImportacion pasos={PASOS} actual={pasoRiel} />
      </div>
      {paso === 'archivo' && (
        <>
          <div className="max-h-[62vh] space-y-4 overflow-y-auto px-5 py-5">
            <ZonaArchivo
              archivo={archivo}
              onArchivo={tomarArchivo}
              ayuda={[
                <>
                  La columna <b>Ítem</b> para saber a qué fila de la lista corresponde cada
                  precio.
                </>,
                <>
                  El <b>precio de lista en dólares</b>: de ahí salen el cash y los pesos.
                </>,
                <>
                  Las columnas que <b>no estén</b> no son problema: alcanza con el ítem y un
                  precio.
                </>,
                <>
                  Una celda <b>vacía no es un cero</b>: ese precio se deja como está.
                </>,
              ]}
            />
          </div>
          <PieModal>
            <Button variant="outline" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button onClick={empezarAnalisis} disabled={!archivo}>
              Revisar la lista
              <ArrowRight className="h-4 w-4" />
            </Button>
          </PieModal>
        </>
      )}

      {paso === 'procesando' && <Procesando avance={avance} archivo={archivo?.name ?? ''} />}

      {paso === 'revision' && analisis && resumen && (
        <div className="flex max-h-[74vh] flex-col">
          <div className="border-b border-line px-5 py-3.5">
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              <Tarjeta
                label="Cambian"
                valor={num(resumen.actualiza)}
                icono={PencilLine}
                detalle="otro precio que hoy"
              />
              <Tarjeta
                label="Nuevos"
                valor={num(resumen.nueva)}
                icono={ListPlus}
                detalle="no están en la lista"
              />
              <Tarjeta
                label="A revisar"
                valor={num(resumen.revisar)}
                icono={AlertTriangle}
                detalle="hay que elegir"
              />
              <Tarjeta
                label="Sin cambios"
                valor={num(resumen.igual + resumen.sin_valor)}
                icono={Check}
                detalle="quedan como están"
              />
            </div>
            <AvisosLista resumen={resumen} opciones={opciones} />
            <OpcionesAvanzadas
              abierto={avanzadas}
              onAbrir={setAvanzadas}
              opciones={opciones}
              onOpciones={cambiarOpciones}
              columnas={analisis.columnas}
              personalizadas={columnas !== null}
              onColumna={(campo, posicion) =>
                releer({ ...(columnas ?? analisis.columnas.elegidas), [campo]: posicion })
              }
              onRestablecer={() => releer(null)}
              releyendo={analizar.isPending}
            />
          </div>

          <div className="border-b border-line px-5 py-3">
            <div className="mb-2.5 flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <Input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar un ítem de la lista"
                  className="pl-10"
                />
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button size="sm" variant="outline" onClick={() => marcarListadas(true)}>
                  Marcar {listadas.length ? `las ${num(listadas.length)}` : 'todo'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => marcarListadas(false)}>
                  Desmarcar
                </Button>
              </div>
            </div>
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
              {FILTROS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFiltro(f.id)}
                  aria-pressed={filtro === f.id}
                  className={cn(
                    'h-8 shrink-0 whitespace-nowrap rounded-full px-3.5 text-xs font-medium transition-colors',
                    filtro === f.id
                      ? 'bg-ink-950 text-on-ink'
                      : 'text-ink-500 hover:bg-ink-100 hover:text-ink-800',
                  )}
                >
                  {f.label}
                  <span className="tnum ml-1.5 opacity-60">{num(conteos[f.id])}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {listadas.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-ink-400">
                No hay filas en este filtro.
              </p>
            ) : (
              <>
                <ul className="divide-y divide-line">
                  {listadas.slice(0, visibles).map((fila) => (
                    <FilaRevision
                      key={fila.fila}
                      fila={fila}
                      estado={estadoDe(fila)}
                      decision={decisiones[fila.fila]}
                      opcion={opcionDe(fila)}
                      aplicable={aplicable(fila)}
                      precios={precioDeFila(fila)}
                      onCambiar={(cambio) => cambiarDecision(fila, cambio)}
                    />
                  ))}
                </ul>
                {listadas.length > visibles && (
                  <div className="px-5 py-4 text-center">
                    <Button variant="outline" size="sm" onClick={() => setVisibles((v) => v + PAGINA)}>
                      Ver {num(Math.min(PAGINA, listadas.length - visibles))} más
                      <span className="text-ink-400">de {num(listadas.length)}</span>
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="border-t border-line bg-surface px-5 py-3.5">
            {conflictos.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setBusqueda('')
                  setFiltro('revisar')
                }}
                className="mb-2.5 flex w-full items-start gap-2 rounded-xl border border-ink-900 px-3 py-2.5 text-left text-xs text-ink-800 transition-colors hover:bg-ink-50"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>
                  <b>
                    {conflictos.length === 1
                      ? '1 precio está marcado dos veces'
                      : `${num(conflictos.length)} precios están marcados dos veces`}
                  </b>{' '}
                  (filas{' '}
                  {conflictos
                    .slice(0, 3)
                    .map((g) => g.map((f) => f.fila).join(' y '))
                    .join(', ')}
                  ). Aplicarlas todas dejaría solo el último valor: tocá acá para verlas.
                </span>
              </button>
            )}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 text-xs text-ink-500">
                <p className="tnum font-medium text-ink-900">
                  {num(marcadas.length)} filas marcadas
                  {impacto.altas > 0 && ` · ${num(impacto.altas)} altas nuevas`}
                </p>
                <p className="truncate">
                  {opciones.pesos
                    ? 'Los pesos van a quedar fijos en el valor de la planilla.'
                    : 'Los pesos se siguen calculando con el dólar del negocio.'}
                </p>
              </div>
              <div className="flex shrink-0 gap-2.5">
                <Button
                  variant="outline"
                  onClick={() => setPaso('archivo')}
                  disabled={aplicar.isPending}
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">Otra lista</span>
                </Button>
                <Button
                  onClick={() => aplicar.mutate()}
                  disabled={aplicar.isPending || marcadas.length === 0 || conflictos.length > 0}
                  className="flex-1 sm:flex-none"
                >
                  {aplicar.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Aplicar {num(marcadas.length)} cambios
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {paso === 'listo' && resultado && (
        <>
          <div className="max-h-[62vh] space-y-4 overflow-y-auto px-5 py-6">
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <span className="grid h-16 w-16 place-items-center rounded-2xl bg-ink-950 text-on-ink">
                <CheckCircle2 className="h-8 w-8" />
              </span>
              <p className="text-base font-semibold text-ink-950">
                Listo — la lista quedó al día
              </p>
              <p className="max-w-sm text-xs text-ink-500">
                Cada cambio quedó registrado en el historial con tu usuario, igual que si lo
                hubieras editado a mano.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              <Tarjeta label="Precios" valor={num(resultado.actualizados)} icono={Tag} />
              <Tarjeta label="Nuevos" valor={num(resultado.creados)} icono={ListPlus} />
              <Tarjeta label="Altas" valor={num(resultado.altas)} icono={Sparkles} />
            </div>
            {resultado.sin_cambio > 0 && (
              <Aviso icono={Check}>
                Otras {num(resultado.sin_cambio)} filas ya tenían ese mismo precio: no se tocaron.
              </Aviso>
            )}
            {resumen && resumen.items_sin_planilla > 0 && (
              <Aviso icono={Info}>
                {num(resumen.items_sin_planilla)} ítems de la lista no figuran en este archivo: su
                precio quedó <b>tal cual estaba</b>.
              </Aviso>
            )}
          </div>
          <PieModal>
            <Button variant="outline" onClick={() => setPaso('archivo')}>
              Importar otra
            </Button>
            <Button onClick={onCerrar}>Terminar</Button>
          </PieModal>
        </>
      )}
    </Modal>
  )
}

// ===== Subcomponentes =====

/**
 * Lo que hay que saber ANTES de aplicar: con qué dólar está armada la lista y
 * qué precios en pesos no se van a importar.
 */
function AvisosLista({
  resumen,
  opciones,
}: {
  resumen: ResumenImportacionService
  opciones: Opciones
}) {
  const planilla = Number(resumen.dolar_planilla ?? 0)
  const negocio = Number(resumen.dolar_negocio ?? 0)
  const otroDolar = planilla > 0 && negocio > 0 && planilla !== negocio
  if (!otroDolar && resumen.pesos_ignorados === 0) return null

  return (
    <ul className="mt-3 space-y-1.5 rounded-xl border border-line bg-ink-50/40 px-3.5 py-3 text-xs leading-relaxed text-ink-600">
      {otroDolar && (
        <li>
          Los pesos de esta lista están calculados con un dólar de{' '}
          <b className="text-ink-900">≈ {money0(planilla)}</b> y el negocio tiene{' '}
          <b className="text-ink-900">{money0(negocio)}</b>. Por eso no van a coincidir: los
          pesos del sistema salen del dólar del negocio, que se cambia en «Gestor de dólar».
        </li>
      )}
      {!opciones.pesos && resumen.pesos_ignorados > 0 && (
        <li className="text-ink-500">
          En {num(resumen.pesos_ignorados)} filas la planilla trae otro precio en pesos:{' '}
          <b>no se importa</b> (lo calcula el sistema). Se puede cambiar en opciones avanzadas.
        </li>
      )}
      {opciones.pesos && (
        <li className="text-ink-500">
          Los precios en pesos van a quedar <b>fijados a mano</b>: dejan de seguir al dólar hasta
          que se los borre desde Precios de service.
        </li>
      )}
    </ul>
  )
}

/**
 * Opciones avanzadas: qué precios se aplican y de qué columna sale cada dato.
 *
 * Viene plegado y con lo normal puesto: nada de acá hace falta para importar el
 * archivo que baja «Exportar».
 */
function OpcionesAvanzadas({
  abierto,
  onAbrir,
  opciones,
  onOpciones,
  columnas,
  personalizadas,
  onColumna,
  onRestablecer,
  releyendo,
}: {
  abierto: boolean
  onAbrir: (valor: boolean) => void
  opciones: Opciones
  onOpciones: (valor: Opciones) => void
  columnas: ColumnasImportacionService
  personalizadas: boolean
  onColumna: (campo: CampoColumnaService, posicion: number | null) => void
  onRestablecer: () => void
  releyendo: boolean
}) {
  const distintas = DATOS.filter((d) => opciones[d.id] !== NORMAL[d.id]).length
  const cambios = distintas + (personalizadas ? 1 : 0)

  const deColumna = columnas.disponibles.map((c) => ({
    value: String(c.indice),
    label: `${c.letra} · ${c.rotulo || '(sin rótulo)'}`,
  }))

  return (
    <div className="mt-2.5">
      <button
        type="button"
        onClick={() => onAbrir(!abierto)}
        aria-expanded={abierto}
        className="flex w-full items-center gap-2 rounded-xl px-1.5 py-1.5 text-xs font-medium text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-900"
      >
        <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Opciones avanzadas
        {cambios > 0 && (
          <span className="tnum rounded-full bg-ink-900 px-1.5 py-0.5 text-[0.6rem] font-semibold text-on-ink">
            {cambios}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1.5 font-normal text-ink-400">
          <span className="hidden sm:inline">
            {cambios === 0 ? 'como viene la lista' : 'hay cambios'}
          </span>
          <ChevronDown
            className={cn('h-3.5 w-3.5 transition-transform', abierto && 'rotate-180')}
            aria-hidden
          />
        </span>
      </button>

      {abierto && (
        <div className="mt-1.5 max-h-[42vh] space-y-4 overflow-y-auto rounded-xl border border-line bg-surface px-3.5 py-3.5">
          <section>
            <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-wide text-ink-400">
              Qué se importa
            </p>
            <div className="space-y-1.5">
              {DATOS.map((dato) => (
                <label
                  key={dato.id}
                  className="flex cursor-pointer items-start gap-2.5 rounded-lg px-1.5 py-1 hover:bg-ink-50"
                >
                  <input
                    type="checkbox"
                    checked={opciones[dato.id]}
                    disabled={releyendo && dato.relee}
                    onChange={(e) => onOpciones({ ...opciones, [dato.id]: e.target.checked })}
                    className="mt-0.5 h-4.5 w-4.5 shrink-0 cursor-pointer rounded border-line-strong text-ink-950 accent-ink-950"
                  />
                  <span className="min-w-0 text-xs leading-relaxed">
                    <b className="font-medium text-ink-900">{dato.label}</b>
                    <span className="block text-ink-400">{dato.ayuda}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section className="border-t border-line pt-3.5">
            <div className="mb-2 flex items-center gap-2">
              <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-ink-400">
                De qué columna sale cada dato
              </p>
              {releyendo && <Loader2 className="h-3 w-3 animate-spin text-ink-400" aria-hidden />}
              {personalizadas && !releyendo && (
                <button
                  type="button"
                  onClick={onRestablecer}
                  className="ml-auto text-[0.7rem] font-medium text-ink-500 underline underline-offset-2 hover:text-ink-900"
                >
                  Volver a lo detectado
                </button>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {COLUMNAS.map((columna) => {
                const elegida = columnas.elegidas[columna.id]
                return (
                  <label key={columna.id} className="block text-xs">
                    <span className="mb-1 block text-ink-500">{columna.label}</span>
                    <Select
                      options={
                        columna.obligatoria
                          ? deColumna
                          : [{ value: '-1', label: '— No importar' }, ...deColumna]
                      }
                      value={elegida === null ? '-1' : String(elegida)}
                      onChange={(v) => onColumna(columna.id, Number(v) < 0 ? null : Number(v))}
                      disabled={releyendo}
                      searchable
                      searchPlaceholder="Buscar columna"
                    />
                  </label>
                )
              })}
            </div>
            <p className="mt-2 text-[0.7rem] leading-relaxed text-ink-400">
              Se está leyendo la hoja «{columnas.hoja}», con los títulos en la fila{' '}
              {columnas.fila}. Cambiar una columna vuelve a leer el archivo, así que las marcas
              arrancan de cero.
            </p>
          </section>
        </div>
      )}
    </div>
  )
}

/** Una fila de la revisión: qué precio hay hoy, cuál quedaría y contra qué va. */
function FilaRevision({
  fila,
  estado,
  decision,
  opcion,
  aplicable,
  precios,
  onCambiar,
}: {
  fila: FilaImportacionService
  estado: EstadoFilaService
  decision: Decision | undefined
  opcion: OpcionImportacionService | null
  aplicable: boolean
  /** Los precios que se van a escribir con las opciones de ahora. */
  precios: Record<string, string | null> | null
  onCambiar: (cambio: Partial<Decision>) => void
}) {
  const info = ESTADO_INFO[estado]
  const marcada = decision?.marcada ?? false
  const repetida = fila.duplicada_con.length > 0
  const antes = opcion?.precio.antes
  const despues = opcion?.precio.despues
  const plata = (valor: string | null | undefined) =>
    valor === null || valor === undefined ? '—' : usd(Number(valor))
  const pesos = (valor: string | null | undefined) =>
    valor === null || valor === undefined ? '—' : money0(Number(valor))
  const cambiaUsd = antes?.lista_usd !== despues?.lista_usd
  const cambiaArs = antes?.lista_ars !== despues?.lista_ars

  return (
    <li
      className={cn(
        'flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3 transition-colors sm:px-5',
        marcada && 'bg-ink-50/50',
        !aplicable && 'opacity-70',
      )}
    >
      <label className="flex shrink-0 items-center pt-0.5">
        <input
          type="checkbox"
          checked={marcada}
          disabled={!aplicable}
          onChange={(e) => onCambiar({ marcada: e.target.checked })}
          aria-label={`Importar ${fila.etiqueta}`}
          className="h-4.5 w-4.5 cursor-pointer rounded border-line-strong text-ink-950 accent-ink-950 disabled:cursor-not-allowed disabled:opacity-30"
        />
      </label>

      <div className="min-w-0 flex-1 basis-[60%] md:basis-auto">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="truncate text-sm font-medium text-ink-900">{fila.etiqueta}</p>
          {fila.confianza === 'aproximada' && (
            <span
              title="El nombre no era idéntico: revisá que sea el ítem correcto."
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line-strong px-1.5 py-0.5 text-[0.6rem] font-medium text-ink-500"
            >
              <AlertTriangle className="h-3 w-3" aria-hidden />
              aproximado
            </span>
          )}
          {repetida && (
            <span
              title="Otra fila de la planilla apunta al mismo precio."
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-ink-900 px-1.5 py-0.5 text-[0.6rem] font-medium text-ink-900"
            >
              <Copy className="h-3 w-3" aria-hidden />
              repetido
            </span>
          )}
        </div>
        <p className="truncate text-xs text-ink-400">
          <span className="tnum">fila {fila.fila}</span>
          {opcion?.seccion_nombre && ` · ${opcion.seccion_nombre}`}
          {opcion?.variante_nombre && ` · ${opcion.variante_nombre}`}
          {fila.seccion_de_grupo && ' · sección del grupo'}
        </p>
        {fila.motivo && (estado !== 'actualiza' || repetida) && (
          <p className="mt-0.5 text-xs text-ink-500">{fila.motivo}</p>
        )}
        {fila.opciones.length > 1 && (
          <div className="mt-1.5 max-w-md">
            <Select
              options={fila.opciones.map((o) => ({
                value: o.clave,
                label:
                  (o.item === null ? 'Dar de alta · ' : '') +
                  [o.seccion_nombre, o.variante_nombre].filter(Boolean).join(' · '),
              }))}
              value={decision?.opcion ?? fila.elegida ?? ''}
              onChange={(v) => onCambiar({ opcion: v, marcada: true })}
              placeholder="Elegí dónde va este precio"
            />
          </div>
        )}
        {opcion && opcion.precio.ignorados.length > 0 && (
          <p className="mt-0.5 text-[0.7rem] text-ink-400">
            La planilla trae otro precio en pesos ({pesos(opcion.precio.planilla.lista_ars)}):
            no se importa.
          </p>
        )}
      </div>

      <span
        className={cn(
          'order-last shrink-0 rounded-full px-2.5 py-0.5 text-[0.65rem] font-medium md:order-none',
          info.clase,
        )}
        title={info.ayuda}
      >
        {info.label}
      </span>

      <div className="ml-auto shrink-0 text-right md:ml-0 md:w-[15rem]">
        {opcion ? (
          <>
            <p
              className={cn(
                'tnum flex items-center justify-end gap-1.5 text-sm',
                precios ? 'text-ink-900' : 'text-ink-300 line-through',
              )}
            >
              <span className={cn(!cambiaUsd && 'text-ink-400')}>{plata(antes?.lista_usd)}</span>
              {cambiaUsd && (
                <>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-300" aria-hidden />
                  <b>{plata(despues?.lista_usd)}</b>
                </>
              )}
            </p>
            <p className="tnum flex items-center justify-end gap-1.5 text-[0.7rem] text-ink-400">
              <span>{pesos(antes?.lista_ars)}</span>
              {cambiaArs && (
                <>
                  <ArrowRight className="h-3 w-3 shrink-0" aria-hidden />
                  <span className="font-semibold text-ink-600">{pesos(despues?.lista_ars)}</span>
                </>
              )}
            </p>
            {opcion.precio.fijados.length > 0 && (
              <p
                className="text-[0.65rem] text-ink-400"
                title="Estos precios quedan fijados a mano: no salen de la fórmula."
              >
                fijado: {opcion.precio.fijados.join(' · ')}
              </p>
            )}
          </>
        ) : (
          <p className="tnum text-sm text-ink-300">{plata(fila.planilla.lista_usd)}</p>
        )}
      </div>
    </li>
  )
}
