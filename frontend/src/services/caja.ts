import type {
  CajaConfig,
  CajaRegistradora,
  CierreCaja,
  ConteoBilletes,
  MedioPagoCaja,
  MovimientoCaja,
  SesionCaja,
  TipoMovimientoCaja,
} from '@/types'
import { MEDIOS_PAGO_CAJA } from '@/types'
import { api } from '@/lib/api'
import { useAuth } from '@/store/auth'

/**
 * Servicio de Caja contra el backend (Django REST, app `caja`). Mantiene las
 * mismas firmas que tenía la versión demo en localStorage, así los componentes
 * no cambian: acá adentro se traduce snake_case ↔ camelCase y los ids
 * numéricos del backend viajan como string hacia la UI.
 */

const token = () => useAuth.getState().access

function mediosEnCero(): Record<MedioPagoCaja, number> {
  const r = {} as Record<MedioPagoCaja, number>
  for (const m of MEDIOS_PAGO_CAJA) r[m.value] = 0
  return r
}

/** Normaliza un dict por medio del backend: todas las claves, valores numéricos. */
function porMedio(dto: Record<string, number> | null | undefined): Record<MedioPagoCaja, number> {
  const r = mediosEnCero()
  for (const m of MEDIOS_PAGO_CAJA) r[m.value] = Number(dto?.[m.value] ?? 0)
  return r
}

// ===== DTOs del backend ======================================================

interface ConfigDTO {
  cierre_ciego: boolean
  tolerancia_activa: boolean
  tolerancia_monto: number
  retiros_habilitados: boolean
  multi_caja: boolean
  exigir_lote: boolean
  fondo_sugerido: number
  denominaciones: number[]
}

interface CajaDTO {
  id: number
  nombre: string
  orden: number
  activa: boolean
  creado: string
}

interface SesionDTO {
  id: number
  caja: number
  numero: number
  estado: 'abierta' | 'cerrada'
  abierta_por: string | null
  abierta_en: string
  fondo_inicial: number
  conteo_apertura: Record<string, number> | null
  nota_apertura: string
}

interface MovimientoDTO {
  id: number
  caja: number
  sesion: number
  tipo: TipoMovimientoCaja
  medio: MedioPagoCaja
  monto: number
  motivo: string
  detalle: string
  venta: number | null
  usuario: string | null
  fecha: string
}

interface CierreDTO {
  id: number
  numero: number
  caja: number
  caja_nombre: string
  sesion: number
  sesion_numero: number
  abierta_en: string
  cerrada_en: string
  abierta_por: string | null
  cerrado_por: string | null
  fondo_inicial: number
  ventas_por_medio: Record<string, number>
  operaciones_por_medio: Record<string, number>
  ingresos: number
  egresos: number
  retiros: number
  esperado_por_medio: Record<string, number>
  contado_por_medio: Record<string, number>
  conteo_cierre: Record<string, number> | null
  diferencia_por_medio: Record<string, number>
  diferencia_total: number
  motivo_diferencia: string
  nota_diferencia: string
  cierre_ciego: boolean
  fondo_siguiente: number
  retiro_final: number
  movimientos: MovimientoDTO[]
}

// ===== Mapeos DTO → tipos de la UI ==========================================

function mapConfig(dto: ConfigDTO): CajaConfig {
  return {
    cierreCiego: dto.cierre_ciego,
    toleranciaActiva: dto.tolerancia_activa,
    toleranciaMonto: Number(dto.tolerancia_monto),
    retirosHabilitados: dto.retiros_habilitados,
    multiCaja: dto.multi_caja,
    exigirLote: dto.exigir_lote,
    fondoSugerido: Number(dto.fondo_sugerido),
    denominaciones: dto.denominaciones.map(Number),
  }
}

function mapCaja(dto: CajaDTO): CajaRegistradora {
  return { id: String(dto.id), nombre: dto.nombre, activa: dto.activa, creadaEn: dto.creado }
}

function mapSesion(dto: SesionDTO): SesionCaja {
  return {
    id: String(dto.id),
    cajaId: String(dto.caja),
    numero: dto.numero,
    estado: dto.estado,
    abiertaPor: dto.abierta_por ?? '—',
    abiertaEn: dto.abierta_en,
    fondoInicial: Number(dto.fondo_inicial),
    conteoApertura: (dto.conteo_apertura as ConteoBilletes | null) ?? undefined,
    notaApertura: dto.nota_apertura || undefined,
  }
}

function mapMovimiento(dto: MovimientoDTO): MovimientoCaja {
  return {
    id: String(dto.id),
    cajaId: String(dto.caja),
    sesionId: String(dto.sesion),
    tipo: dto.tipo,
    medio: dto.medio,
    monto: Number(dto.monto),
    motivo: dto.motivo,
    detalle: dto.detalle || undefined,
    usuario: dto.usuario ?? '—',
    fecha: dto.fecha,
  }
}

