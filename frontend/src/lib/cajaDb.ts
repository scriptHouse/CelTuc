import type {
  CajaConfig,
  CajaRegistradora,
  CierreCaja,
  ConteoBilletes,
  MedioPagoCaja,
  MovimientoCaja,
  SesionCaja,
} from '@/types'
import { uid } from '@/lib/db'

/**
 * "Base de datos" local del módulo Caja (localStorage, clave propia para no
 * pisar `celtuc-db-v1`). Igual que `lib/db.ts`: los `services/caja.ts` leen y
 * escriben acá y devuelven promesas, como lo haría axios contra la API real.
 */

const KEY = 'celtuc-caja-v1'

export interface CajaDB {
  config: CajaConfig
  cajas: CajaRegistradora[]
  /** Turnos (el abierto y los ya cerrados, por auditoría). */
  sesiones: SesionCaja[]
  /** Movimientos de los turnos ABIERTOS (al cerrar quedan adentro del Z). */
  movimientos: MovimientoCaja[]
  /** Comprobantes Z, inmutables. */
  cierres: CierreCaja[]
  /** Próximo número de comprobante Z. */
  proximoZ: number
  /** Próximo número de turno. */
  proximoTurno: number
}

// --- Helpers de fechas de la semilla ----------------------------------------

const iso = (d: Date) => d.toISOString()

/** Hoy a las hh:mm (hora local). */
function hoyA(h: number, m: number): string {
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return iso(d)
}

/** Hace `dias` días a las hh:mm (hora local). */
function diaA(dias: number, h: number, m: number): string {
  const d = new Date()
  d.setDate(d.getDate() - dias)
  d.setHours(h, m, 0, 0)
  return iso(d)
}

/** Record con los cinco medios inicializados. */
export function mediosEnCero(): Record<MedioPagoCaja, number> {
  return { efectivo: 0, debito: 0, credito: 0, transferencia: 0, mercadopago: 0 }
}

// --- Semilla -----------------------------------------------------------------

