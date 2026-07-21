import { api } from '@/lib/api'
import { useAuth } from '@/store/auth'

/**
 * Cartelera de comunicación interna (backend Django, app `comunicados`).
 *
 * - Leer y marcar como visto: cualquier usuario logueado.
 * - Publicar / fijar / eliminar: solo administradores.
 * - Los adjuntos no tienen URL pública: se bajan como blob por un endpoint
 *   autenticado y el front arma object URLs para mostrarlos inline.
 */

const token = () => useAuth.getState().access

export type TipoAdjunto = 'imagen' | 'video' | 'archivo'

export interface ArchivoComunicado {
  id: number
  nombre: string
  tipo: TipoAdjunto
  content_type: string
  tamanio: number
}

/** Constancia de lectura: quién lo vio y cuándo (fecha y hora exactas). */
export interface LecturaComunicado {
  usuario: string
  fecha: string
}

export interface Comunicado {
  id: number
  titulo: string
  cuerpo: string
  fijado: boolean
  creado: string
  publicado_por: string
  archivos: ArchivoComunicado[]
  lecturas: LecturaComunicado[]
  leido_por_mi: boolean
  total_lecturas: number
}

/** Límites que también valida el backend (nginx corta el request en 20 MB). */
export const MAX_ADJUNTOS = 10
export const MAX_TAMANIO_ADJUNTO = 19 * 1024 * 1024 // 19 MB

export function listarComunicados(): Promise<Comunicado[]> {
  return api.get<Comunicado[]>('/comunicados/', token())
}

export interface NuevoComunicado {
  titulo: string
  cuerpo?: string
  fijado?: boolean
  archivos?: File[]
}

export function publicarComunicado(input: NuevoComunicado): Promise<Comunicado> {
  const form = new FormData()
  form.set('titulo', input.titulo)
  if (input.cuerpo) form.set('cuerpo', input.cuerpo)
  if (input.fijado) form.set('fijado', 'true')
  for (const archivo of input.archivos ?? []) form.append('archivos', archivo, archivo.name)
  return api.post<Comunicado>('/comunicados/', form, token())
}

export function actualizarComunicado(
  id: number,
  input: Partial<Pick<Comunicado, 'titulo' | 'cuerpo' | 'fijado'>>,
): Promise<Comunicado> {
  return api.patch<Comunicado>(`/comunicados/${id}/`, input, token())
}

/** Borrado lógico: sale de la cartelera pero queda en el historial de la base. */
export function eliminarComunicado(id: number): Promise<void> {
  return api.del<void>(`/comunicados/${id}/`, token())
}

/** Deja constancia de lectura (idempotente: la fecha original no cambia). */
export function marcarVisto(id: number): Promise<{ leido: boolean; fecha: string; total_lecturas: number }> {
  return api.post(`/comunicados/${id}/visto/`, undefined, token())
}

/** Baja el adjunto autenticado como Blob (para mostrarlo inline o descargarlo). */
export function obtenerAdjuntoBlob(id: number): Promise<Blob> {
  return api.getBlob(`/comunicados/archivos/${id}/`, token())
}

/** Descarga un adjunto al disco con su nombre original. */
export async function descargarAdjunto(adjunto: ArchivoComunicado): Promise<void> {
  const blob = await obtenerAdjuntoBlob(adjunto.id)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = adjunto.nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
