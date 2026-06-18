import type {
  Cuenta,
  Empleado,
  Factura,
  ItemFactura,
  Pago,
  Producto,
  TipoComprobante,
} from '@/types'
import { calcularTotales } from '@/lib/afip'

/**
 * "Base de datos" local (localStorage). Es la única fuente de verdad mientras
 * no haya backend. Los `services/*` leen y escriben acá y devuelven promesas,
 * tal como lo haría axios contra una API real.
 */

const KEY = 'celtuc-db-v1'

export interface CelTucDB {
  productos: Producto[]
  cuentas: Cuenta[]
  facturas: Factura[]
  empleados: Empleado[]
  pagos: Pago[]
}

/** Pequeña latencia simulada para que los estados de carga se sientan reales. */
export const wait = (ms = 160) => new Promise<void>((r) => setTimeout(r, ms))

/** Identificador único (con prefijo legible). */
export function uid(prefix = 'id'): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 10)
  return `${prefix}-${rand}`
}

const iso = (d: Date) => d.toISOString()
function daysAgo(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}
function daysFromNow(n: number): Date {
  return daysAgo(-n)
}

// --- Semilla ---------------------------------------------------------------

function seed(): CelTucDB {
  const now = iso(new Date())

  const productos: Producto[] = [
    p('CEL-IP15-128', 'iPhone 15 128GB', 'Celulares', 'Apple', 1150000, 1350000, 2, 3),
    p('CEL-SGA55', 'Samsung Galaxy A55', 'Celulares', 'Samsung', 600000, 720000, 7, 4),
    p('CEL-RN13', 'Xiaomi Redmi Note 13', 'Celulares', 'Xiaomi', 330000, 410000, 11, 5),
    p('CEL-MG84', 'Motorola Moto G84', 'Celulares', 'Motorola', 390000, 480000, 5, 4),
    p('ACC-FUN-IP', 'Funda silicona iPhone', 'Accesorios', 'Genérico', 9000, 18000, 24, 12),
    p('ACC-VID-UNI', 'Vidrio templado universal', 'Accesorios', 'Genérico', 5000, 12000, 4, 10),
    p('ACC-CAR-25W', 'Cargador 25W USB-C', 'Accesorios', 'Samsung', 16000, 28000, 16, 8),
    p('ACC-CAB-USBC', 'Cable USB-C 1m', 'Accesorios', 'Genérico', 4000, 9500, 40, 15),
    p('AUD-JBL-TUNE', 'Auriculares JBL Tune 520', 'Audio', 'JBL', 70000, 95000, 9, 4),
    p('AUD-TWS-PRO', 'Auriculares TWS Pro', 'Audio', 'Genérico', 28000, 45000, 3, 6),
    p('ACC-PWB-10K', 'Power bank 10.000mAh', 'Accesorios', 'Xiaomi', 35000, 55000, 12, 6),
    p('REP-PAN-IP11', 'Pantalla repuesto iPhone 11', 'Repuestos', 'Apple', 160000, 220000, 6, 3),
    p('REP-BAT-SAM', 'Batería repuesto Samsung', 'Repuestos', 'Samsung', 38000, 60000, 2, 4),
    p('COM-NB-IDEA', 'Notebook Lenovo IdeaPad 3', 'Computación', 'Lenovo', 1300000, 1500000, 3, 2),
  ]

  const cuentaRI: Cuenta = {
    id: 'cta-ri',
    nombre: 'CelTuc S.R.L.',
    condicion: 'responsable_inscripto',
    cuit: '30-71456789-3',
    puntoVenta: 1,
    creadoEn: now,
  }
  const cuentaMono: Cuenta = {
    id: 'cta-mono',
    nombre: 'Cel Tuc Express',
    condicion: 'monotributista',
    cuit: '20-38912345-7',
    puntoVenta: 2,
    creadoEn: now,
  }
  const cuentas: Cuenta[] = [cuentaRI, cuentaMono]

  let nRiA = 0
  let nRiB = 0
  let nMonoC = 0

  const facturas: Factura[] = [
    // --- CelTuc S.R.L. (Responsable Inscripto) ---
    f('cta-ri', 'A', ++nRiA, daysAgo(26), daysAgo(11), 'pagada', {
      nombre: 'Distribuidora del Norte S.A.', docTipo: 'CUIT', docNumero: '30-70112233-9', condicion: 'responsable_inscripto',
    }, [
      it('iPhone 15 128GB', 1, 1350000, 'CEL-IP15-128'),
      it('Cargador 25W USB-C', 2, 28000, 'ACC-CAR-25W'),
    ]),
    f('cta-ri', 'B', ++nRiB, daysAgo(18), daysFromNow(12), 'pendiente', {
      nombre: 'Carla Medina', docTipo: 'DNI', docNumero: '35.812.004', condicion: 'consumidor_final',
    }, [
      it('Samsung Galaxy A55', 1, 720000, 'CEL-SGA55'),
      it('Vidrio templado universal', 1, 12000, 'ACC-VID-UNI'),
    ]),
    f('cta-ri', 'A', ++nRiA, daysAgo(40), daysAgo(10), 'pendiente', {
      nombre: 'Kiosco Digital S.R.L.', docTipo: 'CUIT', docNumero: '30-71998877-1', condicion: 'responsable_inscripto',
    }, [
      it('Power bank 10.000mAh', 6, 55000, 'ACC-PWB-10K'),
      it('Cable USB-C 1m', 10, 9500, 'ACC-CAB-USBC'),
    ]),
    f('cta-ri', 'B', ++nRiB, daysAgo(6), daysFromNow(24), 'pendiente', {
      nombre: 'Mauro Sosa', docTipo: 'DNI', docNumero: '40.221.765', condicion: 'consumidor_final',
    }, [it('Notebook Lenovo IdeaPad 3', 1, 1500000, 'COM-NB-IDEA')]),
    f('cta-ri', 'A', ++nRiA, daysAgo(3), daysFromNow(27), 'pagada', {
      nombre: 'TecnoSur S.A.', docTipo: 'CUIT', docNumero: '30-69887766-5', condicion: 'responsable_inscripto',
    }, [
      it('Pantalla repuesto iPhone 11', 3, 220000, 'REP-PAN-IP11'),
      it('Batería repuesto Samsung', 4, 60000, 'REP-BAT-SAM'),
    ]),

    // --- Cel Tuc Express (Monotributista) -> siempre Factura C ---
    f('cta-mono', 'C', ++nMonoC, daysAgo(15), daysFromNow(15), 'pagada', {
      nombre: 'Consumidor Final', docTipo: 'DNI', docNumero: '0', condicion: 'consumidor_final',
    }, [
      it('Funda silicona iPhone', 2, 18000, 'ACC-FUN-IP'),
      it('Vidrio templado universal', 2, 12000, 'ACC-VID-UNI'),
    ]),
    f('cta-mono', 'C', ++nMonoC, daysAgo(9), daysFromNow(21), 'pendiente', {
      nombre: 'Julián Vera', docTipo: 'DNI', docNumero: '38.554.190', condicion: 'consumidor_final',
    }, [
      it('Auriculares JBL Tune 520', 1, 95000, 'AUD-JBL-TUNE'),
      it('Cable USB-C 1m', 1, 9500, 'ACC-CAB-USBC'),
    ]),
    f('cta-mono', 'C', ++nMonoC, daysAgo(2), daysFromNow(28), 'pendiente', {
      nombre: 'Romina Páez', docTipo: 'DNI', docNumero: '41.009.332', condicion: 'consumidor_final',
    }, [it('Xiaomi Redmi Note 13', 1, 410000, 'CEL-RN13')]),
  ]

  const empleados: Empleado[] = [
    e('Lucas', 'Gómez', 'Vendedor', 'lucas@celtuc.com', '381 5 123-456', 'mensual', 850000, true, daysAgo(540)),
    e('Martina', 'Ríos', 'Técnica de reparaciones', 'martina@celtuc.com', '381 5 234-567', 'mensual', 920000, true, daysAgo(410)),
    e('Diego', 'Pérez', 'Vendedor', 'diego@celtuc.com', '381 5 345-678', 'comision', 8, true, daysAgo(180)),
    e('Sofía', 'Luna', 'Community Manager', 'sofia@celtuc.com', '381 5 456-789', 'por_hora', 4500, true, daysAgo(95)),
    e('Tomás', 'Díaz', 'Cadete', 'tomas@celtuc.com', '381 5 567-890', 'mensual', 600000, false, daysAgo(300)),
  ]

  const pagos: Pago[] = [
    pago(empleados[0].id, 850000, daysAgo(35), 'Sueldo'),
    pago(empleados[1].id, 920000, daysAgo(34), 'Sueldo'),
    pago(empleados[3].id, 720000, daysAgo(33), 'Horas mayo'),
  ]

  return { productos, cuentas, facturas, empleados, pagos }

  // helpers de semilla -------------------------------------------------------

  function p(
    sku: string,
    nombre: string,
    categoria: Producto['categoria'],
    marca: string,
    costo: number,
    precio: number,
    stock: number,
    stockMinimo: number,
  ): Producto {
    return {
      id: uid('prod'),
      sku,
      nombre,
      categoria,
      marca,
      costo,
      precio,
      stock,
      stockMinimo,
      creadoEn: now,
      actualizadoEn: now,
    }
  }

  function it(descripcion: string, cantidad: number, precioUnitario: number, _sku?: string): ItemFactura {
    return { id: uid('it'), descripcion, cantidad, precioUnitario }
  }

  function f(
    cuentaId: string,
    tipo: TipoComprobante,
    numero: number,
    fecha: Date,
    vencimiento: Date,
    estado: Factura['estado'],
    cliente: Factura['cliente'],
    items: ItemFactura[],
    observaciones?: string,
  ): Factura {
    const { neto, iva, total } = calcularTotales(items, tipo)
    return {
      id: uid('fac'),
      cuentaId,
      tipo,
      numero,
      fecha: iso(fecha),
      vencimiento: iso(vencimiento),
      cliente,
      items,
      estado,
      observaciones,
      neto,
      iva,
      total,
    }
  }

  function e(
    nombre: string,
    apellido: string,
    puesto: string,
    email: string,
    telefono: string,
    modalidad: Empleado['modalidad'],
    honorario: number,
    activo: boolean,
    ingreso: Date,
  ): Empleado {
    return { id: uid('emp'), nombre, apellido, puesto, email, telefono, modalidad, honorario, activo, ingreso: iso(ingreso) }
  }

  function pago(empleadoId: string, monto: number, fecha: Date, nota: string): Pago {
    const d = fecha
    return {
      id: uid('pago'),
      empleadoId,
      monto,
      fecha: iso(d),
      periodo: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      nota,
    }
  }
}

// --- Acceso ----------------------------------------------------------------

let _db: CelTucDB | null = null

function read(): CelTucDB {
  if (typeof window === 'undefined') return seed()
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as CelTucDB
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
export function getDB(): CelTucDB {
  if (!_db) _db = read()
  return _db
}

/** Persiste el estado actual en localStorage. */
export function persist(): void {
  if (typeof window === 'undefined' || !_db) return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(_db))
  } catch {
    /* ignorar */
  }
}

/** Restaura los datos de demostración. */
export function resetDB(): void {
  _db = seed()
  persist()
}
