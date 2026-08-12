/**
 * Exportador de Inventario — el CONTRATO de la exportación.
 *
 * Todo lo que se puede elegir en el Studio vive acá, en un objeto plano y
 * serializable: así una configuración se guarda como plantilla, se recuerda
 * entre visitas y se le pasa igual a los tres generadores (XLSX, PDF y CSV)
 * sin que ninguno tenga que saber de la pantalla.
 *
 * Regla de oro del módulo: `ConfigExport` es DATO, no UI. No importa React ni
 * componentes; los constructores (`xlsx.ts`, `pdf.tsx`, `csv.ts`) solo reciben
 * el dataset ya resuelto (`datos.ts`) más este objeto.
 */

export type FormatoExport = 'xlsx' | 'pdf' | 'csv'

/**
 * Cómo se acomodan las sucursales en la tabla.
 * - `ancha`: una fila por producto y una COLUMNA por sucursal (lo que se ve en
 *   pantalla). Es la forma de leer, comparar y contar.
 * - `larga`: una fila por producto × sucursal (formato "tidy"). Es la forma de
 *   analizar: entra derecho en una tabla dinámica de Excel o en cualquier BI.
 */
export type Disposicion = 'ancha' | 'larga'

export type AgruparPor = 'ninguno' | 'categoria' | 'marca' | 'sucursal'

export type OrdenExport =
  | 'catalogo'
  | 'nombre'
  | 'stock_desc'
  | 'stock_asc'
  | 'valor_desc'
  | 'faltante_desc'

/**
 * Qué filas entran:
 * - `vista`: exactamente lo que está viendo en pantalla (búsqueda, categoría y
 *   pestaña incluidas). Lo que ve es lo que se lleva.
 * - `catalogo`: todo el catálogo, ignorando los filtros de la pantalla.
 */
export type AlcanceFilas = 'vista' | 'catalogo'

/** Refinamientos que se aplican SIEMPRE, encima del alcance elegido. */
export interface FiltrosExport {
  soloConStock: boolean
  soloBajoMinimo: boolean
  /** Solo los que hoy figuran "(no informado)": la planilla nunca los contó. */
  soloNoInformado: boolean
  incluirInactivos: boolean
  incluirAPedido: boolean
  /** Deja afuera los productos sin precio cargado (listas de precios limpias). */
  soloConPrecio: boolean
}

export interface OpcionesXlsx {
  /** Hoja "Resumen": KPIs + cortes por categoría, marca y sucursal. */
  hojaResumen: boolean
  /** Hoja "Cómo se generó": filtros, columnas, usuario y fecha. Trazabilidad. */
  hojaFiltros: boolean
  /** Hoja "Kardex": los últimos movimientos de stock de las sucursales elegidas. */
  hojaKardex: boolean
  kardexLimite: number
  autofiltro: boolean
  /** Congela el encabezado (y la columna del producto) al scrollear. */
  congelar: boolean
  bandas: boolean
  /** Formato condicional: pinta las filas en o bajo el mínimo. */
  resaltarBajoMinimo: boolean
  /** Barras de datos dentro de la celda de stock (mini-gráfico nativo de Excel). */
  barrasDatos: boolean
  subtotales: boolean
  /** Los totales van como `=SUBTOTAL(...)`, vivos: filtrás y se recalculan. */
  formulas: boolean
  /** Cada grupo queda plegable con el +/- del margen izquierdo. */
  agrupable: boolean
  totalGeneral: boolean
}

