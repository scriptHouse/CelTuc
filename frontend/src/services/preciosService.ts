import type {
  ConfiguracionPreciosService,
  DispositivoService,
  ItemPrecioService,
  SeccionPreciosService,
} from '@/types'
import { api } from '@/lib/api'
import { useAuth } from '@/store/auth'

/**
 * Precios de service: la lista de precios del taller (hoja "Precios Service").
 * Los precios en pesos se derivan del dólar configurado, salvo override manual.
 * Leer requiere el permiso `ver_precios_service`; escribir es solo para admins.
 */

const token = () => useAuth.getState().access

export interface ConfiguracionInput {
  dolar: number
  descuento_cash_pct: number
  redondeo_ars: number
}

/** Variante para crear/editar. Con `id` conserva la variante (y sus precios). */
export interface VarianteInput {
  id?: number
  nombre: string
  orden?: number
}

export interface SeccionInput {
  nombre: string
  nota?: string
  /** null = usa el descuento global. */
  descuento_cash_pct?: number | null
  orden?: number
  activo?: boolean
  variantes?: VarianteInput[]
}

/** Precio por variante: null en un campo = se deriva con la fórmula. */
export interface PrecioInput {
  variante: number
  precio_lista_usd?: number | null
  precio_cash_usd?: number | null
  precio_lista_ars?: number | null
  precio_cash_ars?: number | null
}

export interface ItemInput {
  seccion: number
  etiqueta: string
  nota?: string
  /** En la factura no figura por su nombre (ver `lib/conceptoGenerico`). */
  concepto_generico_factura?: boolean
  /** Ids de los equipos a los que aplica la fila (alimenta el selector). */
  dispositivos?: number[]
  orden?: number
  activo?: boolean
  precios?: PrecioInput[]
}

export interface DispositivoInput {
  nombre: string
  linea?: string
  orden?: number
  activo?: boolean
}

/** Cotización del dólar blue (DolarAPI), vía el backend. SOLO referencia:
 * leerla nunca modifica el dólar del negocio. */
export interface DolarBlue {
  compra: number | null
  venta: number | null
  fecha: string | null
  /** true = DolarAPI no respondió y estos valores son la última cotización
   * que quedó guardada en la base (respaldo). */
  desactualizado?: boolean
  /** Cuándo se guardó ese respaldo (ISO). Solo viene con `desactualizado`. */
  guardado?: string | null
}

export function obtenerDolarBlue(): Promise<DolarBlue> {
  return api.get<DolarBlue>('/precios-service/dolar-blue/', token())
}

export function obtenerConfiguracion(): Promise<ConfiguracionPreciosService> {
  return api.get<ConfiguracionPreciosService>('/precios-service/configuracion/', token())
}

export function actualizarConfiguracion(
  input: Partial<ConfiguracionInput>,
): Promise<ConfiguracionPreciosService> {
  return api.patch<ConfiguracionPreciosService>('/precios-service/configuracion/', input, token())
}

export function listarSecciones(): Promise<SeccionPreciosService[]> {
  return api.get<SeccionPreciosService[]>('/precios-service/secciones/', token())
}

export function crearSeccion(input: SeccionInput): Promise<SeccionPreciosService> {
  return api.post<SeccionPreciosService>('/precios-service/secciones/', input, token())
}

export function actualizarSeccion(
  id: number,
  input: Partial<SeccionInput>,
): Promise<SeccionPreciosService> {
  return api.patch<SeccionPreciosService>(`/precios-service/secciones/${id}/`, input, token())
}

export function eliminarSeccion(id: number): Promise<void> {
  return api.del<void>(`/precios-service/secciones/${id}/`, token())
}

export function crearItem(input: ItemInput): Promise<ItemPrecioService> {
  return api.post<ItemPrecioService>('/precios-service/items/', input, token())
}

export function actualizarItem(id: number, input: Partial<ItemInput>): Promise<ItemPrecioService> {
  return api.patch<ItemPrecioService>(`/precios-service/items/${id}/`, input, token())
}

export function eliminarItem(id: number): Promise<void> {
  return api.del<void>(`/precios-service/items/${id}/`, token())
}

export function listarDispositivos(): Promise<DispositivoService[]> {
  return api.get<DispositivoService[]>('/precios-service/dispositivos/', token())
}

export function crearDispositivo(input: DispositivoInput): Promise<DispositivoService> {
  return api.post<DispositivoService>('/precios-service/dispositivos/', input, token())
}

export function actualizarDispositivo(
  id: number,
  input: Partial<DispositivoInput>,
): Promise<DispositivoService> {
  return api.patch<DispositivoService>(`/precios-service/dispositivos/${id}/`, input, token())
}

export function eliminarDispositivo(id: number): Promise<void> {
  return api.del<void>(`/precios-service/dispositivos/${id}/`, token())
}

// ===== Importar la lista de precios (el archivo que baja «Exportar») =====

/** Los datos que la planilla puede aportar, cada uno con su columna. */
export type CampoColumnaService =
  | 'etiqueta'
  | 'seccion'
  | 'variante'
  | 'lista_usd'
  | 'cash_usd'
  | 'lista_ars'
  | 'cash_ars'

