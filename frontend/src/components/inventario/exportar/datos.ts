/**
 * Exportador de Inventario — el DATASET.
 *
 * Acá se resuelve, una sola vez, todo lo que después consumen los tres
 * generadores: qué filas entran, qué columnas salen, cómo se agrupan, cuánto
 * suma cada grupo y qué contar en el resumen. Los generadores no vuelven a
 * mirar productos ni stock: leen esto y pintan.
 *
 * Cada columna se resuelve a su valor CRUDO (un número es un número, no un
 * texto con signo pesos): así el Excel recibe celdas numéricas de verdad —con
 * sus formatos, sus fórmulas y sus barras— y el PDF/CSV formatean recién al
 * imprimir, cada uno con su regla.
 */
import type { CategoriaCatalogo, ProductoCatalogo } from '@/types'
import type { StockRow, Sucursal } from '@/services/inventario'
import {
  COLUMNAS_POR_ID,
  colSucursal,
  esColSucursal,
  idDeColSucursal,
  type ConfigExport,
  type DefinicionColumna,
  type TipoColumna,
} from './tipos'

/* ===================== Formas ===================== */

export interface FilaExport {
  producto: ProductoCatalogo
  categoria?: CategoriaCatalogo
  raiz?: CategoriaCatalogo
  /** Solo en disposición larga: la sucursal a la que corresponde esta fila. */
  sucursal?: Sucursal
  /** Fila de stock por sucursal (undefined = nunca se cargó nada ahí). */
  porSucursal: Map<number, StockRow | undefined>
  total: number
  minimo: number | null
  /** Cuánto falta para llegar al mínimo (0 si está por encima). */
  faltante: number
  bajoMinimo: boolean
  sinDato: boolean
  valorLista: number
  valorCash: number
  valorCostoUsd: number
  actualizado: string | null
  estado: string
}

export interface GrupoExport {
  clave: string
  titulo: string
  filas: FilaExport[]
  totales: TotalesExport
}

export interface TotalesExport {
  productos: number
  unidades: number
  valorLista: number
  valorCash: number
  valorCostoUsd: number
  bajoMinimo: number
  sinStock: number
  sinDato: number
  faltante: number
}

export interface ColumnaResuelta {
  id: string
  label: string
  corto: string
  tipo: TipoColumna
  peso: number
  align: 'left' | 'right' | 'center'
  /** Valor crudo de la celda. `null` = vacía. */
  valor: (fila: FilaExport) => string | number | null
  /** Cómo se totaliza la columna en subtotales y total general. */
  total?: (t: TotalesExport) => number | null
  /** La columna se deja vacía a propósito (conteo físico). */
  blanca?: boolean
}

export interface CorteResumen {
  nombre: string
  productos: number
  unidades: number
  valorLista: number
  valorCash: number
  bajoMinimo: number
}

export interface MetaExport {
  titulo: string
  subtitulo: string
  generado: Date
  usuario: string
  sucursalesTexto: string
  alcanceTexto: string
  /** Los filtros aplicados, en castellano, para dejar constancia en el archivo. */
  filtros: string[]
}

export interface Dataset {
  columnas: ColumnaResuelta[]
  grupos: GrupoExport[]
  filas: FilaExport[]
  totales: TotalesExport
  meta: MetaExport
  sucursales: Sucursal[]
  cortes: { porCategoria: CorteResumen[]; porMarca: CorteResumen[]; porSucursal: CorteResumen[] }
  config: ConfigExport
  /** Data URI del logo (solo si la exportación va con logo). */
  logo?: string
  agrupado: boolean
}

export interface FuentesExport {
  productos: ProductoCatalogo[]
  categorias: CategoriaCatalogo[]
  stock: StockRow[]
  /** Sucursales activas del negocio, ya ordenadas. */
  sucursales: Sucursal[]
  admin: boolean
  usuario: string
  /** Ids de productos a la vista en pantalla (para el alcance «lo que estoy viendo»). */
  idsVisibles: number[]
  /** Cómo describir en el archivo los filtros de la pantalla. */
  contextoVista: string[]
}

/* ===================== Columnas dinámicas ===================== */