function mapCierre(dto: CierreDTO): CierreCaja {
  return {
    id: String(dto.id),
    numero: dto.numero,
    cajaId: String(dto.caja),
    cajaNombre: dto.caja_nombre,
    sesionId: String(dto.sesion),
    sesionNumero: dto.sesion_numero,
    abiertaEn: dto.abierta_en,
    cerradaEn: dto.cerrada_en,
    abiertaPor: dto.abierta_por ?? '—',
    cerradoPor: dto.cerrado_por ?? '—',
    fondoInicial: Number(dto.fondo_inicial),
    ventasPorMedio: porMedio(dto.ventas_por_medio),
    operacionesPorMedio: porMedio(dto.operaciones_por_medio),
    ingresos: Number(dto.ingresos),
    egresos: Number(dto.egresos),
    retiros: Number(dto.retiros),
    esperadoPorMedio: porMedio(dto.esperado_por_medio),
    contadoPorMedio: porMedio(dto.contado_por_medio),
    conteoCierre: (dto.conteo_cierre as ConteoBilletes | null) ?? undefined,
    diferenciaPorMedio: porMedio(dto.diferencia_por_medio),
    diferenciaTotal: Number(dto.diferencia_total),
    motivoDiferencia: dto.motivo_diferencia || undefined,
    notaDiferencia: dto.nota_diferencia || undefined,
    cierreCiego: dto.cierre_ciego,
    fondoSiguiente: Number(dto.fondo_siguiente),
    retiroFinal: Number(dto.retiro_final),
    movimientos: dto.movimientos.map(mapMovimiento),
  }
}

// ===== Config =================================================================

export async function obtenerConfigCaja(): Promise<CajaConfig> {
  return mapConfig(await api.get<ConfigDTO>('/caja/config/', token()))
}

export async function guardarConfigCaja(input: Partial<CajaConfig>): Promise<CajaConfig> {
  const body: Partial<ConfigDTO> = {}
  if (input.cierreCiego !== undefined) body.cierre_ciego = input.cierreCiego
  if (input.toleranciaActiva !== undefined) body.tolerancia_activa = input.toleranciaActiva
  if (input.toleranciaMonto !== undefined) body.tolerancia_monto = input.toleranciaMonto
  if (input.retirosHabilitados !== undefined) body.retiros_habilitados = input.retirosHabilitados
  if (input.multiCaja !== undefined) body.multi_caja = input.multiCaja
  if (input.exigirLote !== undefined) body.exigir_lote = input.exigirLote
  if (input.fondoSugerido !== undefined) body.fondo_sugerido = input.fondoSugerido
  if (input.denominaciones !== undefined) body.denominaciones = input.denominaciones
  return mapConfig(await api.patch<ConfigDTO>('/caja/config/', body, token()))
}

// ===== Cajas ==================================================================

export async function listarCajas(): Promise<CajaRegistradora[]> {
  const cajas = await api.get<CajaDTO[]>('/caja/cajas/', token())
  return cajas.map(mapCaja)
}

export async function crearCaja(nombre: string): Promise<CajaRegistradora> {
  return mapCaja(await api.post<CajaDTO>('/caja/cajas/', { nombre: nombre.trim() }, token()))
}

export async function actualizarCaja(
  id: string,
  input: Partial<Pick<CajaRegistradora, 'nombre' | 'activa'>>,
): Promise<CajaRegistradora> {
  return mapCaja(await api.patch<CajaDTO>(`/caja/cajas/${id}/`, input, token()))
}

export async function eliminarCaja(id: string): Promise<void> {
  await api.del<void>(`/caja/cajas/${id}/`, token())
}

// ===== Turno (sesión) =========================================================

export interface EstadoCaja {
  sesion: SesionCaja | null
  movimientos: MovimientoCaja[]
}

/** Turno abierto de una caja (o null) con sus movimientos ordenados por hora. */
export async function obtenerEstadoCaja(cajaId: string): Promise<EstadoCaja> {
  const dto = await api.get<{ sesion: SesionDTO | null; movimientos: MovimientoDTO[] }>(
    `/caja/cajas/${cajaId}/estado/`,
    token(),
  )
  return {
    sesion: dto.sesion ? mapSesion(dto.sesion) : null,
    movimientos: dto.movimientos.map(mapMovimiento),
  }
}

/** Ids de las cajas que tienen un turno abierto (para el selector multi-caja). */
export async function cajasConTurnoAbierto(): Promise<string[]> {
  const ids = await api.get<number[]>('/caja/abiertas/', token())
  return ids.map(String)
}

export interface AbrirCajaInput {
  cajaId: string
  fondoInicial: number
  conteoApertura?: ConteoBilletes
  notaApertura?: string
  /** Lo determina el backend con la sesión; queda por compatibilidad de firma. */
  usuario: string
}

