import type { Cuenta, Factura } from '@/types'
import { getDB, wait } from '@/lib/db'
import { estadoEfectivo } from '@/lib/afip'
import { listarEmpleados } from '@/services/empleados'
import { listarComprobantes } from '@/services/facturacion'
import { listarProductos as listarCatalogo } from '@/services/productos'
import { listarStock, listarSucursales, listarVentas } from '@/services/inventario'

export interface FacturaConCuenta extends Factura {
  cuenta?: Cuenta
}

/** Fila de "Reposición" del Panel: producto bajo mínimo en una sucursal. */
export interface ReposicionItem {
  id: number
  nombre: string
  /** Se muestra como subtítulo: acá va la sucursal. */
  categoria: string
  stock: number
  stockMinimo: number
}

export interface ResumenDashboard {
  inventario: {
    totalProductos: number
    unidades: number
    valorVenta: number
    valorCosto: number
    bajoStock: ReposicionItem[]
  }
  facturacion: {
    facturadoMes: number
    cobradoMes: number
    pendienteTotal: number
    vencidasCount: number
    cantidadMes: number
    ultimas: FacturaConCuenta[]
    porCuenta: Array<{ cuenta: Cuenta; total: number; count: number }>
    serie: Array<{ label: string; valor: number }>
  }
  empleados: {
    total: number
    conAcceso: number
  }
  /** Facturación REAL (ARCA) del mes en curso, separada por condición fiscal
   * del emisor: A/B las emite un Responsable Inscripto y C un Monotributista. */
  facturacionReal: {
    riMes: number
    riCount: number
    monoMes: number
    monoCount: number
  }
  /** Ventas de mostrador del mes cobradas por transferencia. */
  transferencias: {
    totalMes: number
    operacionesMes: number
  }
}

function mismoMes(iso: string, ref: Date): boolean {
  const d = new Date(iso)
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth()
}