/** Las definiciones de stock por sucursal (una por sucursal elegida). */
export function columnasDeSucursales(sucursales: Sucursal[]): DefinicionColumna[] {
  return sucursales.map((s) => ({
    id: colSucursal(s.id),
    label: s.nombre,
    corto: s.nombre,
    familia: 'stock' as const,
    tipo: 'entero' as const,
    peso: 11,
    ayuda: `Unidades en ${s.nombre}.`,
  }))
}

/** Definición de cualquier id, fija o de sucursal. */
export function definicionDe(id: string, sucursales: Sucursal[]): DefinicionColumna | undefined {
  if (esColSucursal(id)) {
    const s = sucursales.find((x) => x.id === idDeColSucursal(id))
    return s ? columnasDeSucursales([s])[0] : undefined
  }
  return COLUMNAS_POR_ID.get(id)
}

/* ===================== Helpers ===================== */

const ALIGN_POR_TIPO: Record<TipoColumna, 'left' | 'right' | 'center'> = {
  texto: 'left',
  entero: 'right',
  ars: 'right',
  usd: 'right',
  pct: 'right',
  fecha: 'center',
  blanco: 'center',
}

function estadoDe(total: number, minimo: number | null, sinDato: boolean): string {
  if (sinDato && total === 0) return 'No informado'
  if (total <= 0) return 'Sin stock'
  if (minimo !== null && total <= minimo) return 'Bajo mínimo'
  return 'OK'
}

const numeroOCero = (v: number | null | undefined) => (v == null ? 0 : Number(v))

/* ===================== Construcción ===================== */

