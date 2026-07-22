import type {
  CajaConfig,
  CajaRegistradora,
  CierreCaja,
  MedioPagoCaja,
  MovimientoCaja,
  SesionCaja,
} from '@/types'
import { MEDIOS_PAGO_CAJA } from '@/types'
import type { AbrirCajaInput, CerrarCajaInput, EstadoCaja, MovimientoInput } from '@/services/caja'
import { calcularResumenSesion } from '@/services/caja'

/**
 * Modo práctica de Caja (patrón "test mode" de Stripe): un sandbox 100 % en
 * memoria con las MISMAS firmas que `services/caja.ts`, así la página solo
 * cambia de servicio. Nunca toca la API ni localStorage: nada se crea, nada
 * se guarda — al salir (o recargar) el ensayo desaparece.
 */

const wait = (ms = 150) => new Promise<void>((r) => setTimeout(r, ms))

let _seq = 0
const uid = (prefijo: string) => `${prefijo}-practica-${++_seq}`

function mediosEnCero(): Record<MedioPagoCaja, number> {
  const r = {} as Record<MedioPagoCaja, number>
  for (const m of MEDIOS_PAGO_CAJA) r[m.value] = 0
  return r
}

interface SandboxDB {
  config: CajaConfig
  caja: CajaRegistradora
  sesion: SesionCaja | null
  movimientos: MovimientoCaja[]
  cierres: CierreCaja[]
  proximoZ: number
  proximoTurno: number
}

function seed(): SandboxDB {
  return {
    // El esperado queda visible (sin cierre ciego): en el ensayo conviene VER
    // cómo se mueve el número para entender el arqueo.
    config: {
      cierreCiego: false,
      toleranciaActiva: true,
      toleranciaMonto: 2000,
      retirosHabilitados: true,
      multiCaja: false,
      exigirLote: true,
      fondoSugerido: 10000,
      denominaciones: [20000, 10000, 2000, 1000, 500, 200, 100],
    },
    caja: {
      id: 'practica',
      nombre: 'Caja de práctica',
      canal: '',
      activa: true,
      creadaEn: new Date().toISOString(),
    },
    sesion: null,
    movimientos: [],
    cierres: [],
    proximoZ: 1,
    proximoTurno: 1,
  }
}

let _db = seed()

/** Vuelve el sandbox a cero (se llama al entrar y al salir del modo práctica). */
export function resetPractica(): void {
  _db = seed()
}

// ===== Config / cajas =========================================================

export async function obtenerConfigCaja(): Promise<CajaConfig> {
  await wait()
  return { ..._db.config, denominaciones: [..._db.config.denominaciones] }
}

export async function listarCajas(): Promise<CajaRegistradora[]> {
  await wait()
  return [{ ..._db.caja }]
}

export async function cajasConTurnoAbierto(): Promise<string[]> {
  await wait(60)
  return _db.sesion ? [_db.caja.id] : []
}

// ===== Turno ==================================================================

export async function obtenerEstadoCaja(_cajaId: string): Promise<EstadoCaja> {
  await wait()
  return {
    sesion: _db.sesion ? { ..._db.sesion } : null,
    movimientos: _db.movimientos.map((m) => ({ ...m })),
  }
}

export async function abrirCaja(input: AbrirCajaInput): Promise<SesionCaja> {
  await wait()
  if (_db.sesion) throw new Error('La caja de práctica ya tiene un turno abierto.')
  if (input.fondoInicial < 0) throw new Error('El fondo no puede ser negativo.')
  _db.sesion = {
    id: uid('ses'),
    cajaId: _db.caja.id,
    numero: _db.proximoTurno++,
    estado: 'abierta',
    abiertaPor: input.usuario,
    abiertaEn: new Date().toISOString(),
    fondoInicial: input.fondoInicial,
    conteoApertura: input.conteoApertura,
    notaApertura: input.notaApertura,
  }
  _db.movimientos = []
  return { ..._db.sesion }
}

// ===== Movimientos ============================================================

