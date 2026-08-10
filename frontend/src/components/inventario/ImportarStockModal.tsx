import { useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent, ReactNode } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Boxes,
  Check,
  CheckCircle2,
  Copy,
  FileSpreadsheet,
  Info,
  Loader2,
  PackagePlus,
  Search,
  Sparkles,
  Store,
  TrendingDown,
  TrendingUp,
  Upload,
  X,
} from 'lucide-react'
import {
  analizarImportacionStock,
  aplicarImportacionStock,
  type AnalisisImportacion,
  type EstadoFilaImportacion,
  type FilaImportacion,
  type ItemImportacionInput,
  type ResultadoImportacion,
  type Sucursal,
} from '@/services/inventario'
import { ApiError } from '@/lib/api'
import { num } from '@/lib/format'
import { cn, coincideBusqueda } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ToastProvider'

/**
 * Importar por sucursal: la planilla del negocio se sube, se cruza contra el
 * catálogo y se REVISA antes de tocar nada.
 *
 * Cuatro actos: elegir la sucursal → subir el archivo → procesar → revisar el
 * antes/después fila por fila y aplicar solo lo que se marca. El análisis es de
 * solo lectura: hasta que no se aprieta "Aplicar" el stock no se mueve.
 *
 * La regla que ordena todo: **celda vacía no es cero**. Si la planilla no
 * informa una cantidad, esa fila queda afuera y el stock no se toca.
 */

type Paso = 'sucursal' | 'archivo' | 'procesando' | 'revision' | 'listo'

/** Lo que decidió quien revisa para cada fila (se guarda por número de fila). */
interface Decision {
  marcada: boolean
  /** Producto elegido a mano cuando la fila quedó en "revisar". */
  producto: number | null
}

const ESTADO_INFO: Record<
  EstadoFilaImportacion,
  { label: string; clase: string; ayuda: string }
> = {
  actualiza: {
    label: 'Cambia',
    clase: 'bg-ink-900 text-on-ink',
    ayuda: 'La planilla trae una cantidad distinta de la que hay hoy.',
  },
  igual: {
    label: 'Sin cambios',
    clase: 'bg-ink-100 text-ink-500',
    ayuda: 'Ya tiene exactamente esa cantidad: no hay nada que hacer.',
  },
  nueva: {
    label: 'Nuevo',
    clase: 'border border-ink-900 text-ink-900',
    ayuda: 'No está en el catálogo. Marcala para darla de alta.',
  },
  revisar: {
    label: 'Revisar',
    clase: 'border border-line-strong text-ink-600',
    ayuda: 'Hay más de un producto con este nombre: elegí cuál es.',
  },
  sin_valor: {
    label: 'Sin dato',
    clase: 'bg-ink-50 text-ink-400',
    ayuda: 'La planilla no informó cantidad, así que el stock no se toca.',
  },
  invalida: {
    label: 'No es un conteo',
    clase: 'bg-ink-50 text-ink-400',
    ayuda: 'La celda no tiene unidades (un precio, un error de Excel…).',
  },
}

type FiltroId = 'cambios' | 'sube' | 'baja' | 'nuevas' | 'revisar' | 'igual' | 'fuera' | 'todas'

const FILTROS: Array<{ id: FiltroId; label: string }> = [
  { id: 'cambios', label: 'Cambian' },
  { id: 'sube', label: 'Suben' },
  { id: 'baja', label: 'Bajan' },
  { id: 'nuevas', label: 'Nuevos' },
  { id: 'revisar', label: 'A revisar' },
  { id: 'igual', label: 'Sin cambios' },
  { id: 'fuera', label: 'Fuera de la importación' },
  { id: 'todas', label: 'Todas' },
]

/** Cuántas filas se pintan de una: el resto entra con "Ver más". */
const PAGINA = 120