export function construirDataset(
  config: ConfigExport,
  fuentes: FuentesExport,
  extras: { logo?: string; generado?: Date } = {},
): Dataset {
  const { productos, categorias, stock, admin } = fuentes

  const categoriaPorId = new Map(categorias.map((c) => [c.id, c]))
  const raizDe = (c?: CategoriaCatalogo) => (c?.padre != null ? categoriaPorId.get(c.padre) : c)

  // Sucursales elegidas (vacío = todas las activas), en el orden del negocio.
  const elegidas = config.sucursales.length
    ? fuentes.sucursales.filter((s) => config.sucursales.includes(s.id))
    : fuentes.sucursales
  const sucursales = elegidas.length ? elegidas : fuentes.sucursales

  // producto -> sucursal -> fila de stock
  const indice = new Map<number, Map<number, StockRow>>()
  for (const r of stock) {
    let porSuc = indice.get(r.producto)
    if (!porSuc) indice.set(r.producto, (porSuc = new Map()))
    porSuc.set(r.sucursal, r)
  }

  const visibles = new Set(fuentes.idsVisibles)

  /* ---- 1. Filas base (una por producto, agregando las sucursales elegidas) ---- */
  const base: FilaExport[] = []
  for (const p of productos) {
    if (!p.activo && !config.filtros.incluirInactivos) continue
    if (config.alcance === 'vista' && !visibles.has(p.id)) continue
    if (!config.filtros.incluirAPedido && p.a_pedido) continue

    const porSucursal = new Map<number, StockRow | undefined>()
    let total = 0
    let minimo: number | null = null
    let bajoMinimo = false
    let sinDato = false
    let actualizado: string | null = null
    for (const s of sucursales) {
      const fila = indice.get(p.id)?.get(s.id)
      porSucursal.set(s.id, fila)
      if (!fila) continue
      total += fila.cantidad
      if (fila.stock_minimo !== null) {
        minimo = (minimo ?? 0) + fila.stock_minimo
        if (fila.cantidad <= fila.stock_minimo) bajoMinimo = true
      }
      if (fila.sin_dato && fila.cantidad === 0) sinDato = true
      if (!actualizado || fila.actualizado > actualizado) actualizado = fila.actualizado
    }

    const lista = numeroOCero(p.efectivo?.lista_ars)
    const cash = numeroOCero(p.efectivo?.cash_ars)
    const costo = admin ? numeroOCero(p.costo_usd) : 0
    const unidadesValorizables = Math.max(0, total)

    base.push({
      producto: p,
      categoria: categoriaPorId.get(p.categoria),
      raiz: raizDe(categoriaPorId.get(p.categoria)),
      porSucursal,
      total,
      minimo,
      faltante: minimo !== null ? Math.max(0, minimo - total) : 0,
      bajoMinimo,
      sinDato,
      valorLista: unidadesValorizables * lista,
      valorCash: unidadesValorizables * cash,
      valorCostoUsd: unidadesValorizables * costo,
      actualizado,
      estado: estadoDe(total, minimo, sinDato),
    })
  }

  /* ---- 2. Refinamientos a nivel producto ---- */
  const f = config.filtros
  let filas = base.filter((fila) => {
    if (f.soloBajoMinimo && !fila.bajoMinimo) return false
    if (f.soloNoInformado && !fila.sinDato) return false
    if (f.soloConPrecio && !fila.producto.efectivo?.lista_ars && !fila.producto.efectivo?.cash_ars) {
      return false
    }
    // En disposición larga el «solo con stock» se aplica recién sobre cada
    // renglón producto × sucursal (más abajo): acá se descartan solo los
    // productos que no tienen NADA en ninguna de las sucursales elegidas.
    if (f.soloConStock && fila.total <= 0) return false
    return true
  })

  /* ---- 3. Disposición larga: un renglón por producto × sucursal ---- */
  const larga = config.disposicion === 'larga'
  if (larga) {
    const expandidas: FilaExport[] = []
    for (const fila of filas) {
      for (const s of sucursales) {
        const row = fila.porSucursal.get(s.id)
        const cantidad = row?.cantidad ?? 0
        const min = row?.stock_minimo ?? null
        const sd = Boolean(row?.sin_dato) && cantidad === 0
        if (f.soloConStock && cantidad <= 0) continue
        if (f.soloBajoMinimo && !(min !== null && cantidad <= min)) continue
        if (f.soloNoInformado && !sd) continue
        const lista = numeroOCero(fila.producto.efectivo?.lista_ars)
        const cash = numeroOCero(fila.producto.efectivo?.cash_ars)
        const costo = admin ? numeroOCero(fila.producto.costo_usd) : 0
        const valorizables = Math.max(0, cantidad)
        expandidas.push({
          ...fila,
          sucursal: s,
          total: cantidad,
          minimo: min,
          faltante: min !== null ? Math.max(0, min - cantidad) : 0,
          bajoMinimo: min !== null && cantidad <= min,
          sinDato: sd,
          valorLista: valorizables * lista,
          valorCash: valorizables * cash,
          valorCostoUsd: valorizables * costo,
          actualizado: row?.actualizado ?? null,
          estado: estadoDe(cantidad, min, sd),
        })
      }
    }
    filas = expandidas
  }

  /* ---- 4. Orden ---- */
  const porNombre = (a: FilaExport, b: FilaExport) =>
    a.producto.nombre.localeCompare(b.producto.nombre, 'es')
  const comparadores: Record<ConfigExport['orden'], (a: FilaExport, b: FilaExport) => number> = {
    catalogo: (a, b) => a.producto.orden - b.producto.orden || porNombre(a, b),
    nombre: porNombre,
    stock_desc: (a, b) => b.total - a.total || porNombre(a, b),
    stock_asc: (a, b) => a.total - b.total || porNombre(a, b),
    valor_desc: (a, b) => b.valorCash - a.valorCash || porNombre(a, b),
    faltante_desc: (a, b) => b.faltante - a.faltante || porNombre(a, b),
  }
  filas = [...filas].sort(comparadores[config.orden] ?? porNombre)

  /* ---- 5. Columnas ---- */
  const columnas = resolverColumnas(config, sucursales, admin, larga)

  /* ---- 6. Grupos ---- */
  // Agrupar por sucursal solo tiene sentido cuando cada fila ES una sucursal.
  const agruparPor =
    config.agruparPor === 'sucursal' && !larga ? 'ninguno' : config.agruparPor
  const agrupado = agruparPor !== 'ninguno'
  const grupos = agruparFilas(filas, agruparPor)

  /* ---- 7. Totales y cortes ---- */
  const totales = sumar(filas)
  const cortes = {
    porCategoria: cortesDe(filas, (fila) => fila.raiz?.nombre ?? 'Sin categoría'),
    porMarca: cortesDe(filas, (fila) => fila.producto.marca.trim() || 'Sin marca'),
    porSucursal: cortesPorSucursal(filas, sucursales, larga),
  }

  /* ---- 8. Metadatos ---- */
  const meta: MetaExport = {
    titulo: config.titulo.trim() || 'Inventario',
    subtitulo: config.subtitulo.trim(),
    generado: extras.generado ?? new Date(),
    usuario: fuentes.usuario,
    sucursalesTexto:
      sucursales.length === fuentes.sucursales.length && fuentes.sucursales.length > 1
        ? 'Todas las sucursales'
        : sucursales.map((s) => s.nombre).join(' · ') || '—',
    alcanceTexto: config.alcance === 'vista' ? 'Lo que se veía en pantalla' : 'Todo el catálogo',
    filtros: describirFiltros(config, fuentes),
  }

  return {
    columnas,
    grupos,
    filas,
    totales,
    meta,
    sucursales,
    cortes,
    config,
    logo: config.conLogo ? extras.logo : undefined,
    agrupado,
  }
}

