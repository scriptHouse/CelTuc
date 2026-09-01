/**
 * Exportador genérico de gestores — el DATASET.
 *
 * Acá se resuelve, una sola vez, todo lo que después consumen los tres
 * generadores: qué filas entran, qué columnas salen, cómo se ordenan, cómo se
 * agrupan y cuánto suma cada columna totalizable. Los generadores no vuelven a
 * mirar al gestor: leen esto y pintan.
 *
 * Cada columna se resuelve a su valor CRUDO (un número es un número, no un
 * texto con signo pesos): el Excel recibe celdas numéricas de verdad y el
 * PDF/CSV formatean recién al imprimir, cada uno con su regla.
 */
import type {
  ColumnaTabla,
  ConfigExportTabla,
  GestorExport,
  GrupoTabla,
  TipoColumnaTabla,
} from './tipos'

/* ===================== Formas ===================== */

export interface ColumnaResueltaTabla<T = unknown> {
  id: string
  label: string
  corto: string
  tipo: TipoColumnaTabla
  peso: number
  align: 'left' | 'right' | 'center'
  valor: (fila: T) => string | number | null
  totalizable: boolean
}

export interface TotalesTabla {
  /** Cantidad de filas. */
  n: number
  /** Suma por id de columna (solo las totalizables). */
  sumas: Record<string, number>
}

export interface GrupoResueltoTabla<T = unknown> {
  clave: string
  titulo: string
  filas: T[]
  totales: TotalesTabla
}

export interface MetaExportTabla {
  titulo: string
  subtitulo: string
  generado: Date
  usuario: string
  alcanceTexto: string
  /** Los filtros de la pantalla, en castellano, para dejar constancia. */
  contexto: string[]
}

export interface DatasetTabla<T = unknown> {
  columnas: ColumnaResueltaTabla<T>[]
  grupos: GrupoResueltoTabla<T>[]
  filas: T[]
  totales: TotalesTabla
  meta: MetaExportTabla
  config: ConfigExportTabla
  /** Data URI del logo (solo si la exportación va con logo). */
  logo?: string
  agrupado: boolean
  /** Rótulo del agrupador activo ("Categoría"), para el CSV crudo. */
  grupoLabel: string
}

export interface FuentesTabla<T = unknown> {
  /** Las filas tal como se ven en pantalla (con los filtros aplicados). */
  filasVista: T[]
  /** El listado completo, sin los filtros de pantalla. Si falta, no hay alcance. */
  filasTodas?: T[]
  /** Cómo describir en el archivo los filtros de la pantalla. */
  contexto: string[]
  usuario: string
}

/* ===================== Helpers ===================== */

const ALIGN_POR_TIPO: Record<TipoColumnaTabla, 'left' | 'right' | 'center'> = {
  texto: 'left',
  entero: 'right',
  decimal: 'right',
  ars: 'right',
  usd: 'right',
  pct: 'right',
  fecha: 'center',
  fechahora: 'center',
}

export const esNumerica = (tipo: TipoColumnaTabla) =>
  tipo === 'entero' || tipo === 'decimal' || tipo === 'ars' || tipo === 'usd' || tipo === 'pct'

/* ===================== Construcción ===================== */

export function construirDatasetTabla<T>(
  config: ConfigExportTabla,
  gestor: GestorExport<T>,
  fuentes: FuentesTabla<T>,
  extras: { logo?: string; generado?: Date } = {},
): DatasetTabla<T> {
  const porId = new Map(gestor.columnas.map((c) => [c.id, c]))

  /* ---- 1. Filas ---- */
  const hayTodas = Array.isArray(fuentes.filasTodas)
  const base =
    config.alcance === 'todo' && hayTodas ? fuentes.filasTodas! : fuentes.filasVista
  const filas = [...base]

  /* ---- 2. Orden ---- */
  const colOrden = config.ordenCol ? porId.get(config.ordenCol) : undefined
  if (colOrden) {
    const dir = config.ordenDir === 'desc' ? -1 : 1
    const numerica = esNumerica(colOrden.tipo)
    filas.sort((a, b) => {
      const va = colOrden.valor(a)
      const vb = colOrden.valor(b)
      // Vacíos siempre al final, sin importar la dirección.
      if (va === null || va === '') return vb === null || vb === '' ? 0 : 1
      if (vb === null || vb === '') return -1
      if (numerica) return (Number(va) - Number(vb)) * dir
      return String(va).localeCompare(String(vb), 'es', { numeric: true }) * dir
    })
  }

  /* ---- 3. Columnas ---- */
  const columnas = resolverColumnasTabla(config, gestor)

  /* ---- 4. Grupos ---- */
  const grupo = config.agruparPor
    ? gestor.grupos?.find((g) => g.id === config.agruparPor)
    : undefined
  const agrupado = Boolean(grupo)
  const grupos = agruparFilasTabla(filas, columnas, grupo)

  /* ---- 5. Totales y metadatos ---- */
  const totales = sumarTabla(filas, columnas)
  const meta: MetaExportTabla = {
    titulo: config.titulo.trim() || gestor.titulo,
    subtitulo: config.subtitulo.trim(),
    generado: extras.generado ?? new Date(),
    usuario: fuentes.usuario,
    alcanceTexto:
      config.alcance === 'todo' && hayTodas
        ? 'El listado completo'
        : hayTodas
          ? 'Lo que se veía en pantalla'
          : 'Lo cargado en pantalla',
    contexto:
      config.alcance === 'todo' && hayTodas
        ? ['Sin filtros: el listado completo']
        : fuentes.contexto.length
          ? fuentes.contexto
          : ['Sin filtros'],
  }

  return {
    columnas,
    grupos,
    filas,
    totales,
    meta,
    config,
    logo: config.conLogo ? extras.logo : undefined,
    agrupado,
    grupoLabel: grupo?.label ?? '',
  }
}

