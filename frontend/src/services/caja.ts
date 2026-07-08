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
import { getCajaDB, mediosEnCero, persistCaja } from '@/lib/cajaDb'
import { uid, wait } from '@/lib/db'

/**
 * Servicio del módulo Caja. 100 % front por ahora: lee/escribe la base local
 * (`lib/cajaDb.ts`) detrás de promesas, con la misma forma que tendrá la API
 * real cuando se conecte el backend.
 */

// ===== Config =================================================================

export async function obtenerConfigCaja(): Promise<CajaConfig> {
  await wait()
  return { ...getCajaDB().config, denominaciones: [...getCajaDB().config.denominaciones] }
}

export async function guardarConfigCaja(input: Partial<CajaConfig>): Promise<CajaConfig> {
  await wait()
  const db = getCajaDB()
  const denominaciones = (input.denominaciones ?? db.config.denominaciones)
    .slice()
    .sort((a, b) => b - a)
  if (denominaciones.length === 0) throw new Error('Dejá al menos una denominación activa.')
  db.config = { ...db.config, ...input, denominaciones }
  persistCaja()
  return { ...db.config }
}

// ===== Cajas ==================================================================

export async function listarCajas(): Promise<CajaRegistradora[]> {
  await wait()
  return getCajaDB().cajas.map((c) => ({ ...c }))
}

export async function crearCaja(nombre: string): Promise<CajaRegistradora> {
  await wait()
  const db = getCajaDB()
  const limpio = nombre.trim()
  if (!limpio) throw new Error('El nombre no puede estar vacío.')
  if (db.cajas.some((c) => c.nombre.toLowerCase() === limpio.toLowerCase())) {
    throw new Error('Ya existe una caja con ese nombre.')
  }
  const caja: CajaRegistradora = { id: uid('caja'), nombre: limpio, activa: true, creadaEn: new Date().toISOString() }
  db.cajas.push(caja)
  persistCaja()
  return { ...caja }
}

export async function actualizarCaja(
  id: string,
  input: Partial<Pick<CajaRegistradora, 'nombre' | 'activa'>>,
): Promise<CajaRegistradora> {
  await wait()
  const db = getCajaDB()
  const caja = db.cajas.find((c) => c.id === id)
  if (!caja) throw new Error('La caja no existe.')
  if (input.nombre !== undefined) {
    const limpio = input.nombre.trim()
    if (!limpio) throw new Error('El nombre no puede estar vacío.')
    caja.nombre = limpio
  }
  if (input.activa !== undefined) caja.activa = input.activa
  persistCaja()
  return { ...caja }
}

export async function eliminarCaja(id: string): Promise<void> {
  await wait()
  const db = getCajaDB()
  if (db.cajas.length <= 1) throw new Error('Tiene que quedar al menos una caja.')
  if (db.sesiones.some((s) => s.cajaId === id && s.estado === 'abierta')) {
    throw new Error('Cerrá el turno de esa caja antes de eliminarla.')
  }
  db.cajas = db.cajas.filter((c) => c.id !== id)
  persistCaja()
}

// ===== Turno (sesión) =========================================================

export interface EstadoCaja {
  sesion: SesionCaja | null
  movimientos: MovimientoCaja[]
}

/** Turno abierto de una caja (o null) con sus movimientos ordenados por hora. */
export async function obtenerEstadoCaja(cajaId: string): Promise<EstadoCaja> {
  await wait()
  const db = getCajaDB()
  const sesion = db.sesiones.find((s) => s.cajaId === cajaId && s.estado === 'abierta') ?? null
  if (!sesion) return { sesion: null, movimientos: [] }
  const movimientos = db.movimientos
    .filter((m) => m.sesionId === sesion.id)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((m) => ({ ...m }))
  return { sesion: { ...sesion }, movimientos }
}

/** Ids de las cajas que tienen un turno abierto (para el selector multi-caja). */
export async function cajasConTurnoAbierto(): Promise<string[]> {
  await wait(60)
  return getCajaDB()
    .sesiones.filter((s) => s.estado === 'abierta')
    .map((s) => s.cajaId)
}

export interface AbrirCajaInput {
  cajaId: string
  fondoInicial: number
  conteoApertura?: ConteoBilletes
  notaApertura?: string
  usuario: string
}

export async function abrirCaja(input: AbrirCajaInput): Promise<SesionCaja> {
  await wait()
  const db = getCajaDB()
  if (db.sesiones.some((s) => s.cajaId === input.cajaId && s.estado === 'abierta')) {
    throw new Error('Esa caja ya tiene un turno abierto.')
  }
  if (input.fondoInicial < 0) throw new Error('El fondo no puede ser negativo.')
  const sesion: SesionCaja = {
    id: uid('ses'),
    cajaId: input.cajaId,
    numero: db.proximoTurno++,
    estado: 'abierta',
    abiertaPor: input.usuario,
    abiertaEn: new Date().toISOString(),
    fondoInicial: input.fondoInicial,
    conteoApertura: input.conteoApertura,
    notaApertura: input.notaApertura?.trim() || undefined,
  }
  db.sesiones.push(sesion)
  persistCaja()
  return { ...sesion }
}