/* ===================== Columnas ===================== */

function resolverColumnas(
  config: ConfigExport,
  sucursales: Sucursal[],
  admin: boolean,
  larga: boolean,
): ColumnaResuelta[] {
  const elegidasIds = new Set(sucursales.map((s) => s.id))
  const salida: ColumnaResuelta[] = []

  for (const id of config.columnas) {
    if (esColSucursal(id)) {
      // Las columnas por sucursal son de la disposición ancha; en la larga esa
      // información ya está en la columna «Sucursal» + «Stock».
      if (larga) continue
      const sucursalId = idDeColSucursal(id)
      if (!elegidasIds.has(sucursalId)) continue
      const s = sucursales.find((x) => x.id === sucursalId)!
      salida.push({
        id,
        label: s.nombre,
        corto: s.nombre,
        tipo: 'entero',
        peso: 11,
        align: 'right',
        valor: (fila) => fila.porSucursal.get(s.id)?.cantidad ?? 0,
        total: () => null,
      })
      continue
    }

    const def = COLUMNAS_POR_ID.get(id)
    if (!def) continue
    if (def.soloAdmin && !admin) continue
    if (def.soloLarga && !larga) continue

    const comun = {
      id: def.id,
      label: def.label,
      corto: def.corto ?? def.label,
      tipo: def.tipo,
      peso: def.peso,
      align: ALIGN_POR_TIPO[def.tipo],
    }
    salida.push({ ...comun, ...resolutorDe(def.id) })
  }

  // La columna del producto es el ancla de toda la tabla: si alguien la sacó de
  // la lista, vuelve al frente. Un export sin nombre no le sirve a nadie.
  if (!salida.some((c) => c.id === 'producto')) {
    const def = COLUMNAS_POR_ID.get('producto')!
    salida.unshift({
      id: def.id,
      label: def.label,
      corto: def.label,
      tipo: def.tipo,
      peso: def.peso,
      align: 'left',
      ...resolutorDe('producto'),
    })
  }
  return salida
}

/** El cómo se saca el valor (y el total) de cada columna fija. */
function resolutorDe(id: string): Pick<ColumnaResuelta, 'valor' | 'total' | 'blanca'> {
  switch (id) {
    case 'producto':
      return { valor: (f) => f.producto.nombre }
    case 'marca':
      return { valor: (f) => f.producto.marca || '' }
    case 'calidad':
      return { valor: (f) => f.producto.calidad || '' }
    case 'nota':
      return { valor: (f) => f.producto.nota || '' }
    case 'categoria':
      return { valor: (f) => f.raiz?.nombre ?? '' }
    case 'subcategoria':
      return { valor: (f) => (f.categoria?.id === f.raiz?.id ? '' : (f.categoria?.nombre ?? '')) }
    case 'a_pedido':
      return { valor: (f) => (f.producto.a_pedido ? 'Sí' : 'No') }
    case 'id':
      return { valor: (f) => f.producto.id }
    case 'sucursal':
      return { valor: (f) => f.sucursal?.nombre ?? '' }
    case 'lista_ars':
      return { valor: (f) => f.producto.efectivo?.lista_ars ?? null }
    case 'cash_ars':
      return { valor: (f) => f.producto.efectivo?.cash_ars ?? null }
    case 'lista_usd':
      return { valor: (f) => f.producto.efectivo?.lista_usd ?? null }
    case 'cash_usd':
      return { valor: (f) => f.producto.efectivo?.cash_usd ?? null }
    case 'costo_usd':
      return { valor: (f) => f.producto.costo_usd ?? null }
    case 'margen':
      return {
        valor: (f) => {
          const lista = Number(f.producto.efectivo?.lista_usd ?? 0)
          const costo = Number(f.producto.costo_usd ?? 0)
          if (!lista || !costo) return null
          return ((lista - costo) / lista) * 100
        },
      }
    case 'total':
      return { valor: (f) => f.total, total: (t) => t.unidades }
    case 'minimo':
      return { valor: (f) => f.minimo }
    case 'faltante':
      return { valor: (f) => f.faltante, total: (t) => t.faltante }
    case 'estado':
      return { valor: (f) => f.estado }
    case 'conteo':
      return { valor: () => null, blanca: true }
    case 'diferencia':
      return { valor: () => null, blanca: true }
    case 'valor_lista':
      return { valor: (f) => f.valorLista, total: (t) => t.valorLista }
    case 'valor_cash':
      return { valor: (f) => f.valorCash, total: (t) => t.valorCash }
    case 'valor_costo':
      return { valor: (f) => f.valorCostoUsd, total: (t) => t.valorCostoUsd }
    case 'actualizado':
      return { valor: (f) => f.actualizado }
    default:
      return { valor: () => null }
  }
}

