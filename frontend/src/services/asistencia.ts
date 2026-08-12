import type {
  AgenteAsistencia,
  AgenteAsistenciaInput,
  FichadaDetalle,
  MapeoAsistencia,
  NumeroSinMapear,
  PaginaFichadas,
  PanelAsistencia,
  RelojAsistencia,
  RelojAsistenciaInput,
  ResumenDiaAsistencia,
} from '@/types'
import { api } from '@/lib/api'
import { useAuth } from '@/store/auth'

/** Módulo Asistencia (solo superadministrador): relojes Hikvision, agentes y fichadas. */

const token = () => useAuth.getState().access

function query(filtros: object): string {
  const params = new URLSearchParams()
  for (const [clave, valor] of Object.entries(filtros as Record<string, unknown>)) {
    if (valor !== undefined && valor !== null && valor !== '') params.set(clave, String(valor))
  }
  const q = params.toString()
  return q ? `?${q}` : ''
}

// --- Panel / monitoreo -------------------------------------------------------

export function panelAsistencia(): Promise<PanelAsistencia> {
  return api.get<PanelAsistencia>('/asistencia/panel/', token())
}

// --- Fichadas ----------------------------------------------------------------

export interface FiltrosFichadas {
  q?: string
  dispositivo?: number | ''
  sucursal?: number | ''
  empleado?: number | ''
  tipo?: string
  metodo?: string
  /** `mapeada` | `sin_mapear` */
  mapeo?: string
  /** Fechas locales `aaaa-mm-dd`, inclusive. */
  desde?: string
  hasta?: string
  limit?: number
  offset?: number
}

export function listarFichadas(filtros: FiltrosFichadas = {}): Promise<PaginaFichadas> {
  return api.get<PaginaFichadas>(`/asistencia/fichadas/${query(filtros)}`, token())
}

export function detalleFichada(id: number): Promise<FichadaDetalle> {
  return api.get<FichadaDetalle>(`/asistencia/fichadas/${id}/`, token())
}

export interface FiltrosResumen {
  desde?: string
  hasta?: string
  dispositivo?: number | ''
  sucursal?: number | ''
  empleado?: number | ''
}

export function resumenAsistencia(filtros: FiltrosResumen = {}): Promise<{
  desde: string
  hasta: string
  resultados: ResumenDiaAsistencia[]
}> {
  return api.get(`/asistencia/resumen/${query(filtros)}`, token())
}

export function numerosSinMapear(): Promise<{ resultados: NumeroSinMapear[] }> {
  return api.get('/asistencia/numeros-sin-mapear/', token())
}

// --- Relojes (dispositivos) --------------------------------------------------

export function listarRelojes(): Promise<RelojAsistencia[]> {
  return api.get<RelojAsistencia[]>('/asistencia/dispositivos/', token())
}

export function crearReloj(input: Partial<RelojAsistenciaInput>): Promise<RelojAsistencia> {
  return api.post<RelojAsistencia>('/asistencia/dispositivos/', input, token())
}

export function actualizarReloj(
  id: number,
  input: Partial<RelojAsistenciaInput>,
): Promise<RelojAsistencia> {
  return api.patch<RelojAsistencia>(`/asistencia/dispositivos/${id}/`, input, token())
}

export function eliminarReloj(id: number): Promise<void> {
  return api.del<void>(`/asistencia/dispositivos/${id}/`, token())
}

// --- Agentes -----------------------------------------------------------------

/** Al crear, el backend devuelve el token EN CLARO una única vez. */
export type AgenteConToken = AgenteAsistencia & { token: string }

export function listarAgentes(): Promise<AgenteAsistencia[]> {
  return api.get<AgenteAsistencia[]>('/asistencia/agentes/', token())
}

export function crearAgente(input: AgenteAsistenciaInput): Promise<AgenteConToken> {
  return api.post<AgenteConToken>('/asistencia/agentes/', input, token())
}

export function actualizarAgente(
  id: number,
  input: Partial<AgenteAsistenciaInput>,
): Promise<AgenteAsistencia> {
  return api.patch<AgenteAsistencia>(`/asistencia/agentes/${id}/`, input, token())
}

export function eliminarAgente(id: number): Promise<void> {
  return api.del<void>(`/asistencia/agentes/${id}/`, token())
}

export function regenerarTokenAgente(
  id: number,
): Promise<{ id: number; token: string; token_prefijo: string }> {
  return api.post(`/asistencia/agentes/${id}/regenerar-token/`, undefined, token())
}

// --- Asignaciones de números -------------------------------------------------

export type MapeoConAplicadas = MapeoAsistencia & { fichadas_actualizadas?: number }

export function listarMapeos(): Promise<MapeoAsistencia[]> {
  return api.get<MapeoAsistencia[]>('/asistencia/mapeos/', token())
}

export function crearMapeo(input: {
  dispositivo: number | null
  numero_reloj: string
  empleado: number
}): Promise<MapeoConAplicadas> {
  return api.post<MapeoConAplicadas>('/asistencia/mapeos/', input, token())
}

export function actualizarMapeo(
  id: number,
  input: { dispositivo?: number | null; numero_reloj?: string; empleado?: number },
): Promise<MapeoConAplicadas> {
  return api.patch<MapeoConAplicadas>(`/asistencia/mapeos/${id}/`, input, token())
}

export function eliminarMapeo(id: number): Promise<void> {
  return api.del<void>(`/asistencia/mapeos/${id}/`, token())
}

// --- Config del agente (descarga desde la UI) --------------------------------

/**
 * Genera el `config.toml` que se instala en la notebook de la sucursal.
 * Incluye el token (se descarga solo al crearlo/regenerarlo).
 */
export function generarConfigToml(opciones: {
  agenteNombre: string
  relojNombre: string
  sucursalNombre: string
  host: string
  usuarioIsapi: string
  tokenAgente: string
}): string {
  const base = window.location.origin
  return [
    '# Configuración del agente de asistencia CelTuc',
    `# Sucursal: ${opciones.sucursalNombre} — Reloj: ${opciones.relojNombre}`,
    '# Generado desde CelTuc → Asistencia. Los intervalos y demás parámetros',
    '# se administran desde la web y llegan al agente automáticamente.',
    '',
    '[agent]',
    `id = "${opciones.agenteNombre}"`,
    '',
    '[backend]',
    `base_url = "${base}"`,
    `token = "${opciones.tokenAgente}"`,
    '',
    '[hikvision]',
    `host = "${opciones.host}"`,
    `username = "${opciones.usuarioIsapi}"`,
    '# La contraseña del reloj NO va acá: en la notebook correr',
    '#   hikvision-agent.exe secrets set',
    '',
  ].join('\n')
}

export function descargarArchivo(nombre: string, contenido: string) {
  const blob = new Blob([contenido], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  enlace.click()
  URL.revokeObjectURL(url)
}