export function ImportarStockModal({
  abierto,
  sucursales,
  sucursalInicial,
  resumenPorSucursal,
  admin,
  onCerrar,
  onAplicado,
}: {
  abierto: boolean
  sucursales: Sucursal[]
  /** La sucursal que está mirando la pantalla, si hay una sola elegida. */
  sucursalInicial?: number | null
  /** Foto rápida de cada sucursal para el paso 1. */
  resumenPorSucursal: Record<number, { productos: number; unidades: number }>
  /** Solo un admin puede dar de alta productos nuevos del catálogo. */
  admin: boolean
  onCerrar: () => void
  onAplicado: (resultado: ResultadoImportacion) => void
}) {
  const toast = useToast()
  const inputArchivo = useRef<HTMLInputElement>(null)

  const [paso, setPaso] = useState<Paso>('sucursal')
  const [sucursalId, setSucursalId] = useState<number | null>(null)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const [analisis, setAnalisis] = useState<AnalisisImportacion | null>(null)
  const [decisiones, setDecisiones] = useState<Record<number, Decision>>({})
  const [filtro, setFiltro] = useState<FiltroId>('cambios')
  const [busqueda, setBusqueda] = useState('')
  const [visibles, setVisibles] = useState(PAGINA)
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null)
  const [avance, setAvance] = useState(0)

  const sucursal = sucursales.find((s) => s.id === sucursalId) ?? null

  // Cada apertura arranca de cero: importar es una operación puntual y quedarse
  // con el análisis de la vez anterior sería peligroso.
  useEffect(() => {
    if (!abierto) return
    setPaso('sucursal')
    setSucursalId(sucursales.length === 1 ? sucursales[0].id : (sucursalInicial ?? null))
    setArchivo(null)
    setAnalisis(null)
    setDecisiones({})
    setFiltro('cambios')
    setBusqueda('')
    setVisibles(PAGINA)
    setResultado(null)
    setAvance(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto])

  // --- Análisis ---------------------------------------------------------------

  const analizar = useMutation({
    mutationFn: () => analizarImportacionStock({ sucursal: sucursalId!, archivo: archivo! }),
    onSuccess: (data) => {
      const iniciales: Record<number, Decision> = {}
      for (const fila of data.filas) {
        iniciales[fila.fila] = { marcada: fila.sugerido, producto: fila.producto }
      }
      setDecisiones(iniciales)
      setAnalisis(data)
      setAvance(100)
      // Un respiro para que se vea el 100 % antes de pasar a la revisión.
      setTimeout(() => setPaso('revision'), 350)
    },
    onError: (e) => {
      setPaso('archivo')
      setAvance(0)
      toast.error('No se pudo leer la planilla', e instanceof ApiError ? e.message : undefined)
    },
  })

  // Barra de progreso "honesta": avanza sola hasta 90 % mientras el servidor
  // trabaja y solo llega a 100 % cuando la respuesta llegó de verdad.
  useEffect(() => {
    if (paso !== 'procesando' || !analizar.isPending) return
    const id = setInterval(() => setAvance((a) => (a < 90 ? a + Math.max(1, (90 - a) / 8) : a)), 180)
    return () => clearInterval(id)
  }, [paso, analizar.isPending])

  function empezarAnalisis() {
    if (!archivo || !sucursalId) return
    setAvance(6)
    setPaso('procesando')
    analizar.mutate()
  }

  // --- Filas ------------------------------------------------------------------

  const filas = analisis?.filas ?? []

  /** El estado REAL de una fila: "revisar" se resuelve al elegir el producto. */
  function estadoDe(fila: FilaImportacion): EstadoFilaImportacion {
    if (fila.estado !== 'revisar') return fila.estado
    return decisiones[fila.fila]?.producto ? 'actualiza' : 'revisar'
  }

  function productoElegido(fila: FilaImportacion): number | null {
    return decisiones[fila.fila]?.producto ?? fila.producto
  }

  /** Si la fila puede aplicarse tal como está decidida ahora. */
  function aplicable(fila: FilaImportacion): boolean {
    if (fila.cantidad_nueva === null) return false
    if (fila.estado === 'invalida' || fila.estado === 'sin_valor') return false
    if (fila.estado === 'nueva') return admin && fila.puede_crear
    return productoElegido(fila) !== null
  }

  const listadas = useMemo(() => {
    const termino = busqueda.trim()
    return filas.filter((fila) => {
      if (termino) {
        const texto = `${fila.nombre_planilla} ${fila.producto_nombre} ${fila.seccion} ${fila.categoria}`
        if (!coincideBusqueda(texto, termino)) return false
      }
      const estado = estadoDe(fila)
      const delta = (fila.cantidad_nueva ?? 0) - (fila.cantidad_actual ?? 0)
      switch (filtro) {
        case 'cambios':
          return estado === 'actualiza' || estado === 'nueva'
        case 'sube':
          return estado === 'actualiza' && delta > 0
        case 'baja':
          return estado === 'actualiza' && delta < 0
        case 'nuevas':
          return estado === 'nueva'
        case 'revisar':
          return estado === 'revisar' || fila.duplicada_con.length > 0
        case 'igual':
          return estado === 'igual'
        case 'fuera':
          return estado === 'sin_valor' || estado === 'invalida'
        default:
          return true
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, filtro, busqueda, decisiones])

  useEffect(() => setVisibles(PAGINA), [filtro, busqueda])

  const marcadas = useMemo(
    () => filas.filter((f) => decisiones[f.fila]?.marcada && aplicable(f)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filas, decisiones, admin],
  )

  /**
   * Dos filas marcadas que apuntan al mismo producto: aplicarlas a las dos
   * dejaría la cantidad de la última, en silencio. Se avisa acá y no se deja
   * seguir hasta que quede una sola (el backend igual lo rechaza).
   */
  const conflictos = useMemo(() => {
    const porProducto = new Map<number, FilaImportacion[]>()
    for (const fila of marcadas) {
      const producto = productoElegido(fila)
      if (producto === null) continue
      porProducto.set(producto, [...(porProducto.get(producto) ?? []), fila])
    }
    return [...porProducto.values()].filter((g) => g.length > 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marcadas, decisiones])

  const impacto = useMemo(() => {
    let antes = 0
    let despues = 0
    let altas = 0
    for (const fila of marcadas) {
      antes += fila.cantidad_actual ?? 0
      despues += fila.cantidad_nueva ?? 0
      if (fila.estado === 'nueva') altas += 1
    }
    return { antes, despues, altas, delta: despues - antes }
  }, [marcadas])

  const conteos = useMemo(() => {
    const c = { cambios: 0, sube: 0, baja: 0, nuevas: 0, revisar: 0, igual: 0, fuera: 0, todas: filas.length }
    for (const fila of filas) {
      const estado = estadoDe(fila)
      const delta = (fila.cantidad_nueva ?? 0) - (fila.cantidad_actual ?? 0)
      if (estado === 'actualiza' || estado === 'nueva') c.cambios += 1
      if (estado === 'actualiza' && delta > 0) c.sube += 1
      if (estado === 'actualiza' && delta < 0) c.baja += 1
      if (estado === 'nueva') c.nuevas += 1
      if (estado === 'revisar' || fila.duplicada_con.length > 0) c.revisar += 1
      if (estado === 'igual') c.igual += 1
      if (estado === 'sin_valor' || estado === 'invalida') c.fuera += 1
    }
    return c
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, decisiones])

  function cambiarDecision(fila: FilaImportacion, cambio: Partial<Decision>) {
    setDecisiones((prev) => ({
      ...prev,
      [fila.fila]: {
        marcada: prev[fila.fila]?.marcada ?? false,
        producto: prev[fila.fila]?.producto ?? fila.producto,
        ...cambio,
      },
    }))
  }

  /** Marca o desmarca de una todas las filas del filtro actual que se pueden. */
  function marcarListadas(marcada: boolean) {
    setDecisiones((prev) => {
      const siguiente = { ...prev }
      if (!marcada) {
        for (const fila of listadas) {
          siguiente[fila.fila] = {
            marcada: false,
            producto: siguiente[fila.fila]?.producto ?? fila.producto,
          }
        }
        return siguiente
      }
      // Marcar en bloque nunca deja dos filas peleando por el mismo producto:
      // de un grupo repetido entra la primera y las otras quedan para que
      // quien revisa elija a mano cuál vale.
      const tomados = new Set<number>()
      for (const fila of filas) {
        const producto = siguiente[fila.fila]?.producto ?? fila.producto
        if (siguiente[fila.fila]?.marcada && producto !== null) tomados.add(producto)
      }
      for (const fila of listadas) {
        if (!aplicable(fila)) continue
        const producto = siguiente[fila.fila]?.producto ?? fila.producto
        if (producto !== null) {
          if (tomados.has(producto)) continue
          tomados.add(producto)
        }
        siguiente[fila.fila] = { marcada: true, producto }
      }
      return siguiente
    })
  }

  // --- Aplicar ----------------------------------------------------------------

  const aplicar = useMutation({
    mutationFn: () => {
      const items: ItemImportacionInput[] = marcadas.map((fila) => {
        const base: ItemImportacionInput = {
          fila: fila.fila,
          cantidad: fila.cantidad_nueva ?? 0,
        }
        if (fila.minimo_nuevo !== null) base.stock_minimo = fila.minimo_nuevo
        const producto = productoElegido(fila)
        if (producto !== null) return { ...base, producto }
        return {
          ...base,
          crear: {
            nombre: fila.nombre_planilla,
            categoria: fila.categoria_id!,
            lista_usd: fila.lista_usd,
          },
        }
      })
      return aplicarImportacionStock({
        sucursal: sucursalId!,
        archivo: analisis?.archivo,
        items,
      })
    },
    onSuccess: (data) => {
      setResultado(data)
      setPaso('listo')
      onAplicado(data)
    },
    onError: (e) =>
      toast.error('No se pudo importar', e instanceof ApiError ? e.message : undefined),
  })

  // --- Archivo ----------------------------------------------------------------

  function tomarArchivo(elegido: File | null | undefined) {
    if (!elegido) return
    if (!elegido.name.toLowerCase().endsWith('.xlsx')) {
      toast.error('Ese archivo no sirve', 'Tiene que ser un Excel .xlsx (Archivo → Guardar como).')
      return
    }
    setArchivo(elegido)
  }

  function soltar(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    setArrastrando(false)
    tomarArchivo(event.dataTransfer.files?.[0])
  }

  const titulos: Record<Paso, { titulo: string; sub: string }> = {
    sucursal: { titulo: 'Importar por sucursal', sub: '¿De qué local es la planilla que vas a subir?' },
    archivo: { titulo: 'Subí la planilla', sub: `El Excel de ${sucursal?.nombre ?? 'la sucursal'} con la columna STOCK completa.` },
    procesando: { titulo: 'Procesando la planilla', sub: 'Leyendo, cruzando con el catálogo y calculando diferencias.' },
    revision: { titulo: 'Revisá antes de aplicar', sub: `${sucursal?.nombre ?? ''} · ${num(filas.length)} filas leídas. Todavía no se tocó nada.` },
    listo: { titulo: 'Importación aplicada', sub: `El stock de ${sucursal?.nombre ?? 'la sucursal'} quedó actualizado.` },
  }

  const enRevision = paso === 'revision'

  return (
    <Modal
      open={abierto}
      onClose={aplicar.isPending ? () => {} : onCerrar}
      size="xl"
      labelledBy="importar-stock-titulo"
      dismissable={!aplicar.isPending && paso !== 'procesando'}
      className={enRevision ? 'sm:max-w-5xl' : undefined}
    >
      {/* Cabecera + rieles de progreso */}
      <div className="border-b border-line px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="importar-stock-titulo"
              className="flex items-center gap-2 text-lg font-semibold text-ink-950"
            >
              <FileSpreadsheet className="h-4.5 w-4.5 shrink-0 text-ink-500" aria-hidden />
              {titulos[paso].titulo}
            </h2>
            <p className="mt-0.5 text-xs text-ink-400">{titulos[paso].sub}</p>
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
        <Riel paso={paso} />
      </div>

      {/* ---------- Paso 1: sucursal ---------- */}
      {paso === 'sucursal' && (
        <>
          <div className="max-h-[62vh] space-y-4 overflow-y-auto px-5 py-5">
            <div className="grid gap-2.5 sm:grid-cols-2">
              {sucursales.map((s) => {
                const foto = resumenPorSucursal[s.id] ?? { productos: 0, unidades: 0 }
                const elegida = sucursalId === s.id
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSucursalId(s.id)}
                    aria-pressed={elegida}
                    className={cn(
                      'group flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-all',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900',
                      elegida
                        ? 'border-ink-900 bg-ink-950 text-on-ink shadow-lg'
                        : 'border-line-strong bg-surface hover:-translate-y-0.5 hover:border-ink-300 hover:shadow-md motion-reduce:hover:translate-y-0',
                    )}
                  >
                    <span
                      className={cn(
                        'grid h-10 w-10 shrink-0 place-items-center rounded-xl',
                        elegida ? 'bg-white/15' : 'bg-ink-50 text-ink-500 ring-1 ring-line',
                      )}
                    >
                      {elegida ? <Check className="h-5 w-5" /> : <Store className="h-5 w-5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{s.nombre}</span>
                      <span
                        className={cn(
                          'tnum block truncate text-xs',
                          elegida ? 'text-on-ink/70' : 'text-ink-400',
                        )}
                      >
                        {num(foto.productos)} productos · {num(foto.unidades)} unidades hoy
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
            <Aviso icono={Info}>
              La planilla que suba cada local <b>solo toca el stock de esa sucursal</b>. Las demás
              quedan exactamente como están.
            </Aviso>
          </div>
          <PieModal>
            <Button variant="outline" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button disabled={!sucursalId} onClick={() => setPaso('archivo')}>
              Continuar
              <ArrowRight className="h-4 w-4" />
            </Button>
          </PieModal>
        </>
      )}

      {/* ---------- Paso 2: archivo ---------- */}
      {paso === 'archivo' && (
        <>
          <div className="max-h-[62vh] space-y-4 overflow-y-auto px-5 py-5">
            <label
              onDragOver={(e) => {
                e.preventDefault()
                setArrastrando(true)
              }}
              onDragLeave={() => setArrastrando(false)}
              onDrop={soltar}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors',
                arrastrando
                  ? 'border-ink-900 bg-ink-50'
                  : 'border-line-strong bg-canvas/40 hover:border-ink-300 hover:bg-ink-50/60',
              )}
            >
              <input
                ref={inputArchivo}
                type="file"
                accept=".xlsx"
                className="sr-only"
                onChange={(e) => tomarArchivo(e.target.files?.[0])}
              />
              <span
                className={cn(
                  'grid h-14 w-14 place-items-center rounded-2xl transition-colors',
                  archivo ? 'bg-ink-950 text-on-ink' : 'bg-ink-100 text-ink-500',
                )}
              >
                {archivo ? <FileSpreadsheet className="h-6 w-6" /> : <Upload className="h-6 w-6" />}
              </span>
              {archivo ? (
                <>
                  <span className="max-w-full truncate text-sm font-semibold text-ink-900">
                    {archivo.name}
                  </span>
                  <span className="tnum text-xs text-ink-400">
                    {(archivo.size / 1024).toFixed(0)} KB · tocá para cambiarlo
                  </span>
                </>
              ) : (
                <>
                  <span className="text-sm font-medium text-ink-800">
                    Arrastrá el Excel acá, o tocá para buscarlo
                  </span>
                  <span className="text-xs text-ink-400">Formato .xlsx · hasta 10 MB</span>
                </>
              )}
            </label>

            <div className="rounded-2xl border border-line bg-canvas/40 px-4 py-3.5">
              <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-ink-400">
                Qué mira el sistema
              </p>
              <ul className="space-y-1.5 text-xs text-ink-600">
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" aria-hidden />
                  La columna <b>PRODUCTOS</b> para saber qué es cada fila.
                </li>
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" aria-hidden />
                  La columna <b>STOCK</b> (y <b>STOCK MÍNIMO</b>, si la completaron).
                </li>
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" aria-hidden />
                  Una celda <b>vacía no es un cero</b>: esa fila se deja como está.
                </li>
              </ul>
            </div>
          </div>
          <PieModal>
            <Button variant="outline" onClick={() => setPaso('sucursal')}>
              <ArrowLeft className="h-4 w-4" />
              Atrás
            </Button>
            <Button disabled={!archivo} onClick={empezarAnalisis}>
              Analizar planilla
              <ArrowRight className="h-4 w-4" />
            </Button>
          </PieModal>
        </>
      )}

      {/* ---------- Paso 3: procesando ---------- */}
      {paso === 'procesando' && <Procesando avance={avance} archivo={archivo?.name ?? ''} />}

      {/* ---------- Paso 4: revisión ---------- */}
      {enRevision && analisis && (
        <>
          <div className="border-b border-line px-5 py-3 sm:py-4">
            {/* En el celular la pantalla es para la lista: el resumen va en una
                sola línea y las tarjetas aparecen recién de sm para arriba. */}
            <p className="tnum flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-500 sm:hidden">
              <span>
                <b className="text-ink-900">{num(analisis.resumen.sube)}</b> suben
              </span>
              <span>
                <b className="text-ink-900">{num(analisis.resumen.baja)}</b> bajan
              </span>
              <span>
                <b className="text-ink-900">{num(analisis.resumen.nueva)}</b> nuevos
              </span>
              <span>
                <b className="text-ink-900">
                  {num(analisis.resumen.sin_valor + analisis.resumen.invalida)}
                </b>{' '}
                sin dato
              </span>
            </p>
            <div className="hidden gap-2.5 sm:grid sm:grid-cols-2 lg:grid-cols-4">
              <Tarjeta
                label="Suben"
                valor={num(analisis.resumen.sube)}
                icono={TrendingUp}
                detalle="más unidades que hoy"
              />
              <Tarjeta
                label="Bajan"
                valor={num(analisis.resumen.baja)}
                icono={TrendingDown}
                detalle="menos unidades que hoy"
              />
              <Tarjeta
                label="Nuevos"
                valor={num(analisis.resumen.nueva)}
                icono={PackagePlus}
                detalle="no están en el catálogo"
              />
              <Tarjeta
                label="Sin dato"
                valor={num(analisis.resumen.sin_valor + analisis.resumen.invalida)}
                icono={Info}
                detalle="quedan como están"
              />
            </div>
          </div>

          <div className="border-b border-line px-5 py-3">
            <div className="mb-2.5 flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <Input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar un producto en la planilla"
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
                      productoElegido={productoElegido(fila)}
                      aplicable={aplicable(fila)}
                      admin={admin}
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
                      ? '1 producto está marcado dos veces'
                      : `${num(conflictos.length)} productos están marcados dos veces`}
                  </b>{' '}
                  (filas{' '}
                  {conflictos
                    .slice(0, 3)
                    .map((g) => g.map((f) => f.fila).join(' y '))
                    .join(', ')}
                  ). Aplicarlas todas dejaría solo la última cantidad: tocá acá para verlas y dejar
                  una sola.
                </span>
              </button>
            )}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 text-xs text-ink-500">
                <p className="tnum font-medium text-ink-900">
                  {num(marcadas.length)} filas marcadas
                  {impacto.altas > 0 && ` · ${num(impacto.altas)} altas nuevas`}
                </p>
                <p className="tnum truncate">
                  {num(impacto.antes)} → <b className="text-ink-800">{num(impacto.despues)}</b>{' '}
                  unidades ({impacto.delta >= 0 ? '+' : ''}
                  {num(impacto.delta)})
                </p>
              </div>
              <div className="flex shrink-0 gap-2.5">
                <Button
                  variant="outline"
                  onClick={() => setPaso('archivo')}
                  disabled={aplicar.isPending}
                  className="shrink-0"
                  aria-label="Volver a subir otra planilla"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">Otra planilla</span>
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
        </>
      )}

      {/* ---------- Paso 5: listo ---------- */}
      {paso === 'listo' && resultado && (
        <>
          <div className="max-h-[62vh] space-y-4 overflow-y-auto px-5 py-6">
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <span className="grid h-16 w-16 place-items-center rounded-2xl bg-ink-950 text-on-ink">
                <CheckCircle2 className="h-8 w-8" />
              </span>
              <p className="text-base font-semibold text-ink-950">
                Listo — {sucursal?.nombre} quedó al día
              </p>
              <p className="max-w-sm text-xs text-ink-500">
                Cada cambio de cantidad quedó registrado en el historial del producto, con tu
                usuario y el nombre de la planilla.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              <Tarjeta label="Actualizados" valor={num(resultado.actualizados)} icono={Boxes} />
              <Tarjeta label="Dados de alta" valor={num(resultado.creados)} icono={PackagePlus} />
              <Tarjeta
                label="Unidades"
                valor={`${resultado.unidades_delta >= 0 ? '+' : ''}${num(resultado.unidades_delta)}`}
                icono={resultado.unidades_delta >= 0 ? TrendingUp : TrendingDown}
              />
            </div>
            {resultado.sin_cambio > 0 && (
              <Aviso icono={Check}>
                Otras {num(resultado.sin_cambio)} filas ya tenían esa misma cantidad: quedaron{' '}
                <b>confirmadas</b> (dejan de figurar como «no informado») y por eso no generaron
                movimiento.
              </Aviso>
            )}
            {analisis && analisis.resumen.catalogo_sin_planilla > 0 && (
              <Aviso icono={Info}>
                {num(analisis.resumen.catalogo_sin_planilla)} productos del catálogo no figuran en
                esta planilla: su stock quedó <b>tal cual estaba</b>.
              </Aviso>
            )}
          </div>
          <PieModal>
            <Button variant="outline" onClick={() => setPaso('sucursal')}>
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

const PASOS: Array<{ id: Paso; label: string }> = [
  { id: 'sucursal', label: 'Sucursal' },
  { id: 'archivo', label: 'Archivo' },
  { id: 'revision', label: 'Revisión' },
  { id: 'listo', label: 'Listo' },
]

/** Riel de progreso: en qué acto de la importación estamos. */
function Riel({ paso }: { paso: Paso }) {
  const actual = paso === 'procesando' ? 1 : PASOS.findIndex((p) => p.id === paso)
  return (
    <ol className="mt-3 flex items-center gap-1.5" aria-label="Progreso de la importación">
      {PASOS.map((p, i) => (
        <li key={p.id} className="flex flex-1 items-center gap-1.5">
          <div className="min-w-0 flex-1">
            <span
              className={cn(
                'block h-1 rounded-full transition-colors duration-300',
                i < actual ? 'bg-ink-900' : i === actual ? 'bg-ink-500' : 'bg-ink-100',
              )}
            />
            <span
              className={cn(
                'mt-1 block truncate text-[0.6rem] font-medium uppercase tracking-[0.08em] transition-colors',
                i <= actual ? 'text-ink-600' : 'text-ink-300',
              )}
            >
              {p.label}
            </span>
          </div>
        </li>
      ))}
    </ol>
  )
}

/** Pantalla de procesado: dice en qué anda, no solo que espere. */
function Procesando({ avance, archivo }: { avance: number; archivo: string }) {
  const etapas = [
    { hasta: 30, texto: 'Leyendo la planilla…' },
    { hasta: 65, texto: 'Cruzando cada fila con el catálogo…' },
    { hasta: 95, texto: 'Calculando el antes y el después…' },
    { hasta: 101, texto: '¡Listo! Preparando la revisión…' },
  ]
  const etapa = etapas.find((e) => avance < e.hasta) ?? etapas[etapas.length - 1]
  return (
    <div className="flex flex-col items-center gap-5 px-6 py-14 text-center">
      <span className="relative grid h-20 w-20 place-items-center">
        <span className="absolute inset-0 animate-ping rounded-2xl bg-ink-100 motion-reduce:animate-none" />
        <span className="relative grid h-16 w-16 place-items-center rounded-2xl bg-ink-950 text-on-ink">
          <Sparkles className="h-7 w-7" />
        </span>
      </span>
      <div>
        <p className="text-sm font-semibold text-ink-900">{etapa.texto}</p>
        <p className="mt-1 max-w-xs truncate text-xs text-ink-400">{archivo}</p>
      </div>
      <div className="w-full max-w-sm">
        <div className="h-1.5 overflow-hidden rounded-full bg-ink-100">
          <div
            className="h-full rounded-full bg-ink-950 transition-[width] duration-300 ease-out"
            style={{ width: `${Math.min(100, avance)}%` }}
          />
        </div>
        <p className="tnum mt-1.5 text-[0.7rem] text-ink-400">{Math.round(Math.min(100, avance))} %</p>
      </div>
      <p className="max-w-xs text-xs text-ink-400">
        Todavía no se tocó ningún stock: primero vas a poder revisar fila por fila.
      </p>
    </div>
  )
}

function FilaRevision({
  fila,
  estado,
  decision,
  productoElegido,
  aplicable,
  admin,
  onCambiar,
}: {
  fila: FilaImportacion
  estado: EstadoFilaImportacion
  decision: Decision | undefined
  productoElegido: number | null
  aplicable: boolean
  admin: boolean
  onCambiar: (cambio: Partial<Decision>) => void
}) {
  const info = ESTADO_INFO[estado]
  const marcada = decision?.marcada ?? false
  const antes = fila.cantidad_actual
  const despues = fila.cantidad_nueva
  const delta = despues !== null && antes !== null ? despues - antes : null
  const nombre = fila.producto_nombre || fila.nombre_planilla
  const renombrado =
    fila.producto_nombre && fila.producto_nombre.trim() !== fila.nombre_planilla.trim()
  const repetida = fila.duplicada_con.length > 0

  return (
    <li
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 transition-colors sm:px-5 md:flex-nowrap',
        marcada && 'bg-ink-50/50',
        !aplicable && 'opacity-70',
      )}
    >
      <label className="flex shrink-0 cursor-pointer items-center">
        <input
          type="checkbox"
          checked={marcada}
          disabled={!aplicable}
          onChange={(e) => onCambiar({ marcada: e.target.checked })}
          aria-label={`Importar ${nombre}`}
          className="h-4.5 w-4.5 cursor-pointer rounded border-line-strong text-ink-950 accent-ink-950 disabled:cursor-not-allowed disabled:opacity-30"
        />
      </label>

      <div className="min-w-0 flex-1 basis-[60%] md:basis-auto">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="truncate text-sm font-medium text-ink-900">{nombre}</p>
          {fila.confianza === 'aproximada' && (
            <span
              title="El nombre no era idéntico: revisá que sea el producto correcto."
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line-strong px-1.5 py-0.5 text-[0.6rem] font-medium text-ink-500"
            >
              <AlertTriangle className="h-3 w-3" aria-hidden />
              aproximado
            </span>
          )}
          {repetida && (
            <span
              title="Otra fila de la planilla apunta al mismo producto del catálogo."
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-ink-900 px-1.5 py-0.5 text-[0.6rem] font-medium text-ink-900"
            >
              <Copy className="h-3 w-3" aria-hidden />
              repetido
            </span>
          )}
        </div>
        <p className="truncate text-xs text-ink-400">
          <span className="tnum">fila {fila.fila}</span>
          {fila.seccion && ` · ${fila.seccion}`}
          {renombrado && ` · planilla: "${fila.nombre_planilla}"`}
        </p>
        {fila.motivo && (estado !== 'actualiza' || repetida) && (
          <p className="mt-0.5 text-xs text-ink-500">{fila.motivo}</p>
        )}
        {estado === 'nueva' && !admin && (
          <p className="mt-0.5 text-xs text-ink-500">
            Dar de alta un producto lo hace un administrador.
          </p>
        )}
        {fila.candidatos.length > 0 && (
          <div className="mt-1.5 max-w-sm">
            <Select
              options={fila.candidatos.map((c) => ({
                value: String(c.id),
                label: `${c.nombre}${c.detalle ? ` · ${c.detalle}` : ''} (${c.categoria})`,
              }))}
              value={productoElegido ? String(productoElegido) : ''}
              onChange={(v) => onCambiar({ producto: Number(v), marcada: true })}
              placeholder="Elegí cuál de estos es"
            />
          </div>
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

      <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-0 md:w-[10.5rem] md:justify-end">
        <span
          className="tnum w-9 text-right text-sm text-ink-400"
          title={fila.sin_dato_actual ? 'Hoy figura como (no informado)' : 'Lo que hay hoy'}
        >
          {antes === null || fila.sin_dato_actual ? '—' : num(antes)}
        </span>
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-300" aria-hidden />
        <span
          className={cn(
            'tnum w-9 text-right text-sm font-bold',
            despues === null ? 'text-ink-300' : 'text-ink-950',
          )}
          title="Lo que dice la planilla"
        >
          {despues === null ? '—' : num(despues)}
        </span>
        <span className="w-11 shrink-0 text-right">
          {delta !== null && delta !== 0 && (
            <span
              className={cn(
                'tnum inline-flex items-center rounded-full px-1.5 py-0.5 text-[0.65rem] font-semibold',
                delta > 0 ? 'bg-ink-900 text-on-ink' : 'border border-line-strong text-ink-600',
              )}
            >
              {delta > 0 ? '+' : ''}
              {num(delta)}
            </span>
          )}
        </span>
      </div>
    </li>
  )
}

function Tarjeta({
  label,
  valor,
  detalle,
  icono: Icono,
}: {
  label: string
  valor: string
  detalle?: string
  icono: typeof Boxes
}) {
  return (
    <div className="rounded-xl border border-line bg-canvas/40 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-ink-400">
          {label}
        </p>
        <Icono className="h-3.5 w-3.5 shrink-0 text-ink-400" aria-hidden />
      </div>
      <p className="tnum mt-0.5 text-lg font-bold leading-none text-ink-950">{valor}</p>
      {detalle && <p className="mt-1 truncate text-[0.65rem] text-ink-400">{detalle}</p>}
    </div>
  )
}

function Aviso({ icono: Icono, children }: { icono: typeof Info; children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-xl bg-ink-50 px-3 py-2.5 text-xs text-ink-600">
      <Icono className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" aria-hidden />
      <span>{children}</span>
    </p>
  )
}

function PieModal({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col-reverse gap-2.5 border-t border-line px-5 py-4 sm:flex-row sm:justify-end">
      {children}
    </div>
  )
}