function seed(): CajaDB {
  const ahora = iso(new Date())

  const config: CajaConfig = {
    cierreCiego: true,
    toleranciaActiva: true,
    toleranciaMonto: 2000,
    retirosHabilitados: true,
    multiCaja: true,
    exigirLote: true,
    fondoSugerido: 50000,
    denominaciones: [20000, 10000, 2000, 1000, 500, 200, 100],
  }

  const mostrador: CajaRegistradora = { id: 'caja-mostrador', nombre: 'Mostrador', activa: true, creadaEn: ahora }
  const service: CajaRegistradora = { id: 'caja-service', nombre: 'Service', activa: true, creadaEn: ahora }

  // Turno abierto hoy en Mostrador, con un día de trabajo ya cargado.
  const sesion: SesionCaja = {
    id: uid('ses'),
    cajaId: mostrador.id,
    numero: 5,
    estado: 'abierta',
    abiertaPor: 'Ludmila',
    abiertaEn: hoyA(9, 2),
    fondoInicial: 50000,
    conteoApertura: { 20000: 2, 10000: 1 },
    notaApertura: 'Fondo del cierre de ayer.',
  }

  const movimientos: MovimientoCaja[] = [
    venta(hoyA(9, 14), 'efectivo', 23000, 'Funda silicona + templado iPhone 13'),
    venta(hoyA(9, 40), 'debito', 45000, 'Cargador 25W + cable USB-C'),
    venta(hoyA(10, 5), 'efectivo', 60000, 'Cambio de batería iPhone 11 (service)'),
    venta(hoyA(10, 32), 'mercadopago', 38500, 'Auriculares TWS Pro'),
    venta(hoyA(11, 2), 'transferencia', 410000, 'Xiaomi Redmi Note 13'),
    mov(hoyA(11, 34), 'egreso', 30000, 'Pago a proveedor', 'Fundas y templados — Mayorista Norte'),
    venta(hoyA(12, 10), 'efectivo', 95000, 'Módulo Samsung A32 (service)'),
    venta(hoyA(12, 48), 'credito', 95400, 'Auriculares JBL Tune 520'),
    mov(hoyA(14, 10), 'retiro', 100000, 'Retiro a bóveda', 'Autorizó Isaías'),
    venta(hoyA(14, 36), 'efectivo', 18000, 'Vidrio templado x2'),
    venta(hoyA(15, 20), 'debito', 72800, 'Power bank 10.000mAh + funda'),
    venta(hoyA(16, 5), 'efectivo', 37500, 'Cambio de pin de carga (service)'),
    venta(hoyA(16, 40), 'mercadopago', 47800, 'Teclado + mouse inalámbrico'),
    venta(hoyA(17, 12), 'transferencia', 120000, 'Seña iPhone 15 128GB'),
  ]

  // Historial: cierres de los últimos días (uno con faltante justificado,
  // uno con sobrante chico y dos que cuadraron).
  const cierres: CierreCaja[] = [
    cierre({
      numero: 141, sesionNumero: 4, caja: mostrador, dias: 1,
      apertura: [9, 4], cierrePunto: [18, 32], abiertaPor: 'Ludmila', cerradoPor: 'Ludmila',
      fondo: 50000,
      ventas: { efectivo: [189500, 9], debito: [96000, 4], transferencia: [240000, 3], mercadopago: [52300, 4] },
      egresos: 12000, retiros: 80000,
      difEfectivo: 0, fondoSiguiente: 50000,
      conteo: { 20000: 7, 2000: 3, 1000: 1, 500: 1 },
    }),
    cierre({
      numero: 140, sesionNumero: 3, caja: service, dias: 1,
      apertura: [9, 30], cierrePunto: [18, 5], abiertaPor: 'Marcos', cerradoPor: 'Marcos',
      fondo: 30000,
      ventas: { efectivo: [92000, 5], debito: [45000, 2], transferencia: [60000, 1], mercadopago: [30000, 2] },
      difEfectivo: -1500, motivo: 'Vuelto mal dado', nota: 'Se dio vuelto de más en la venta de las 12:40.',
      fondoSiguiente: 30000,
    }),
    cierre({
      numero: 139, sesionNumero: 2, caja: mostrador, dias: 2,
      apertura: [9, 0], cierrePunto: [18, 21], abiertaPor: 'Ludmila', cerradoPor: 'Isaías',
      fondo: 50000,
      ventas: { efectivo: [154000, 8], debito: [88600, 3], credito: [130000, 2], transferencia: [95000, 2] },
      egresos: 8000, retiros: 60000,
      difEfectivo: 500, fondoSiguiente: 50000,
    }),
    cierre({
      numero: 138, sesionNumero: 1, caja: mostrador, dias: 3,
      apertura: [9, 6], cierrePunto: [18, 12], abiertaPor: 'Marcos', cerradoPor: 'Marcos',
      fondo: 50000,
      ventas: { efectivo: [201000, 11], debito: [64500, 3], transferencia: [180000, 2], mercadopago: [41200, 3] },
      retiros: 120000,
      difEfectivo: 0, fondoSiguiente: 50000,
    }),
  ]

  return {
    config,
    cajas: [mostrador, service],
    sesiones: [sesion],
    movimientos,
    cierres,
    proximoZ: 142,
    proximoTurno: 6,
  }

  // helpers de semilla --------------------------------------------------------

  function venta(fecha: string, medio: MedioPagoCaja, monto: number, motivo: string): MovimientoCaja {
    return { id: uid('mov'), cajaId: mostrador.id, sesionId: sesion.id, tipo: 'venta', medio, monto, motivo, usuario: 'Ludmila', fecha }
  }

  function mov(fecha: string, tipo: 'ingreso' | 'egreso' | 'retiro', monto: number, motivo: string, detalle?: string): MovimientoCaja {
    return { id: uid('mov'), cajaId: mostrador.id, sesionId: sesion.id, tipo, medio: 'efectivo', monto, motivo, detalle, usuario: 'Ludmila', fecha }
  }

  /** Arma un CierreCaja consistente a partir de pocos números. */
  function cierre(args: {
    numero: number
    sesionNumero: number
    caja: CajaRegistradora
    dias: number
    apertura: [number, number]
    cierrePunto: [number, number]
    abiertaPor: string
    cerradoPor: string
    fondo: number
    ventas: Partial<Record<MedioPagoCaja, [number, number]>> // medio -> [monto, operaciones]
    ingresos?: number
    egresos?: number
    retiros?: number
    difEfectivo?: number
    motivo?: string
    nota?: string
    fondoSiguiente: number
    conteo?: ConteoBilletes
  }): CierreCaja {
    const ventasPorMedio = mediosEnCero()
    const operacionesPorMedio = mediosEnCero()
    for (const [medio, [monto, ops]] of Object.entries(args.ventas) as [MedioPagoCaja, [number, number]][]) {
      ventasPorMedio[medio] = monto
      operacionesPorMedio[medio] = ops
    }
    const ingresos = args.ingresos ?? 0
    const egresos = args.egresos ?? 0
    const retiros = args.retiros ?? 0
    const dif = args.difEfectivo ?? 0

    const esperadoPorMedio = { ...ventasPorMedio }
    esperadoPorMedio.efectivo = args.fondo + ventasPorMedio.efectivo + ingresos - egresos - retiros
    const contadoPorMedio = { ...esperadoPorMedio }
    contadoPorMedio.efectivo += dif
    const diferenciaPorMedio = mediosEnCero()
    diferenciaPorMedio.efectivo = dif

    return {
      id: uid('cie'),
      numero: args.numero,
      cajaId: args.caja.id,
      cajaNombre: args.caja.nombre,
      sesionId: uid('ses'),
      sesionNumero: args.sesionNumero,
      abiertaEn: diaA(args.dias, args.apertura[0], args.apertura[1]),
      cerradaEn: diaA(args.dias, args.cierrePunto[0], args.cierrePunto[1]),
      abiertaPor: args.abiertaPor,
      cerradoPor: args.cerradoPor,
      fondoInicial: args.fondo,
      ventasPorMedio,
      operacionesPorMedio,
      ingresos,
      egresos,
      retiros,
      esperadoPorMedio,
      contadoPorMedio,
      conteoCierre: args.conteo,
      diferenciaPorMedio,
      diferenciaTotal: dif,
      motivoDiferencia: args.motivo,
      notaDiferencia: args.nota,
      cierreCiego: true,
      fondoSiguiente: args.fondoSiguiente,
      retiroFinal: Math.max(0, contadoPorMedio.efectivo - args.fondoSiguiente),
      movimientos: [],
    }
  }
}

// --- Acceso ------------------------------------------------------------------

let _db: CajaDB | null = null

function read(): CajaDB {
  if (typeof window === 'undefined') return seed()
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as CajaDB
  } catch {
    /* localStorage corrupto o no disponible: re-sembramos */
  }
  const s = seed()
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* ignorar */
  }
  return s
}

/** Devuelve la instancia hidratada (singleton en memoria). */
export function getCajaDB(): CajaDB {
  if (!_db) _db = read()
  return _db
}

/** Persiste el estado actual en localStorage. */
export function persistCaja(): void {
  if (typeof window === 'undefined' || !_db) return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(_db))
  } catch {
    /* ignorar */
  }
}

/** Restaura los datos de demostración del módulo Caja. */
export function resetCajaDB(): void {
  _db = seed()
  persistCaja()
}