export async function obtenerResumen(): Promise<ResumenDashboard> {
  await wait(220)
  const db = getDB()
  const hoy = new Date()

  // --- Inventario (REAL: backend por sucursal) ---
  // Sin permiso de inventario/productos o sin conexión, el panel no se rompe:
  // los contadores quedan en 0 y la lista de reposición vacía.
  let inventario = {
    totalProductos: 0,
    unidades: 0,
    valorVenta: 0,
    valorCosto: 0,
    bajoStock: [] as ReposicionItem[],
  }
  try {
    const [catalogo, stock, sucursales] = await Promise.all([
      listarCatalogo(),
      listarStock(),
      listarSucursales(),
    ])
    const productoPorId = new Map(catalogo.map((p) => [p.id, p]))
    const sucursalPorId = new Map(sucursales.map((s) => [s.id, s.nombre]))
    let unidades = 0
    let valorVenta = 0
    let valorCosto = 0
    const bajoStock: ReposicionItem[] = []
    for (const fila of stock) {
      const producto = productoPorId.get(fila.producto)
      unidades += fila.cantidad
      if (producto?.efectivo?.lista_ars != null) {
        valorVenta += fila.cantidad * Number(producto.efectivo.lista_ars)
      }
      if (producto?.costo_usd != null) {
        valorCosto += fila.cantidad * Number(producto.costo_usd)
      }
      if (producto && fila.stock_minimo !== null && fila.cantidad <= fila.stock_minimo) {
        bajoStock.push({
          id: fila.id,
          nombre: producto.nombre,
          categoria: sucursalPorId.get(fila.sucursal) ?? '',
          stock: fila.cantidad,
          stockMinimo: fila.stock_minimo,
        })
      }
    }
    bajoStock.sort((a, b) => a.stock - b.stock)
    inventario = {
      totalProductos: catalogo.filter((p) => p.activo).length,
      unidades,
      valorVenta,
      valorCosto, // en USD (costos del catálogo); hoy casi sin cargar
      bajoStock,
    }
  } catch {
    /* sin permiso o sin conexión: contadores en 0 */
  }

  // --- Facturación ---
  const facturadoMes = db.facturas
    .filter((f) => mismoMes(f.fecha, hoy))
    .reduce((acc, f) => acc + f.total, 0)
  const cobradoMes = db.facturas
    .filter((f) => mismoMes(f.fecha, hoy) && f.estado === 'pagada')
    .reduce((acc, f) => acc + f.total, 0)
  const pendienteTotal = db.facturas
    .filter((f) => estadoEfectivo(f) !== 'pagada')
    .reduce((acc, f) => acc + f.total, 0)
  const vencidasCount = db.facturas.filter((f) => estadoEfectivo(f) === 'vencida').length
  const cantidadMes = db.facturas.filter((f) => mismoMes(f.fecha, hoy)).length

  const cuentaDe = (id: string) => db.cuentas.find((c) => c.id === id)

  const ultimas: FacturaConCuenta[] = [...db.facturas]
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
    .slice(0, 6)
    .map((f) => ({ ...f, cuenta: cuentaDe(f.cuentaId) }))

  const porCuenta = db.cuentas
    .map((cuenta) => {
      const propias = db.facturas.filter((f) => f.cuentaId === cuenta.id)
      return {
        cuenta,
        total: propias.reduce((acc, f) => acc + f.total, 0),
        count: propias.length,
      }
    })
    .sort((a, b) => b.total - a.total)

  // Serie de los últimos 6 meses (facturado por mes).
  const serie: Array<{ label: string; valor: number }> = []
  for (let i = 5; i >= 0; i--) {
    const ref = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
    const valor = db.facturas
      .filter((f) => mismoMes(f.fecha, ref))
      .reduce((acc, f) => acc + f.total, 0)
    serie.push({ label: ref.toLocaleDateString('es-AR', { month: 'short' }), valor })
  }

  // --- Empleados (del backend) ---
  // Si la API no responde, no rompemos el panel: mostramos 0.
  let empleados = { total: 0, conAcceso: 0 }
  try {
    const lista = await listarEmpleados()
    empleados = { total: lista.length, conAcceso: lista.filter((e) => e.puede_loguear).length }
  } catch {
    /* sin conexión / sin sesión: dejamos los contadores en 0 */
  }

  // --- Facturación REAL (ARCA) del mes, por condición del emisor ---
  // El tipo de comprobante delata quién lo emite: A/B = Responsable Inscripto,
  // C = Monotributista. La fecha es 'yyyy-mm-dd', se compara por prefijo para
  // no correrse un día por zona horaria. Sin permiso de facturación queda en 0.
  const prefijoMes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
  const facturacionReal = { riMes: 0, riCount: 0, monoMes: 0, monoCount: 0 }
  try {
    const comprobantes = await listarComprobantes()
    for (const c of comprobantes) {
      if (!c.fecha.startsWith(prefijoMes)) continue
      if (c.tipo === 'C') {
        facturacionReal.monoMes += Number(c.total)
        facturacionReal.monoCount += 1
      } else {
        facturacionReal.riMes += Number(c.total)
        facturacionReal.riCount += 1
      }
    }
  } catch {
    /* sin permiso o sin conexión: contadores en 0 */
  }

  // --- Ventas de mostrador cobradas por transferencia (mes en curso) ---
  const transferencias = { totalMes: 0, operacionesMes: 0 }
  try {
    const ventas = await listarVentas({ limite: 500 })
    for (const v of ventas) {
      if (v.forma_pago !== 'transferencia' || !mismoMes(v.creado, hoy)) continue
      transferencias.totalMes += Number(v.total)
      transferencias.operacionesMes += 1
    }
  } catch {
    /* sin permiso o sin conexión: contadores en 0 */
  }

  return {
    inventario,
    facturacion: {
      facturadoMes,
      cobradoMes,
      pendienteTotal,
      vencidasCount,
      cantidadMes,
      ultimas,
      porCuenta,
      serie,
    },
    empleados,
    facturacionReal,
    transferencias,
  }
}
