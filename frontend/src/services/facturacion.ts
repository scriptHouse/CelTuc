import type {
  ClienteFactura,
  Cuenta,
  CondicionEmisor,
  EstadoFactura,
  Factura,
  ItemFactura,
} from '@/types'
import { getDB, persist, uid, wait } from '@/lib/db'
import { calcularTotales, tipoComprobante } from '@/lib/afip'

// ===== Cuentas =====

export async function listarCuentas(): Promise<Cuenta[]> {
  await wait()
  return getDB().cuentas.map((c) => ({ ...c }))
}

export interface CuentaInput {
  nombre: string
  condicion: CondicionEmisor
  cuit: string
  puntoVenta: number
}

export async function crearCuenta(input: CuentaInput): Promise<Cuenta> {
  await wait()
  const db = getDB()
  const cuenta: Cuenta = { ...input, id: uid('cta'), creadoEn: new Date().toISOString() }
  db.cuentas.push(cuenta)
  persist()
  return { ...cuenta }
}

// ===== Facturas =====

export async function listarFacturas(cuentaId?: string): Promise<Factura[]> {
  await wait()
  const facturas = getDB().facturas
  const filtradas = cuentaId ? facturas.filter((f) => f.cuentaId === cuentaId) : facturas
  // Orden: más recientes primero.
  return filtradas
    .map((f) => ({ ...f }))
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
}

export interface NuevaFactura {
  cuentaId: string
  fecha: string
  vencimiento: string
  cliente: ClienteFactura
  items: Array<Omit<ItemFactura, 'id'>>
  estado?: EstadoFactura
  observaciones?: string
}

export async function crearFactura(input: NuevaFactura): Promise<Factura> {
  await wait(220)
  const db = getDB()
  const cuenta = db.cuentas.find((c) => c.id === input.cuentaId)
  if (!cuenta) throw new Error('Cuenta no encontrada')

  const tipo = tipoComprobante(cuenta.condicion, input.cliente.condicion)
  // Correlativo por cuenta + tipo de comprobante.
  const numero =
    db.facturas
      .filter((f) => f.cuentaId === cuenta.id && f.tipo === tipo)
      .reduce((max, f) => Math.max(max, f.numero), 0) + 1

  const items: ItemFactura[] = input.items.map((i) => ({ ...i, id: uid('it') }))
  const { neto, iva, total } = calcularTotales(items, tipo)

  const factura: Factura = {
    id: uid('fac'),
    cuentaId: cuenta.id,
    tipo,
    numero,
    fecha: input.fecha,
    vencimiento: input.vencimiento,
    cliente: input.cliente,
    items,
    estado: input.estado ?? 'pendiente',
    observaciones: input.observaciones,
    neto,
    iva,
    total,
  }
  db.facturas.unshift(factura)
  persist()
  return { ...factura }
}

export async function cambiarEstadoFactura(id: string, estado: EstadoFactura): Promise<Factura> {
  await wait(90)
  const db = getDB()
  const factura = db.facturas.find((f) => f.id === id)
  if (!factura) throw new Error('Factura no encontrada')
  factura.estado = estado
  persist()
  return { ...factura }
}

export async function eliminarFactura(id: string): Promise<void> {
  await wait()
  const db = getDB()
  db.facturas = db.facturas.filter((f) => f.id !== id)
  persist()
}