// ===== Movimientos ============================================================

export interface MovimientoInput {
  sesionId: string
  tipo: TipoMovimientoCaja
  medio: MedioPagoCaja
  monto: number
  motivo: string
  detalle?: string
  usuario: string
}

export async function registrarMovimiento(input: MovimientoInput): Promise<MovimientoCaja> {
  await wait()
  const db = getCajaDB()
  const sesion = db.sesiones.find((s) => s.id === input.sesionId && s.estado === 'abierta')
  if (!sesion) throw new Error('El turno ya no está abierto.')
  if (!(input.monto > 0)) throw new Error('El monto tiene que ser mayor a cero.')
  if (input.tipo === 'retiro' && !db.config.retirosHabilitados) {
    throw new Error('Los retiros a bóveda están deshabilitados en la configuración.')
  }
  // Un egreso/retiro no puede sacar más efectivo del que hay en el cajón.
  if (input.tipo === 'egreso' || input.tipo === 'retiro') {
    const movs = db.movimientos.filter((m) => m.sesionId === sesion.id)
    const disponible = calcularResumenSesion(sesion, movs).esperadoPorMedio.efectivo
    if (input.monto > disponible) {
      throw new Error('No hay suficiente efectivo en caja para ese monto.')
    }
  }
  const movimiento: MovimientoCaja = {
    id: uid('mov'),
    cajaId: sesion.cajaId,
    sesionId: sesion.id,
    tipo: input.tipo,
    medio: input.tipo === 'venta' ? input.medio : 'efectivo',
    monto: input.monto,
    motivo: input.motivo.trim(),
    detalle: input.detalle?.trim() || undefined,
    usuario: input.usuario,
    fecha: new Date().toISOString(),
  }
  db.movimientos.push(movimiento)
  persistCaja()
  return { ...movimiento }
}

export async function eliminarMovimiento(id: string): Promise<void> {
  await wait()
  const db = getCajaDB()
  const mov = db.movimientos.find((m) => m.id === id)
  if (!mov) throw new Error('El movimiento no existe.')
  const sesion = db.sesiones.find((s) => s.id === mov.sesionId)
  if (!sesion || sesion.estado !== 'abierta') {
    throw new Error('Los movimientos de un turno cerrado son inmutables.')
  }
  db.movimientos = db.movimientos.filter((m) => m.id !== id)
  persistCaja()
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

/** Cálculo puro y sincrónico: lo usan la página, el asistente de cierre y el servicio. */
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
  usuario: string
}

export async function cerrarCaja(input: CerrarCajaInput): Promise<CierreCaja> {
  await wait()
  const db = getCajaDB()
  const sesion = db.sesiones.find((s) => s.id === input.sesionId && s.estado === 'abierta')
  if (!sesion) throw new Error('El turno ya no está abierto.')
  if (input.fondoSiguiente < 0) throw new Error('El fondo siguiente no puede ser negativo.')

  const caja = db.cajas.find((c) => c.id === sesion.cajaId)
  const movimientos = db.movimientos
    .filter((m) => m.sesionId === sesion.id)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
  const resumen = calcularResumenSesion(sesion, movimientos)

  const diferenciaPorMedio = mediosEnCero()
  let diferenciaTotal = 0
  for (const medio of Object.keys(diferenciaPorMedio) as MedioPagoCaja[]) {
    const d = (input.contadoPorMedio[medio] ?? 0) - resumen.esperadoPorMedio[medio]
    diferenciaPorMedio[medio] = d
    diferenciaTotal += d
  }

  const contadoEfectivo = input.contadoPorMedio.efectivo ?? 0
  const cierre: CierreCaja = {
    id: uid('cie'),
    numero: db.proximoZ++,
    cajaId: sesion.cajaId,
    cajaNombre: caja?.nombre ?? 'Caja',
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
    cierreCiego: db.config.cierreCiego,
    fondoSiguiente: input.fondoSiguiente,
    retiroFinal: Math.max(0, contadoEfectivo - input.fondoSiguiente),
    movimientos: movimientos.map((m) => ({ ...m })),
  }

  // El turno queda cerrado y sus movimientos viven solo dentro del Z.
  sesion.estado = 'cerrada'
  db.movimientos = db.movimientos.filter((m) => m.sesionId !== sesion.id)
  db.cierres.unshift(cierre)
  persistCaja()
  return { ...cierre }
}

/** Historial de comprobantes Z (más recientes primero). */
export async function listarCierres(): Promise<CierreCaja[]> {
  await wait()
  return getCajaDB()
    .cierres.slice()
    .sort((a, b) => b.cerradaEn.localeCompare(a.cerradaEn))
    .map((c) => ({ ...c }))
}

/** Último cierre de una caja (para sugerir el fondo al reabrir). */
export async function ultimoCierreDeCaja(cajaId: string): Promise<CierreCaja | null> {
  await wait(60)
  const cierres = getCajaDB().cierres.filter((c) => c.cajaId === cajaId)
  if (cierres.length === 0) return null
  return { ...cierres.slice().sort((a, b) => b.cerradaEn.localeCompare(a.cerradaEn))[0] }
}
