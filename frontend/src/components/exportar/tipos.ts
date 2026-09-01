/**
 * Exportador GENÉRICO de gestores — el CONTRATO de la exportación.
 *
 * Es el hermano del exportador de Inventario (`components/inventario/exportar`)
 * pero sin nada específico de stock: cualquier gestor de la app (Clientes,
 * Productos, Auditoría, Caja…) describe sus columnas y sus filas y recibe el
 * mismo Studio: XLSX / PDF / CSV, columnas elegibles y reordenables, agrupado,
 * orden, título, logo, nombre de archivo con tokens y vista previa en vivo.
 *
 * Regla de oro (la misma del módulo de Inventario): `ConfigExportTabla` es
 * DATO serializable, no UI. Los constructores (`xlsx.ts`, `pdf.tsx`, `csv.ts`)
 * solo reciben el dataset ya resuelto (`datos.ts`) más este objeto.
 */

export type FormatoExportTabla = 'xlsx' | 'pdf' | 'csv'

export type TipoColumnaTabla =
  | 'texto'
  | 'entero'
  | 'decimal'
  | 'ars'
  | 'usd'
  | 'pct'
  | 'fecha'
  | 'fechahora'

/** Una columna que el gestor ofrece exportar. `valor` devuelve el dato CRUDO. */
export interface ColumnaTabla<T = unknown> {
  id: string
  label: string
  /** Rótulo corto para el encabezado del PDF, donde el ancho es oro. */
  corto?: string
  tipo: TipoColumnaTabla
  /** Ancho relativo: caracteres en Excel, flex en el PDF. */
  peso: number
  /** Valor crudo de la celda (`null` = vacía). Fechas: string ISO. */
  valor: (fila: T) => string | number | null
  /** La columna se suma en subtotales y total general. */
  totalizable?: boolean
  /** No viene marcada por defecto: hay que agregarla a mano. */
  opcional?: boolean
  ayuda?: string
}

/** Un criterio de agrupación que el gestor ofrece ("Categoría", "Sucursal"…). */
export interface GrupoTabla<T = unknown> {
  id: string
  label: string
  /** La clave de grupo de una fila (vacío ⇒ "Sin dato"). */
  valor: (fila: T) => string
}

/** La descripción completa de un gestor exportable. */
export interface GestorExport<T = unknown> {
  /** Clave estable ('clientes', 'productos'…): arma las claves de localStorage. */
  id: string
  /** Título por defecto del documento ("Clientes"). */
  titulo: string
  /** Nombre de archivo por defecto, con tokens ({fecha} {hora} {n}). */
  nombreArchivo: string
  /** Catálogo de columnas, en su orden por defecto. */
  columnas: ColumnaTabla<T>[]
  /** Ids marcadas por defecto. Si falta: todas las no-`opcional`. */
  columnasPorDefecto?: string[]
  /** Agrupadores disponibles (opcional). */
  grupos?: GrupoTabla<T>[]
  /** Agrupador activo por defecto (id de `grupos`); '' = sin agrupar. */
  agruparPorDefecto?: string
}

/* ===================== Opciones por formato ===================== */

export interface OpcionesXlsxTabla {
  autofiltro: boolean
  /** Congela el encabezado (y la primera columna) al scrollear. */
  congelar: boolean
  bandas: boolean
  subtotales: boolean
  /** Los totales van como `=SUBTOTAL(...)`, vivos: filtrás y se recalculan. */
  formulas: boolean
  /** Cada grupo queda plegable con el +/- del margen izquierdo. */
  agrupable: boolean
  totalGeneral: boolean
  /** Hoja "Cómo se generó": filtros, columnas, usuario y fecha. Trazabilidad. */
  hojaFicha: boolean
}

export interface OpcionesPdfTabla {
  orientacion: 'auto' | 'vertical' | 'apaisado'
  /** En mayúsculas: son los identificadores de página de @react-pdf. */
  tamano: 'A4' | 'LETTER'
  densidad: 'compacta' | 'comoda'
  /** Banda de indicadores arriba de la tabla (filas + columnas totalizables). */
  kpis: boolean
  subtotales: boolean
  totalGeneral: boolean
  bandas: boolean
  /** "Página 3 de 12" en el pie, en todas las hojas. */
  numeroPagina: boolean
  /** Texto en diagonal detrás del contenido: BORRADOR, CONFIDENCIAL, … */
  marcaAgua: string
  /** Cada grupo arranca en hoja nueva. */
  saltoPorGrupo: boolean
  /** Pie con los datos del local. */
  pie: boolean
}