export interface OpcionesPdf {
  orientacion: 'auto' | 'vertical' | 'apaisado'
  /** En mayúsculas: son los identificadores de página de @react-pdf. */
  tamano: 'A4' | 'LETTER'
  densidad: 'compacta' | 'comoda'
  /** Banda de indicadores arriba de la tabla. */
  kpis: boolean
  subtotales: boolean
  totalGeneral: boolean
  bandas: boolean
  resaltarBajoMinimo: boolean
  /** "Página 3 de 12" en el pie, en todas las hojas. */
  numeroPagina: boolean
  /** Texto en diagonal detrás del contenido: BORRADOR, CONFIDENCIAL, … */
  marcaAgua: string
  /** Página final con los cortes por categoría y por sucursal. */
  paginaResumen: boolean
  /** Cada grupo arranca en hoja nueva (ideal para repartir por categoría). */
  saltoPorGrupo: boolean
  /** Pie con los datos del local. */
  pie: boolean
}

export interface OpcionesCsv {
  delimitador: ',' | ';' | '\t'
  /** El Excel en español espera la coma decimal; una herramienta, el punto. */
  decimal: ',' | '.'
  /** Firma UTF-8: sin ella, Excel abre los acentos rotos. */
  bom: boolean
  encabezados: boolean
  comillas: 'minimas' | 'todas'
  finLinea: 'crlf' | 'lf'
  /**
   * Números pelados (1234.5) en vez de formateados ($ 1.234,50). Es lo que
   * quiere cualquier script, pandas o Google Sheets.
   */
  crudo: boolean
}

export interface ConfigExport {
  formato: FormatoExport
  alcance: AlcanceFilas
  /** Ids de sucursal que entran. Vacío = todas las activas. */
  sucursales: number[]
  filtros: FiltrosExport
  disposicion: Disposicion
  /** Columnas elegidas, EN ORDEN. La del producto va siempre primera. */
  columnas: string[]
  agruparPor: AgruparPor
  orden: OrdenExport
  conLogo: boolean
  titulo: string
  subtitulo: string
  /** Plantilla con tokens: {fecha} {hora} {sucursal} {vista} {n}. */
  nombreArchivo: string
  xlsx: OpcionesXlsx
  pdf: OpcionesPdf
  csv: OpcionesCsv
}

/* ===================== Columnas ===================== */

export type TipoColumna = 'texto' | 'entero' | 'ars' | 'usd' | 'pct' | 'fecha' | 'blanco'

/** Id de una columna de stock de una sucursal concreta. */
export const colSucursal = (id: number) => `stock:${id}`
export const esColSucursal = (id: string) => id.startsWith('stock:')
export const idDeColSucursal = (id: string) => Number(id.slice(6))

/** Familias con las que se agrupa el selector de columnas. */
export type FamiliaColumna = 'producto' | 'precios' | 'stock' | 'valor' | 'auditoria'

export interface DefinicionColumna {
  id: string
  label: string
  /** Rótulo corto para el encabezado del PDF, donde el ancho es oro. */
  corto?: string
  familia: FamiliaColumna
  tipo: TipoColumna
  /** Ancho relativo: manda el ancho de la columna en Excel y el flex en el PDF. */
  peso: number
  /** Solo administradores (costos y márgenes). */
  soloAdmin?: boolean
  /** No se puede desmarcar. */
  fija?: boolean
  /** Solo tiene sentido en disposición larga (una fila por producto × sucursal). */
  soloLarga?: boolean
  ayuda?: string
}

/**
 * El catálogo de columnas FIJAS. Las de stock por sucursal se generan aparte
 * (dependen de qué sucursales tenga el negocio) en `datos.ts`.
 */
