import type {
  AgenteAsistencia,
  AgenteAsistenciaInput,
  AsignacionTurno,
  FeriadoAsistencia,
  FichadaDetalle,
  LicenciaAsistencia,
  MapeoAsistencia,
  NumeroSinMapear,
  PaginaFichadas,
  PanelAsistencia,
  RelojAsistencia,
  RelojAsistenciaInput,
  RespuestaResumenAsistencia,
  TipoCicloTurno,
  TipoFeriado,
  TipoLicencia,
  TramoTurno,
  TurnoAsistencia,
} from '@/types'
import { api } from '@/lib/api'
import { useAuth } from '@/store/auth'

/** Módulo Asistencia (solo superadministrador): relojes, fichadas, turnos y licencias. */

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

// --- Resumen (jornadas calculadas) -------------------------------------------

export interface FiltrosResumen {
  desde?: string
  hasta?: string
  dispositivo?: number | ''
  sucursal?: number | ''
  empleado?: number | ''
}

/**
 * Jornadas ya analizadas por el backend: tramos, salidas parciales, turno
 * esperado, licencias y ausencias. Una fila por (empleado, día).
 */
export function resumenAsistencia(
  filtros: FiltrosResumen = {},
): Promise<RespuestaResumenAsistencia> {
  return api.get<RespuestaResumenAsistencia>(`/asistencia/resumen/${query(filtros)}`, token())
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

// --- Asignaciones de identificador -------------------------------------------

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

// --- Turnos (horarios) -------------------------------------------------------

export interface TurnoInput {
  nombre: string
  activo?: boolean
  tipo_ciclo?: TipoCicloTurno
  dias_ciclo?: number
  fecha_inicio_ciclo?: string | null
  tolerancia_entrada?: number
  tolerancia_salida?: number
  minutos_antirebote?: number
  tramos: TramoTurno[]
}

export function listarTurnos(): Promise<TurnoAsistencia[]> {
  return api.get<TurnoAsistencia[]>('/asistencia/turnos/', token())
}

export function crearTurno(input: TurnoInput): Promise<TurnoAsistencia> {
  return api.post<TurnoAsistencia>('/asistencia/turnos/', input, token())
}

export function actualizarTurno(
  id: number,
  input: Partial<TurnoInput>,
): Promise<TurnoAsistencia> {
  return api.patch<TurnoAsistencia>(`/asistencia/turnos/${id}/`, input, token())
}

export function eliminarTurno(id: number): Promise<void> {
  return api.del<void>(`/asistencia/turnos/${id}/`, token())
}

// --- Asignación de turno a empleado ------------------------------------------

export interface AsignacionInput {
  empleado: number
  turno: number
  desde: string
  hasta?: string | null
  desfase_ciclo?: number
}

export function listarAsignaciones(soloVigentes = false): Promise<AsignacionTurno[]> {
  return api.get<AsignacionTurno[]>(
    `/asistencia/asignaciones/${soloVigentes ? '?vigentes=1' : ''}`,
    token(),
  )
}

export function crearAsignacion(input: AsignacionInput): Promise<AsignacionTurno> {
  return api.post<AsignacionTurno>('/asistencia/asignaciones/', input, token())
}

export function actualizarAsignacion(
  id: number,
  input: Partial<AsignacionInput>,
): Promise<AsignacionTurno> {
  return api.patch<AsignacionTurno>(`/asistencia/asignaciones/${id}/`, input, token())
}

export function eliminarAsignacion(id: number): Promise<void> {
  return api.del<void>(`/asistencia/asignaciones/${id}/`, token())
}

// --- Licencias ---------------------------------------------------------------

export interface LicenciaInput {
  empleado: number
  tipo: TipoLicencia
  desde: string
  hasta: string
  /** false = licencia por horas: solo se descuenta esa franja del turno. */
  jornada_completa?: boolean
  hora_desde?: string | null
  hora_hasta?: string | null
  observacion?: string
}

export interface FiltrosLicencias {
  empleado?: number | ''
  tipo?: string
  desde?: string
  hasta?: string
}

export function listarLicencias(filtros: FiltrosLicencias = {}): Promise<LicenciaAsistencia[]> {
  return api.get<LicenciaAsistencia[]>(`/asistencia/licencias/${query(filtros)}`, token())
}

export function crearLicencia(input: LicenciaInput): Promise<LicenciaAsistencia> {
  return api.post<LicenciaAsistencia>('/asistencia/licencias/', input, token())
}

export function actualizarLicencia(
  id: number,
  input: Partial<LicenciaInput>,
): Promise<LicenciaAsistencia> {
  return api.patch<LicenciaAsistencia>(`/asistencia/licencias/${id}/`, input, token())
}

export function eliminarLicencia(id: number): Promise<void> {
  return api.del<void>(`/asistencia/licencias/${id}/`, token())
}

// --- Feriados ----------------------------------------------------------------

export interface FeriadoInput {
  fecha: string
  nombre: string
  tipo: TipoFeriado
  /** null = todas las sucursales. */
  sucursal?: number | null
}

export function listarFeriados(filtros: { anio?: number; sucursal?: number | '' } = {}) {
  return api.get<FeriadoAsistencia[]>(`/asistencia/feriados/${query(filtros)}`, token())
}

export function crearFeriado(input: FeriadoInput): Promise<FeriadoAsistencia> {
  return api.post<FeriadoAsistencia>('/asistencia/feriados/', input, token())
}

export function actualizarFeriado(
  id: number,
  input: Partial<FeriadoInput>,
): Promise<FeriadoAsistencia> {
  return api.patch<FeriadoAsistencia>(`/asistencia/feriados/${id}/`, input, token())
}

export function eliminarFeriado(id: number): Promise<void> {
  return api.del<void>(`/asistencia/feriados/${id}/`, token())
}

/** Carga de una los feriados nacionales de fecha fija de un año. */
export function sembrarFeriados(anio: number): Promise<{
  creados: number
  omitidos: number
  resultados: FeriadoAsistencia[]
  aviso: string
}> {
  return api.post('/asistencia/feriados/sembrar/', { anio }, token())
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