export async function registrarMovimiento(input: MovimientoInput): Promise<MovimientoCaja> {
  await wait()
  const sesion = _db.sesion
  if (!sesion || sesion.id !== input.sesionId) throw new Error('El turno ya no está abierto.')
  if (!(input.monto > 0)) throw new Error('El monto tiene que ser mayor a cero.')
  if (input.tipo === 'retiro' && !_db.config.retirosHabilitados) {
    throw new Error('Los retiros están deshabilitados.')
  }
  if (input.tipo === 'egreso' || input.tipo === 'retiro') {
    const disponible = calcularResumenSesion(sesion, _db.movimientos).esperadoPorMedio.efectivo
    if (input.monto > disponible) {
      throw new Error('No hay suficiente efectivo en la caja de práctica para ese monto.')
    }
  }
  const movimiento: MovimientoCaja = {
    id: uid('mov'),
    cajaId: _db.caja.id,
    sesionId: sesion.id,
    tipo: input.tipo,
    medio: input.tipo === 'venta' ? input.medio : 'efectivo',
    monto: input.monto,
    motivo: input.motivo.trim(),
    detalle: input.detalle?.trim() || undefined,
    usuario: input.usuario,
    fecha: new Date().toISOString(),
  }
  _db.movimientos.push(movimiento)
  return { ...movimiento }
}

export async function eliminarMovimiento(id: string): Promise<void> {
  await wait()
  if (!_db.sesion) throw new Error('El turno ya no está abierto.')
  _db.movimientos = _db.movimientos.filter((m) => m.id !== id)
}

// ===== Cierre =================================================================

export async function cerrarCaja(input: CerrarCajaInput): Promise<CierreCaja> {
  await wait()
  const sesion = _db.sesion
  if (!sesion || sesion.id !== input.sesionId) throw new Error('El turno ya no está abierto.')

  const resumen = calcularResumenSesion(sesion, _db.movimientos)
  const diferenciaPorMedio = mediosEnCero()
  let diferenciaTotal = 0
  for (const m of MEDIOS_PAGO_CAJA) {
    const d = (input.contadoPorMedio[m.value] ?? 0) - resumen.esperadoPorMedio[m.value]
    diferenciaPorMedio[m.value] = d
    diferenciaTotal += d
  }
  const contadoEfectivo = input.contadoPorMedio.efectivo ?? 0
  const fondoSiguiente = Math.min(Math.max(0, input.fondoSiguiente), contadoEfectivo)

  const cierre: CierreCaja = {
    id: uid('cie'),
    numero: _db.proximoZ++,
    cajaId: _db.caja.id,
    cajaNombre: _db.caja.nombre,
    sesionId: sesion.id,
    sesionNumero: sesion.numero,
    abiertaEn: sesion.abiertaEn,
    cerradaEn: new Date().toISOString(),
    abiertaPor: sesion.abiertaPor,
    cerradoPor: input.usuario,
    fondoInicial: sesion.fondoInicial,
    ventasPorMedio: resumen.ventasPorMedio,
    operacionesPorMedio: resumen.operacionesPorMedio,
    ingresos: resumen.ingresos,
    egresos: resumen.egresos,
    retiros: resumen.retiros,
    esperadoPorMedio: resumen.esperadoPorMedio,
    contadoPorMedio: { ...input.contadoPorMedio },
    conteoCierre: input.conteoCierre,
    diferenciaPorMedio,
    diferenciaTotal,
    motivoDiferencia: input.motivoDiferencia?.trim() || undefined,
    notaDiferencia: input.notaDiferencia?.trim() || undefined,
    cierreCiego: _db.config.cierreCiego,
    fondoSiguiente,
    retiroFinal: Math.max(0, contadoEfectivo - fondoSiguiente),
    movimientos: _db.movimientos.map((m) => ({ ...m })),
  }
  _db.cierres.unshift(cierre)
  _db.sesion = null
  _db.movimientos = []
  return { ...cierre }
}

export async function listarCierres(): Promise<CierreCaja[]> {
  await wait()
  return _db.cierres.map((c) => ({ ...c }))
}

export async function ultimoCierreDeCaja(_cajaId: string): Promise<CierreCaja | null> {
  await wait(60)
  return _db.cierres.length > 0 ? { ..._db.cierres[0] } : null
}