export const COLUMNAS: DefinicionColumna[] = [
  { id: 'producto', label: 'Producto', familia: 'producto', tipo: 'texto', peso: 46, fija: true },
  { id: 'marca', label: 'Marca', familia: 'producto', tipo: 'texto', peso: 14 },
  { id: 'calidad', label: 'Calidad', familia: 'producto', tipo: 'texto', peso: 14 },
  { id: 'categoria', label: 'Categoría', familia: 'producto', tipo: 'texto', peso: 18 },
  { id: 'subcategoria', label: 'Subcategoría', corto: 'Subcat.', familia: 'producto', tipo: 'texto', peso: 18 },
  { id: 'nota', label: 'Nota', familia: 'producto', tipo: 'texto', peso: 22 },
  {
    id: 'a_pedido',
    label: 'A pedido',
    familia: 'producto',
    tipo: 'texto',
    peso: 10,
    ayuda: 'No se stockea: se trae cuando alguien lo pide.',
  },
  { id: 'id', label: 'ID interno', corto: 'ID', familia: 'producto', tipo: 'entero', peso: 9, ayuda: 'El id del catálogo. Sirve para volver a cruzar el archivo contra el sistema.' },

  { id: 'lista_ars', label: 'Lista $', familia: 'precios', tipo: 'ars', peso: 14 },
  { id: 'cash_ars', label: 'Contado/transf. $', corto: 'Contado $', familia: 'precios', tipo: 'ars', peso: 15 },
  { id: 'lista_usd', label: 'Lista USD', familia: 'precios', tipo: 'usd', peso: 12 },
  { id: 'cash_usd', label: 'Contado USD', corto: 'Cont. USD', familia: 'precios', tipo: 'usd', peso: 12 },
  { id: 'costo_usd', label: 'Costo USD', familia: 'precios', tipo: 'usd', peso: 12, soloAdmin: true, ayuda: 'Costo de reposición. Solo lo ven los administradores.' },
  { id: 'margen', label: 'Margen %', familia: 'precios', tipo: 'pct', peso: 11, soloAdmin: true, ayuda: 'Cuánto queda sobre el precio de lista, en dólares.' },

  { id: 'sucursal', label: 'Sucursal', familia: 'stock', tipo: 'texto', peso: 16, soloLarga: true },
  { id: 'total', label: 'Stock', familia: 'stock', tipo: 'entero', peso: 10, ayuda: 'En disposición ancha es la suma de las sucursales elegidas.' },
  { id: 'minimo', label: 'Mínimo', familia: 'stock', tipo: 'entero', peso: 10 },
  { id: 'faltante', label: 'Faltante', familia: 'stock', tipo: 'entero', peso: 10, ayuda: 'Cuánto falta para llegar al mínimo. Es la columna de la orden de compra.' },
  { id: 'estado', label: 'Estado', familia: 'stock', tipo: 'texto', peso: 16 },
  {
    id: 'conteo',
    label: 'Conteo físico',
    corto: 'Contado',
    familia: 'stock',
    tipo: 'blanco',
    peso: 12,
    ayuda: 'Columna VACÍA a propósito: se imprime y se anota a mano lo que se contó en el local.',
  },
  {
    id: 'diferencia',
    label: 'Diferencia',
    familia: 'stock',
    tipo: 'blanco',
    peso: 11,
    ayuda: 'Vacía en el papel; en Excel viene con la fórmula “contado − sistema” ya puesta.',
  },

  { id: 'valor_lista', label: 'Valor a lista', corto: 'Val. lista', familia: 'valor', tipo: 'ars', peso: 16 },
  { id: 'valor_cash', label: 'Valor a contado', corto: 'Val. contado', familia: 'valor', tipo: 'ars', peso: 16 },
  { id: 'valor_costo', label: 'Valor a costo USD', corto: 'Val. costo', familia: 'valor', tipo: 'usd', peso: 15, soloAdmin: true },

  { id: 'actualizado', label: 'Actualizado', familia: 'auditoria', tipo: 'fecha', peso: 15 },
]

export const COLUMNAS_POR_ID = new Map(COLUMNAS.map((c) => [c.id, c]))

export const FAMILIAS: Array<{ id: FamiliaColumna; label: string }> = [
  { id: 'producto', label: 'Producto' },
  { id: 'precios', label: 'Precios' },
  { id: 'stock', label: 'Stock' },
  { id: 'valor', label: 'Valorización' },
  { id: 'auditoria', label: 'Auditoría' },
]

/* ===================== Config por defecto ===================== */