export interface OpcionesCsvTabla {
  delimitador: ',' | ';' | '\t'
  /** El Excel en español espera la coma decimal; una herramienta, el punto. */
  decimal: ',' | '.'
  /** Firma UTF-8: sin ella, Excel abre los acentos rotos. */
  bom: boolean
  encabezados: boolean
  comillas: 'minimas' | 'todas'
  finLinea: 'crlf' | 'lf'
  /** Números pelados (1234.5) y fechas ISO: lo que quiere un script o un BI. */
  crudo: boolean
}

/* ===================== Config ===================== */

export interface ConfigExportTabla {
  formato: FormatoExportTabla
  /** `vista` = lo que se ve en pantalla; `todo` = el listado completo. */
  alcance: 'vista' | 'todo'
  /** Columnas elegidas, EN ORDEN. La primera del catálogo es el ancla. */
  columnas: string[]
  /** Id del agrupador activo; '' = sin agrupar. */
  agruparPor: string
  /** Id de la columna por la que se ordena; '' = orden original del gestor. */
  ordenCol: string
  ordenDir: 'asc' | 'desc'
  conLogo: boolean
  titulo: string
  subtitulo: string
  /** Plantilla con tokens: {fecha} {hora} {n}. */
  nombreArchivo: string
  xlsx: OpcionesXlsxTabla
  pdf: OpcionesPdfTabla
  csv: OpcionesCsvTabla
}

export const XLSX_TABLA_DEFECTO: OpcionesXlsxTabla = {
  autofiltro: true,
  congelar: true,
  bandas: true,
  subtotales: true,
  formulas: true,
  agrupable: true,
  totalGeneral: true,
  hojaFicha: true,
}

export const PDF_TABLA_DEFECTO: OpcionesPdfTabla = {
  orientacion: 'auto',
  tamano: 'A4',
  densidad: 'comoda',
  kpis: true,
  subtotales: true,
  totalGeneral: true,
  bandas: true,
  numeroPagina: true,
  marcaAgua: '',
  saltoPorGrupo: false,
  pie: true,
}

export const CSV_TABLA_DEFECTO: OpcionesCsvTabla = {
  delimitador: ';',
  decimal: ',',
  bom: true,
  encabezados: true,
  comillas: 'minimas',
  finLinea: 'crlf',
  crudo: false,
}

/** La config con la que abre el Studio de un gestor, sin nada guardado. */
export function configPorDefecto<T>(gestor: GestorExport<T>): ConfigExportTabla {
  const columnas =
    gestor.columnasPorDefecto ??
    gestor.columnas.filter((c) => !c.opcional).map((c) => c.id)
  return {
    formato: 'xlsx',
    alcance: 'vista',
    columnas: [...columnas],
    agruparPor: gestor.agruparPorDefecto ?? '',
    ordenCol: '',
    ordenDir: 'asc',
    conLogo: true,
    titulo: gestor.titulo,
    subtitulo: '',
    nombreArchivo: gestor.nombreArchivo,
    xlsx: { ...XLSX_TABLA_DEFECTO },
    pdf: { ...PDF_TABLA_DEFECTO },
    csv: { ...CSV_TABLA_DEFECTO },
  }
}

export type ParcialConfigTabla = Omit<Partial<ConfigExportTabla>, 'xlsx' | 'pdf' | 'csv'> & {
  xlsx?: Partial<OpcionesXlsxTabla>
  pdf?: Partial<OpcionesPdfTabla>
  csv?: Partial<OpcionesCsvTabla>
}

/** Mezcla un parcial guardado (o una plantilla) sobre una config completa. */
export function fusionarConfigTabla(
  base: ConfigExportTabla,
  patch: ParcialConfigTabla,
): ConfigExportTabla {
  return {
    ...base,
    ...patch,
    xlsx: { ...base.xlsx, ...patch.xlsx },
    pdf: { ...base.pdf, ...patch.pdf },
    csv: { ...base.csv, ...patch.csv },
  }
}

/** Una configuración con nombre, guardada por el usuario para este gestor. */
export interface PlantillaTabla {
  id: string
  nombre: string
  descripcion: string
  config: ParcialConfigTabla
}

export const EXTENSION_TABLA: Record<FormatoExportTabla, string> = {
  xlsx: 'xlsx',
  pdf: 'pdf',
  csv: 'csv',
}
