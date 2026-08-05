import { api } from '@/lib/api'
import { useAuth } from '@/store/auth'

/**
 * Historial de documentos generados (backend Django, app `documentos`).
 *
 * Cada exportación del módulo Documentos (PDF, Excel o ticket POS80) sube el
 * archivo tal cual se descargó, junto con los datos del formulario. Después:
 *
 * - Cada cuenta ve LOS SUYOS; los administradores ven los de todo el equipo.
 * - Eliminar es borrado lógico y solo para administradores.
 * - Los archivos no tienen URL pública: se bajan como blob por un endpoint
 *   autenticado, igual que los adjuntos de la cartelera.
 */

const token = () => useAuth.getState().access

export type FormatoDocumento = 'pdf' | 'xlsx' | 'pos80'

export interface AutorDocumento {
  id: number
  username: string
  nombre: string
}

export interface DocumentoGenerado {
  id: number
  /** Fecha y hora de generación (ISO). */
  creado: string
  /** Id del documento en el catálogo del front (`compraventa`, `sena`, …). */
  tipo: string
  tipo_nombre: string
  formato: FormatoDocumento
  formato_display: string
  nombre_archivo: string
  tamanio: number
  sucursal: string
  referencia: string
  cliente: string
  cliente_documento: string
  detalle: string
  /** Importe como string decimal (`"1500000.00"`) o null si no se pudo leer. */
  total: string | null
  /** Formulario completo tal cual se exportó. */
  datos: Record<string, unknown>
  generado_por: AutorDocumento | null
}

export interface PaginaDocumentos {
  total: number
  resultados: DocumentoGenerado[]
  /** Solo en la primera página (offset 0). */
  resumen?: { hoy: number; semana: number; total: number }
  puede_ver_todo?: boolean
  sucursales?: string[]
  /** Solo para administradores. */
  usuarios?: string[]
}

export interface FiltrosDocumentos {
  /** Búsqueda libre sobre cliente, DNI, cupón, detalle o nombre de archivo. */
  q?: string
  tipo?: string
  formato?: string
  sucursal?: string
  /** Username exacto del autor (solo lo aplica el backend para administradores). */
  usuario?: string
  /** Fechas locales `aaaa-mm-dd`, inclusive. */
  desde?: string
  hasta?: string
  limit?: number
  offset?: number
}

export function listarDocumentos(filtros: FiltrosDocumentos = {}): Promise<PaginaDocumentos> {
  const params = new URLSearchParams()
  for (const [clave, valor] of Object.entries(filtros)) {
    if (valor !== undefined && valor !== null && valor !== '') params.set(clave, String(valor))
  }
  const query = params.toString()
  return api.get<PaginaDocumentos>(`/documentos/${query ? `?${query}` : ''}`, token())
}

/** Metadatos con los que se archiva una exportación. */
export interface NuevoDocumento {
  tipo: string
  tipoNombre: string
  formato: FormatoDocumento
  nombreArchivo: string
  sucursal?: string
  referencia?: string
  cliente?: string
  clienteDocumento?: string
  detalle?: string
  /** Importe normalizado (`"1500000.00"`); se omite si no se pudo leer. */
  total?: string
  datos: unknown
}

/** Sube el archivo generado y lo deja registrado en el historial. */
export function registrarDocumento(
  meta: NuevoDocumento,
  archivo: Blob,
): Promise<DocumentoGenerado> {
  const form = new FormData()
  form.set('tipo', meta.tipo)
  form.set('tipo_nombre', meta.tipoNombre)
  form.set('formato', meta.formato)
  form.set('nombre_archivo', meta.nombreArchivo)
  if (meta.sucursal) form.set('sucursal', meta.sucursal)
  if (meta.referencia) form.set('referencia', meta.referencia)
  if (meta.cliente) form.set('cliente', meta.cliente)
  if (meta.clienteDocumento) form.set('cliente_documento', meta.clienteDocumento)
  if (meta.detalle) form.set('detalle', meta.detalle)
  if (meta.total) form.set('total', meta.total)
  form.set('datos', JSON.stringify(meta.datos ?? {}))
  form.append('archivo', archivo, meta.nombreArchivo)
  return api.post<DocumentoGenerado>('/documentos/', form, token())
}

/** Borrado lógico: sale del historial pero no se pierde. Solo administradores. */
export function eliminarDocumento(id: number): Promise<void> {
  return api.del<void>(`/documentos/${id}/`, token())
}

/** Baja el archivo guardado como Blob (para verlo o descargarlo). */
export function obtenerArchivoBlob(id: number): Promise<Blob> {
  return api.getBlob(`/documentos/${id}/archivo/`, token())
}