export const FILTROS_VACIOS: FiltrosExport = {
  soloConStock: false,
  soloBajoMinimo: false,
  soloNoInformado: false,
  incluirInactivos: false,
  incluirAPedido: true,
  soloConPrecio: false,
}

export const CONFIG_POR_DEFECTO: ConfigExport = {
  formato: 'xlsx',
  alcance: 'vista',
  sucursales: [],
  filtros: { ...FILTROS_VACIOS },
  disposicion: 'ancha',
  columnas: ['producto', 'marca', 'categoria', 'lista_ars', 'cash_ars', 'total', 'minimo', 'estado', 'valor_lista'],
  agruparPor: 'categoria',
  orden: 'catalogo',
  conLogo: true,
  titulo: 'Inventario',
  subtitulo: '',
  nombreArchivo: 'inventario-{sucursal}-{fecha}',
  xlsx: {
    hojaResumen: true,
    hojaFiltros: true,
    hojaKardex: false,
    kardexLimite: 300,
    autofiltro: true,
    congelar: true,
    bandas: true,
    resaltarBajoMinimo: true,
    barrasDatos: true,
    subtotales: true,
    formulas: true,
    agrupable: true,
    totalGeneral: true,
  },
  pdf: {
    orientacion: 'auto',
    tamano: 'A4',
    densidad: 'comoda',
    kpis: true,
    subtotales: true,
    totalGeneral: true,
    bandas: true,
    resaltarBajoMinimo: true,
    numeroPagina: true,
    marcaAgua: '',
    paginaResumen: true,
    saltoPorGrupo: false,
    pie: true,
  },
  csv: {
    delimitador: ';',
    decimal: ',',
    bom: true,
    encabezados: true,
    comillas: 'minimas',
    finLinea: 'crlf',
    crudo: false,
  },
}

/* ===================== Plantillas ===================== */

export interface PlantillaExport {
  id: string
  nombre: string
  descripcion: string
  /** Se aplica ENCIMA de la config por defecto (merge por sección). */
  config: ParcialConfig
  /** Las de fábrica no se pueden borrar. */
  deFabrica?: boolean
}

export type ParcialConfig = Omit<Partial<ConfigExport>, 'filtros' | 'xlsx' | 'pdf' | 'csv'> & {
  filtros?: Partial<FiltrosExport>
  xlsx?: Partial<OpcionesXlsx>
  pdf?: Partial<OpcionesPdf>
  csv?: Partial<OpcionesCsv>
}

/**
 * Las plantillas de fábrica: los cinco pedidos reales del negocio, cada uno con
 * las columnas y el formato que le sirven. Son el atajo para no configurar nada.
 */