/* ===================== Agrupación y totales ===================== */

function agruparFilas(filas: FilaExport[], por: ConfigExport['agruparPor']): GrupoExport[] {
  if (por === 'ninguno') {
    return [{ clave: '', titulo: '', filas, totales: sumar(filas) }]
  }
  const clave = (f: FilaExport) => {
    if (por === 'marca') return f.producto.marca.trim() || 'Sin marca'
    if (por === 'sucursal') return f.sucursal?.nombre ?? 'Sin sucursal'
    return f.raiz?.nombre ?? 'Sin categoría'
  }
  const orden = (f: FilaExport) => {
    if (por === 'categoria') return f.raiz?.orden ?? 9999
    if (por === 'sucursal') return f.sucursal?.orden ?? 9999
    return 0
  }
  const mapa = new Map<string, { orden: number; filas: FilaExport[] }>()
  for (const fila of filas) {
    const k = clave(fila)
    let grupo = mapa.get(k)
    if (!grupo) mapa.set(k, (grupo = { orden: orden(fila), filas: [] }))
    grupo.filas.push(fila)
  }
  return [...mapa.entries()]
    .sort((a, b) => a[1].orden - b[1].orden || a[0].localeCompare(b[0], 'es'))
    .map(([titulo, g]) => ({ clave: titulo, titulo, filas: g.filas, totales: sumar(g.filas) }))
}

function sumar(filas: FilaExport[]): TotalesExport {
  const t: TotalesExport = {
    productos: filas.length,
    unidades: 0,
    valorLista: 0,
    valorCash: 0,
    valorCostoUsd: 0,
    bajoMinimo: 0,
    sinStock: 0,
    sinDato: 0,
    faltante: 0,
  }
  for (const f of filas) {
    t.unidades += f.total
    t.valorLista += f.valorLista
    t.valorCash += f.valorCash
    t.valorCostoUsd += f.valorCostoUsd
    t.faltante += f.faltante
    if (f.bajoMinimo) t.bajoMinimo += 1
    if (f.total <= 0 && !f.sinDato) t.sinStock += 1
    if (f.sinDato) t.sinDato += 1
  }
  return t
}

function cortesDe(filas: FilaExport[], clave: (f: FilaExport) => string): CorteResumen[] {
  const mapa = new Map<string, CorteResumen>()
  for (const f of filas) {
    const k = clave(f)
    let corte = mapa.get(k)
    if (!corte) {
      mapa.set(k, (corte = { nombre: k, productos: 0, unidades: 0, valorLista: 0, valorCash: 0, bajoMinimo: 0 }))
    }
    corte.productos += 1
    corte.unidades += f.total
    corte.valorLista += f.valorLista
    corte.valorCash += f.valorCash
    if (f.bajoMinimo) corte.bajoMinimo += 1
  }
  return [...mapa.values()].sort((a, b) => b.valorCash - a.valorCash || b.unidades - a.unidades)
}

/**
 * Corte por sucursal. En disposición ancha cada fila tiene las N sucursales
 * adentro, así que se recorre el mapa; en la larga, cada fila ya ES una.
 */