/** Los cuatro precios de un ítem, como texto (para no perder centavos). */
export interface PreciosService {
  lista_usd: string | null
  cash_usd: string | null
  lista_ars: string | null
  cash_ars: string | null
}

/**
 * Un destino posible para una fila de la planilla: contra qué ítem y qué
 * calidad iría, con el antes → después ya calculado. Cuando hay uno solo la
 * fila está resuelta; cuando hay varios, se elige en la revisión.
 */
export interface OpcionImportacionService {
  clave: string
  /** null = el ítem no existe y esta opción lo da de alta. */
  item: number | null
  item_nombre: string
  seccion: number | null
  seccion_nombre: string
  variante: number
  variante_nombre: string
  /** Ya hay un precio cargado para ese cruce (si no, se crea). */
  existe: boolean
  precio: {
    antes: PreciosService
    despues: PreciosService
    planilla: PreciosService
    /** Precios que quedan fijados a mano (dejan de salir de la fórmula). */
    fijados: string[]
    /** Precios en pesos que la planilla trae distintos y NO se importan. */
    ignorados: string[]
    cambia: boolean
    /** Lo que hay que mandar al aplicar (null = no toca ningún precio). */
    aplicar: Record<string, string | null> | null
  }
}

export type EstadoFilaService = 'actualiza' | 'igual' | 'nueva' | 'revisar' | 'sin_valor'

export interface FilaImportacionService {
  fila: number
  etiqueta: string
  /** La sección tal como la dice la planilla. */
  seccion: string
  /** Salió del renglón de grupo, no de una columna. */
  seccion_de_grupo: boolean
  variante: string
  confianza: 'exacta' | 'aproximada' | null
  seccion_id: number | null
  seccion_nombre: string
  planilla: PreciosService
  opciones: OpcionImportacionService[]
  /** La única opción, cuando no hay dudas. */
  elegida: string | null
  /** Las opciones dan de alta el ítem. */
  crear: boolean
  duplicada_con: number[]
  motivo: string
  estado: EstadoFilaService
  sugerido: boolean
  puede_crear: boolean
}

export interface ResumenImportacionService {
  filas: number
  actualiza: number
  igual: number
  nueva: number
  revisar: number
  sin_valor: number
  duplicada: number
  /** Filas donde la planilla trae otro precio en pesos que no se importa. */
  pesos_ignorados: number
  con_pesos: boolean
  /** Con qué dólar se armaron los pesos de la planilla (se deduce). */
  dolar_planilla: string | null
  dolar_negocio: string | null
  items_sin_planilla: number
}

/** De qué columna del Excel salió cada dato, y qué otras columnas hay. */
export interface ColumnasImportacionService {
  hoja: string
  fila: number
  elegidas: Record<CampoColumnaService, number | null>
  detectadas: Record<CampoColumnaService, number | null>
  disponibles: Array<{ indice: number; letra: string; rotulo: string }>
}

export interface AnalisisImportacionService {
  archivo: string
  filas: FilaImportacionService[]
  columnas: ColumnasImportacionService
  resumen: ResumenImportacionService
}

export interface ItemImportacionServiceInput {
  fila?: number
  /** El precio que se pisa, o el alta del ítem que no existe. */
  item?: number
  crear?: { seccion: number; etiqueta: string; nota?: string }
  variante: number
  precio_lista_usd?: string | null
  precio_cash_usd?: string | null
  precio_lista_ars?: string | null
  precio_cash_ars?: string | null
}

export interface ResultadoImportacionService {
  actualizados: number
  /** Precios que no existían y se crearon. */
  creados: number
  /** Ítems nuevos dados de alta en la lista. */
  altas: number
  sin_cambio: number
  detalle: Array<{
    item: number
    etiqueta: string
    variante: string
    lista_usd: string | null
  }>
}

/**
 * Sube una lista de precios y devuelve el diff fila por fila. NO escribe nada:
 * es el paso de revisión previo a `aplicarListaService`.
 */
export function analizarListaService(input: {
  archivo: File
  /** Importar también los precios en pesos (por defecto se calculan). */
  conPesos?: boolean
  /** De qué columna sacar cada dato, si se corrige a mano. */
  columnas?: Record<CampoColumnaService, number | null> | null
}): Promise<AnalisisImportacionService> {
  const form = new FormData()
  form.append('archivo', input.archivo)
  form.append('con_pesos', input.conPesos ? 'true' : 'false')
  if (input.columnas) {
    for (const [campo, posicion] of Object.entries(input.columnas)) {
      // -1 es «no leer ese dato de ninguna columna».
      form.append(`col_${campo}`, String(posicion ?? -1))
    }
  }
  return api.post<AnalisisImportacionService>(
    '/precios-service/importar/analizar/', form, token(),
  )
}

/** Aplica las filas confirmadas (todo o nada). */
export function aplicarListaService(input: {
  items: ItemImportacionServiceInput[]
}): Promise<ResultadoImportacionService> {
  return api.post<ResultadoImportacionService>(
    '/precios-service/importar/aplicar/', input, token(),
  )
}