function resolverColumnasTabla<T>(
  config: ConfigExportTabla,
  gestor: GestorExport<T>,
): ColumnaResueltaTabla<T>[] {
  const porId = new Map(gestor.columnas.map((c) => [c.id, c]))
  const resolver = (def: ColumnaTabla<T>): ColumnaResueltaTabla<T> => ({
    id: def.id,
    label: def.label,
    corto: def.corto ?? def.label,
    tipo: def.tipo,
    peso: def.peso,
    align: ALIGN_POR_TIPO[def.tipo],
    valor: def.valor,
    totalizable: Boolean(def.totalizable),
  })

  const salida: ColumnaResueltaTabla<T>[] = []
  for (const id of config.columnas) {
    const def = porId.get(id)
    if (def) salida.push(resolver(def))
  }
  // La primera columna del catálogo es el ancla de la tabla: si alguien la
  // sacó, vuelve al frente. Un export sin la columna que nombra no sirve.
  const ancla = gestor.columnas[0]
  if (ancla && !salida.some((c) => c.id === ancla.id)) {
    salida.unshift(resolver(ancla))
  }
  return salida
}

function agruparFilasTabla<T>(
  filas: T[],
  columnas: ColumnaResueltaTabla<T>[],
  grupo: GrupoTabla<T> | undefined,
): GrupoResueltoTabla<T>[] {
  if (!grupo) {
    return [{ clave: '', titulo: '', filas, totales: sumarTabla(filas, columnas) }]
  }
  // Los grupos salen en el orden en que aparecen sus filas: es el orden que la
  // pantalla (o el orden elegido) ya les dio.
  const mapa = new Map<string, T[]>()
  for (const fila of filas) {
    const clave = grupo.valor(fila).trim() || 'Sin dato'
    const lista = mapa.get(clave)
    if (lista) lista.push(fila)
    else mapa.set(clave, [fila])
  }
  return [...mapa.entries()].map(([titulo, filasGrupo]) => ({
    clave: titulo,
    titulo,
    filas: filasGrupo,
    totales: sumarTabla(filasGrupo, columnas),
  }))
}

function sumarTabla<T>(filas: T[], columnas: ColumnaResueltaTabla<T>[]): TotalesTabla {
  const sumas: Record<string, number> = {}
  for (const c of columnas) {
    if (!c.totalizable || !esNumerica(c.tipo)) continue
    let suma = 0
    for (const fila of filas) {
      const v = c.valor(fila)
      if (v === null || v === '') continue
      const n = Number(v)
      if (!Number.isNaN(n)) suma += n
    }
    sumas[c.id] = suma
  }
  return { n: filas.length, sumas }
}

/* ===================== Formateo compartido ===================== */

const NUM_AR = new Intl.NumberFormat('es-AR')
const DEC_AR = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const ARS_AR = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
const USD_AR = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })

/** Texto de una celda para el PDF, la vista previa y el CSV formateado. */
export function textoCeldaTabla(valor: string | number | null, tipo: TipoColumnaTabla): string {
  if (valor === null || valor === '') return ''
  if (tipo === 'texto') return String(valor)
  if (tipo === 'fecha' || tipo === 'fechahora') {
    const d = new Date(String(valor))
    if (Number.isNaN(d.getTime())) return String(valor)
    const dia = d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    if (tipo === 'fecha') return dia
    return `${dia} ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`
  }
  const n = Number(valor)
  if (Number.isNaN(n)) return String(valor)
  if (tipo === 'entero') return NUM_AR.format(n)
  if (tipo === 'decimal') return DEC_AR.format(n)
  if (tipo === 'ars') return ARS_AR.format(n)
  if (tipo === 'usd') return USD_AR.format(n)
  if (tipo === 'pct') return `${NUM_AR.format(Math.round(n))}%`
  return String(valor)
}

/** Nombre de archivo con los tokens resueltos y sin caracteres prohibidos. */
export function resolverNombreArchivoTabla(
  plantilla: string,
  datos: { filas: number; fecha: Date; extension: string; base: string },
): string {
  const dosDigitos = (n: number) => String(n).padStart(2, '0')
  const { fecha } = datos
  const reemplazos: Record<string, string> = {
    fecha: `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}`,
    hora: `${dosDigitos(fecha.getHours())}${dosDigitos(fecha.getMinutes())}`,
    n: String(datos.filas),
  }
  const base = plantilla
    .replace(/\{(\w+)\}/g, (coincidencia, token: string) => reemplazos[token] ?? coincidencia)
    .normalize('NFD')
    .replace(/[^\w\s.-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return `${base || datos.base}.${datos.extension}`
}
