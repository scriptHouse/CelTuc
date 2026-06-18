import type { Cuenta, Factura, Producto } from '@/types'
import { getDB, wait } from '@/lib/db'
import { estadoEfectivo } from '@/lib/afip'
import { costoMensualEstimado } from '@/services/empleados'

export interface FacturaConCuenta extends Factura {
  cuenta?: Cuenta
}

export interface ResumenDashboard {
  inventario: {
    totalProductos: number
    unidades: number
    valorVenta: number
    valorCosto: number
    bajoStock: Producto[]
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
    activos: number
    total: number
    masaMensual: number
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

  // --- Inventario ---
  const unidades = db.productos.reduce((acc, p) => acc + p.stock, 0)
  const valorVenta = db.productos.reduce((acc, p) => acc + p.stock * p.precio, 0)
  const valorCosto = db.productos.reduce((acc, p) => acc + p.stock * p.costo, 0)
  const bajoStock = db.productos
    .filter((p) => p.stock <= p.stockMinimo)
    .sort((a, b) => a.stock - b.stock)

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

  // --- Empleados ---
  const activos = db.empleados.filter((e) => e.activo)
  const masaMensual = activos.reduce((acc, e) => acc + costoMensualEstimado(e), 0)

  return {
    inventario: { totalProductos: db.productos.length, unidades, valorVenta, valorCosto, bajoStock },
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
    empleados: { activos: activos.length, total: db.empleados.length, masaMensual },
  }
}