export const PLANTILLAS_FABRICA: PlantillaExport[] = [
  {
    id: 'reposicion',
    nombre: 'Orden de reposición',
    descripcion: 'Solo lo que está en o bajo el mínimo, con cuánto falta de cada cosa.',
    deFabrica: true,
    config: {
      formato: 'xlsx',
      alcance: 'catalogo',
      titulo: 'Reposición',
      subtitulo: 'Productos en o por debajo del mínimo',
      filtros: { soloBajoMinimo: true },
      columnas: ['producto', 'marca', 'categoria', 'total', 'minimo', 'faltante', 'cash_ars'],
      agruparPor: 'categoria',
      orden: 'faltante_desc',
      nombreArchivo: 'reposicion-{sucursal}-{fecha}',
      xlsx: { barrasDatos: false, hojaKardex: false },
    },
  },
  {
    id: 'conteo',
    nombre: 'Planilla de conteo físico',
    descripcion: 'Para imprimir y contar en el mostrador: deja la columna del conteo en blanco.',
    deFabrica: true,
    config: {
      formato: 'pdf',
      alcance: 'catalogo',
      titulo: 'Conteo físico',
      subtitulo: 'Anotá lo contado y firmá al pie',
      filtros: { soloConStock: true },
      columnas: ['producto', 'marca', 'total', 'conteo', 'diferencia'],
      agruparPor: 'categoria',
      orden: 'nombre',
      nombreArchivo: 'conteo-{sucursal}-{fecha}',
      pdf: { densidad: 'comoda', kpis: false, paginaResumen: false, orientacion: 'vertical', marcaAgua: '' },
    },
  },
  {
    id: 'valorizacion',
    nombre: 'Valorización de stock',
    descripcion: 'Cuánta plata hay en el depósito, con el corte por categoría y sucursal.',
    deFabrica: true,
    config: {
      formato: 'xlsx',
      alcance: 'catalogo',
      titulo: 'Valorización de inventario',
      filtros: { soloConStock: true },
      columnas: ['producto', 'categoria', 'total', 'cash_ars', 'valor_lista', 'valor_cash'],
      agruparPor: 'categoria',
      orden: 'valor_desc',
      nombreArchivo: 'valorizacion-{sucursal}-{fecha}',
      xlsx: { hojaResumen: true, subtotales: true, formulas: true },
    },
  },
  {
    id: 'precios',
    nombre: 'Lista de precios',
    descripcion: 'El catálogo con los cuatro precios vivos, sin cantidades.',
    deFabrica: true,
    config: {
      formato: 'pdf',
      alcance: 'catalogo',
      titulo: 'Lista de precios',
      filtros: { soloConPrecio: true },
      columnas: ['producto', 'marca', 'calidad', 'lista_usd', 'lista_ars', 'cash_ars'],
      agruparPor: 'categoria',
      orden: 'nombre',
      nombreArchivo: 'precios-{fecha}',
      pdf: { kpis: false, paginaResumen: false, densidad: 'compacta', orientacion: 'vertical' },
    },
  },
  {
    id: 'analisis',
    nombre: 'Datos para analizar',
    descripcion: 'Una fila por producto y sucursal, sin formato: entra derecho en una tabla dinámica.',
    deFabrica: true,
    config: {
      formato: 'csv',
      alcance: 'catalogo',
      disposicion: 'larga',
      columnas: ['id', 'producto', 'marca', 'categoria', 'subcategoria', 'sucursal', 'total', 'minimo', 'estado', 'cash_ars', 'valor_cash'],
      agruparPor: 'ninguno',
      orden: 'catalogo',
      nombreArchivo: 'inventario-datos-{fecha}',
      csv: { crudo: true, decimal: '.', delimitador: ',' },
    },
  },
]

/** Mezcla una plantilla (o cualquier parcial) sobre una config completa. */
export function fusionarConfig(base: ConfigExport, patch: ParcialConfig): ConfigExport {
  return {
    ...base,
    ...patch,
    filtros: { ...base.filtros, ...patch.filtros },
    xlsx: { ...base.xlsx, ...patch.xlsx },
    pdf: { ...base.pdf, ...patch.pdf },
    csv: { ...base.csv, ...patch.csv },
  }
}

/** Aplica una plantilla sobre la config LIMPIA (para que no arrastre lo anterior). */
export function aplicarPlantilla(plantilla: PlantillaExport, sucursales: number[]): ConfigExport {
  const base: ConfigExport = {
    ...CONFIG_POR_DEFECTO,
    filtros: { ...FILTROS_VACIOS },
    sucursales,
    xlsx: { ...CONFIG_POR_DEFECTO.xlsx },
    pdf: { ...CONFIG_POR_DEFECTO.pdf },
    csv: { ...CONFIG_POR_DEFECTO.csv },
  }
  return fusionarConfig(base, plantilla.config)
}

export const EXTENSION: Record<FormatoExport, string> = { xlsx: 'xlsx', pdf: 'pdf', csv: 'csv' }

export const MIME: Record<FormatoExport, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
  csv: 'text/csv;charset=utf-8',
}