export async function abrirCaja(input: AbrirCajaInput): Promise<SesionCaja> {
  const dto = await api.post<SesionDTO>(
    '/caja/abrir/',
    {
      caja: Number(input.cajaId),
      fondo_inicial: input.fondoInicial,
      conteo_apertura: input.conteoApertura ?? null,
      nota_apertura: input.notaApertura ?? '',
    },
    token(),
  )
  return mapSesion(dto)
}

// ===== Movimientos ============================================================

export interface MovimientoInput {
  sesionId: string
  tipo: TipoMovimientoCaja
  medio: MedioPagoCaja
  monto: number
  motivo: string
  detalle?: string
  /** Lo determina el backend; queda por compatibilidad de firma. */
  usuario: string
}

export async function registrarMovimiento(input: MovimientoInput): Promise<MovimientoCaja> {
  const dto = await api.post<MovimientoDTO>(
    '/caja/movimientos/',
    {
      sesion: Number(input.sesionId),
      tipo: input.tipo,
      medio: input.medio,
      monto: input.monto,
      motivo: input.motivo,
      detalle: input.detalle ?? '',
    },
    token(),
  )
  return mapMovimiento(dto)
}

export async function eliminarMovimiento(id: string): Promise<void> {
  await api.del<void>(`/caja/movimientos/${id}/`, token())
}

// ===== Resumen (esperado por medio) ==========================================

export interface ResumenSesion {
  ventasPorMedio: Record<MedioPagoCaja, number>
  operacionesPorMedio: Record<MedioPagoCaja, number>
  ventasTotal: number
  operacionesTotal: number
  ingresos: number
  egresos: number
  retiros: number
  movimientosManuales: number
  /** Efectivo: fondo + ventas + ingresos − egresos − retiros. Resto: sus ventas. */
  esperadoPorMedio: Record<MedioPagoCaja, number>
}

/** Cálculo puro y sincrónico (mismo criterio que el backend al cerrar). */
export function calcularResumenSesion(sesion: SesionCaja, movimientos: MovimientoCaja[]): ResumenSesion {
  const ventasPorMedio = mediosEnCero()
  const operacionesPorMedio = mediosEnCero()
  let ingresos = 0
  let egresos = 0
  let retiros = 0
  let manuales = 0

  for (const m of movimientos) {
    if (m.tipo === 'venta') {
      ventasPorMedio[m.medio] += m.monto
      operacionesPorMedio[m.medio] += 1
    } else {
      manuales += 1
      if (m.tipo === 'ingreso') ingresos += m.monto
      if (m.tipo === 'egreso') egresos += m.monto
      if (m.tipo === 'retiro') retiros += m.monto
    }
  }

  const esperadoPorMedio = { ...ventasPorMedio }
  esperadoPorMedio.efectivo = sesion.fondoInicial + ventasPorMedio.efectivo + ingresos - egresos - retiros

  const ventasTotal = Object.values(ventasPorMedio).reduce((a, v) => a + v, 0)
  const operacionesTotal = Object.values(operacionesPorMedio).reduce((a, v) => a + v, 0)

  return {
    ventasPorMedio,
    operacionesPorMedio,
    ventasTotal,
    operacionesTotal,
    ingresos,
    egresos,
    retiros,
    movimientosManuales: manuales,
    esperadoPorMedio,
  }
}

// ===== Cierre (comprobante Z) =================================================

export interface CerrarCajaInput {
  sesionId: string
  contadoPorMedio: Record<MedioPagoCaja, number>
  conteoCierre?: ConteoBilletes
  fondoSiguiente: number
  motivoDiferencia?: string
  notaDiferencia?: string
  /** Lo determina el backend; queda por compatibilidad de firma. */
  usuario: string
}

export async function cerrarCaja(input: CerrarCajaInput): Promise<CierreCaja> {
  const dto = await api.post<CierreDTO>(
    '/caja/cerrar/',
    {
      sesion: Number(input.sesionId),
      contado_por_medio: input.contadoPorMedio,
      conteo_cierre: input.conteoCierre ?? null,
      fondo_siguiente: input.fondoSiguiente,
      motivo_diferencia: input.motivoDiferencia ?? '',
      nota_diferencia: input.notaDiferencia ?? '',
    },
    token(),
  )
  return mapCierre(dto)
}

/** Historial de comprobantes Z (más recientes primero). */
export async function listarCierres(): Promise<CierreCaja[]> {
  const cierres = await api.get<CierreDTO[]>('/caja/cierres/?limite=200', token())
  return cierres.map(mapCierre)
}

/** Último cierre de una caja (para sugerir el fondo al reabrir). */
export async function ultimoCierreDeCaja(cajaId: string): Promise<CierreCaja | null> {
  const cierres = await api.get<CierreDTO[]>(`/caja/cierres/?caja=${cajaId}&limite=1`, token())
  return cierres.length > 0 ? mapCierre(cierres[0]) : null
}