function cortesPorSucursal(
  filas: FilaExport[],
  sucursales: Sucursal[],
  larga: boolean,
): CorteResumen[] {
  if (larga) return cortesDe(filas, (f) => f.sucursal?.nombre ?? 'Sin sucursal')
  return sucursales.map((s) => {
    const corte: CorteResumen = {
      nombre: s.nombre,
      productos: 0,
      unidades: 0,
      valorLista: 0,
      valorCash: 0,
      bajoMinimo: 0,
    }
    for (const f of filas) {
      const row = f.porSucursal.get(s.id)
      const cantidad = row?.cantidad ?? 0
      if (cantidad > 0) {
        corte.productos += 1
        corte.unidades += cantidad
        corte.valorLista += cantidad * Number(f.producto.efectivo?.lista_ars ?? 0)
        corte.valorCash += cantidad * Number(f.producto.efectivo?.cash_ars ?? 0)
      }
      if (row && row.stock_minimo !== null && cantidad <= row.stock_minimo) corte.bajoMinimo += 1
    }
    return corte
  })
}

/* ===================== Descripción de los filtros ===================== */

function describirFiltros(config: ConfigExport, fuentes: FuentesExport): string[] {
  const out: string[] = []
  if (config.alcance === 'vista' && fuentes.contextoVista.length) {
    out.push(...fuentes.contextoVista)
  }
  const f = config.filtros
  if (f.soloConStock) out.push('Solo con stock')
  if (f.soloBajoMinimo) out.push('Solo en o bajo el mínimo')
  if (f.soloNoInformado) out.push('Solo «(no informado)»')
  if (f.soloConPrecio) out.push('Solo con precio cargado')
  if (f.incluirInactivos) out.push('Incluye productos dados de baja')
  if (!f.incluirAPedido) out.push('Sin los productos «a pedido»')
  if (!out.length) out.push('Sin filtros: todo el catálogo activo')
  return out
}

/* ===================== Formateo compartido ===================== */

const NUM_AR = new Intl.NumberFormat('es-AR')
const ARS_AR = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
const USD_AR = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })

/** Texto de una celda para el PDF y para el CSV formateado. */
export function textoCelda(valor: string | number | null, tipo: TipoColumna): string {
  if (valor === null || valor === '') return ''
  if (tipo === 'texto') return String(valor)
  if (tipo === 'blanco') return ''
  if (tipo === 'fecha') {
    const d = new Date(String(valor))
    return Number.isNaN(d.getTime())
      ? ''
      : d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }
  const n = Number(valor)
  if (Number.isNaN(n)) return String(valor)
  if (tipo === 'entero') return NUM_AR.format(n)
  if (tipo === 'ars') return ARS_AR.format(n)
  if (tipo === 'usd') return USD_AR.format(n)
  if (tipo === 'pct') return `${NUM_AR.format(Math.round(n))}%`
  return String(valor)
}

/** Nombre de archivo con los tokens resueltos y sin caracteres prohibidos. */
export function resolverNombreArchivo(
  plantilla: string,
  datos: { sucursal: string; vista: string; filas: number; fecha: Date; extension: string },
): string {
  const dosDigitos = (n: number) => String(n).padStart(2, '0')
  const { fecha } = datos
  const reemplazos: Record<string, string> = {
    fecha: `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}`,
    hora: `${dosDigitos(fecha.getHours())}${dosDigitos(fecha.getMinutes())}`,
    sucursal: datos.sucursal,
    vista: datos.vista,
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
  return `${base || 'inventario'}.${datos.extension}`
}

/* ===================== Formato «importador» ===================== */

/**
 * El archivo con el layout que espera «Importar stock»: la planilla del
 * negocio. Es un modo aparte del resto del exportador —columnas, orden y
 * encabezados son fijos, porque los define el importador— y su razón de ser es
 * el viaje de ida y vuelta: se baja el stock de UNA sucursal, se corrige la
 * columna STOCK a mano y se vuelve a subir.
 *
 * Los rótulos son EXACTAMENTE los que busca `backend/inventario/importacion.py`
 * (`PRODUCTOS`, `STOCK`, `STOCK MINIMO`, `PRECIO DE LISTA USD`). Cambiarlos
 * rompe la importación.
 */
export const COLUMNAS_IMPORTADOR = [
  { id: 'categoria', label: '', ancho: 5 },
  { id: 'producto', label: 'PRODUCTOS', ancho: 64.28 },
  { id: 'costo_usd', label: 'COSTO USD', ancho: 21.14 },
  { id: 'costo_ars', label: 'COSTO $', ancho: 21.14 },
  { id: 'lista_usd', label: 'PRECIO DE LISTA USD', ancho: 21.14 },
  { id: 'cash_usd', label: 'PRECIO CASH USD (20% OFF)', ancho: 21.14 },
  { id: 'lista_ars', label: 'PRECIO DE LISTA CREDITO 1-3 CUOTAS  SIN INTERES', ancho: 21.14 },
  { id: 'cash_ars', label: '$/DEBITO/TRANSF (20% OFF)', ancho: 21.14 },
  { id: 'stock', label: 'STOCK', ancho: 21.14 },
  { id: 'minimo', label: 'STOCK MINIMO', ancho: 21.14 },
] as const

/**
 * Las calidades que la planilla del negocio reparte EN COLUMNAS dentro de
 * MÓDULOS: el sub-encabezado las rotula CC / CO / CA y arriba, combinado sobre
 * las tres, va el título del grupo (STOCK, PRECIO DE LISTA USD…). En el
 * catálogo no son parte del nombre sino la calidad del producto:
 * "11 PRO" + "Calidad copia".
 *
 * Las siglas, los nombres y el orden son el CONTRATO con el importador
 * (`CALIDADES_EN_COLUMNA` en `backend/inventario/importacion.py`): si cambian
 * acá, el archivo que se baja deja de volver a entrar.
 */
export const CALIDADES_MODULOS = [
  { sigla: 'CC', calidad: 'Calidad copia' },
  { sigla: 'CO', calidad: 'Calidad original' },
  { sigla: 'CA', calidad: 'Calidad Apple' },
] as const

/** Lo que la planilla sabe de UNA calidad de UN modelo de módulo. */
export interface CeldaModulo {
  costoUsd: number | null
  costoArs: number | null
  listaUsd: number | null
  listaArs: number | null
  /** Unidades en la sucursal elegida. `null` = nunca se informó (celda vacía). */
  stock: number | null
  minimo: number | null
}

/**
 * Los grupos del encabezado de MÓDULOS: cada título se combina sobre las tres
 * calidades, así que el bloque ocupa 2 + 6×3 = 20 columnas (A..T), las mismas
 * que la planilla del negocio.
 */
export const GRUPOS_MODULOS: ReadonlyArray<{ id: keyof CeldaModulo; label: string }> = [
  { id: 'costoUsd', label: 'COSTO USD' },
  { id: 'costoArs', label: 'COSTO $' },
  { id: 'listaUsd', label: 'PRECIO DE LISTA USD' },
  { id: 'listaArs', label: 'PRECIO DE LISTA $' },
  { id: 'stock', label: 'STOCK' },
  { id: 'minimo', label: 'STOCK MINIMO' },
]

/** Un modelo de la matriz de MÓDULOS: una celda por calidad, o null si no existe. */
export interface FilaMatrizImportador {
  nombre: string
  celdas: Array<CeldaModulo | null>
}

/** La categoría que se escribe con las calidades en columnas. */
const CATEGORIA_MATRIZ = 'modulos'

const sinAcentos = (texto: string) =>
  texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()

/** El lugar de esta calidad en la matriz, o -1 si no es una de las tres. */
function columnaDeCalidad(calidad: string): number {
  const buscada = sinAcentos(calidad || '')
  if (!buscada) return -1
  return CALIDADES_MODULOS.findIndex((c) => sinAcentos(c.calidad) === buscada)
}

/** Un renglón de la planilla del importador. */
export interface FilaImportador {
  /** Título de sección: solo va en la PRIMERA fila del grupo (como el original). */
  categoria: string
  nombre: string
  costoUsd: number | null
  costoArs: number | null
  listaUsd: number | null
  cashUsd: number | null
  listaArs: number | null
  cashArs: number | null
  /** Unidades en la sucursal elegida. `null` = nunca se informó (celda vacía). */
  stock: number | null
  minimo: number | null
}

export interface GrupoImportador {
  categoria: string
  filas: FilaImportador[]
  /**
   * MÓDULOS: los productos cuya calidad va en columna. Se escribe como un
   * bloque aparte, con su propio encabezado, DESPUÉS de las filas normales.
   */
  matriz?: FilaMatrizImportador[]
}

/**
 * El nombre con el que la planilla escribe un producto.
 *
 * El catálogo parte el renglón en columnas (nombre + calidad + nota); acá se
 * rearma en el mismo orden en que el importador lo espera, que es una de sus
 * "variantes" exactas: así el archivo que se baja vuelve a entrar sin quedar
 * en «revisar». Ver `_variantes()` en `backend/inventario/importacion.py`.
 */
export function nombreDePlanilla(producto: ProductoCatalogo): string {
  return [producto.nombre, producto.calidad, producto.nota]
    .map((parte) => (parte || '').trim())
    .filter(Boolean)
    .join(' ')
}

/**
 * Arma las filas del formato importador desde el dataset ya filtrado, para la
 * sucursal indicada. Agrupa por categoría raíz, en el orden del catálogo.
 */
export function filasImportador(dataset: Dataset, sucursalId: number | null): GrupoImportador[] {
  const grupos = new Map<string, FilaImportador[]>()
  // MÓDULOS: modelo → una celda por calidad (CC / CO / CA), como la planilla.
  const matriz = new Map<string, Array<CeldaModulo | null>>()
  let categoriaMatriz = ''

  for (const fila of dataset.filas) {
    const producto = fila.producto
    // Sin sucursal elegida (caso raro: ninguna activa) el stock queda vacío,
    // que es justo lo que el importador interpreta como "no informado".
    const stockFila = sucursalId != null ? fila.porSucursal.get(sucursalId) : undefined
    const categoria = fila.raiz?.nombre ?? fila.categoria?.nombre ?? 'SIN CATEGORÍA'
    const lista = producto.efectivo?.lista_usd ?? producto.precio_lista_usd
    const cashUsd = producto.efectivo?.cash_usd ?? producto.precio_cash_usd
    const listaArs = producto.efectivo?.lista_ars ?? producto.precio_lista_ars ?? null
    // «celda vacía no es cero»: una fila que nunca se contó viaja vacía, para
    // que al reimportar no ponga el stock en cero.
    const stock = !stockFila || stockFila.sin_dato ? null : stockFila.cantidad
    const minimo = stockFila?.stock_minimo ?? null

    // En MÓDULOS la calidad no va en el nombre sino en su columna. El producto
    // de esa categoría cuya calidad no es ninguna de las tres (o está vacía) se
    // escribe como un renglón normal: así nada queda afuera del archivo.
    const columna =
      sinAcentos(categoria) === CATEGORIA_MATRIZ ? columnaDeCalidad(producto.calidad) : -1
    if (columna >= 0) {
      categoriaMatriz = categoria
      let celdas = matriz.get(producto.nombre)
      if (!celdas) {
        celdas = CALIDADES_MODULOS.map(() => null)
        matriz.set(producto.nombre, celdas)
      }
      celdas[columna] = {
        costoUsd: producto.costo_usd ?? null,
        costoArs: null, // la planilla lo deja vacío: se calcula aparte
        listaUsd: lista ?? null,
        listaArs,
        stock,
        minimo,
      }
      continue
    }

    const item: FilaImportador = {
      categoria,
      nombre: nombreDePlanilla(producto),
      costoUsd: producto.costo_usd ?? null,
      costoArs: null, // la planilla lo deja vacío: se calcula aparte
      listaUsd: lista ?? null,
      cashUsd: cashUsd ?? null,
      listaArs,
      cashArs: producto.efectivo?.cash_ars ?? producto.precio_cash_ars ?? null,
      stock,
      minimo,
    }
    const actual = grupos.get(categoria)
    if (actual) actual.push(item)
    else grupos.set(categoria, [item])
  }

  const salida: GrupoImportador[] = [...grupos.entries()].map(([categoria, filas]) => ({
    categoria,
    filas,
  }))
  if (!matriz.size) return salida

  const bloque: FilaMatrizImportador[] = [...matriz.entries()].map(([nombre, celdas]) => ({
    nombre,
    celdas,
  }))
  const existente = salida.find((g) => g.categoria === categoriaMatriz)
  const grupo = existente ?? { categoria: categoriaMatriz, filas: [] }
  grupo.matriz = bloque
  // El bloque va ÚLTIMO. Su encabezado tiene las columnas corridas y manda de
  // esa fila para abajo, así que después no puede quedar ninguna sección
  // normal: se leería con el mapa equivocado.
  if (existente) salida.splice(salida.indexOf(existente), 1)
  salida.push(grupo)
  return salida
}
