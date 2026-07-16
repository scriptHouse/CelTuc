import { api } from '@/lib/api'
import { useAuth } from '@/store/auth'

/**
 * Inventario REAL (backend): stock por sucursal sobre el catálogo central de
 * productos. No hay catálogo propio — cada fila referencia un `ProductoCatalogo`
 * por id y el front los cruza. Leer y AJUSTAR stock requiere `ver_inventario`
 * (los ajustes son trabajo de mostrador, no hace falta ser admin); crear o
 * editar sucursales sí es solo-admin.
 */

const token = () => useAuth.getState().access

export interface Sucursal {
  id: number
  nombre: string
  orden: number
  activa: boolean
}

export interface StockRow {
  id: number
  producto: number
  sucursal: number
  cantidad: number
  /** null = sin alerta configurada. */
  stock_minimo: number | null
  /** La planilla de origen no informaba cantidad: el 0 no es un conteo.
   *  Se muestra como "(no informado)" y se limpia al cargar una cantidad real. */
  sin_dato: boolean
  actualizado: string // ISO
}

export type TipoMovimiento = 'ingreso' | 'egreso' | 'ajuste' | 'transferencia' | 'venta'

export interface MovimientoStock {
  id: number
  producto: number
  sucursal: number
  tipo: TipoMovimiento
  /** Firmado: positivo entra, negativo sale. */
  delta: number
  resultante: number
  nota: string
  usuario: string | null
  creado: string // ISO
}

export interface AjusteInput {
  producto: number
  sucursal: number
  /** Suma/resta unidades (excluyente con `cantidad`). */
  delta?: number
  /** Fija la cantidad final (excluyente con `delta`). */
  cantidad?: number
  tipo?: Exclude<TipoMovimiento, 'transferencia'>
  /** null borra la alerta. Si no viene, no se toca. */
  stock_minimo?: number | null
  nota?: string
}

export interface TransferenciaInput {
  producto: number
  origen: number
  destino: number
  cantidad: number
  nota?: string
}

export function listarSucursales(): Promise<Sucursal[]> {
  return api.get<Sucursal[]>('/inventario/sucursales/', token())
}

export function crearSucursal(input: { nombre: string; orden?: number }): Promise<Sucursal> {
  return api.post<Sucursal>('/inventario/sucursales/', input, token())
}

export function actualizarSucursal(
  id: number,
  input: Partial<{ nombre: string; orden: number; activa: boolean }>,
): Promise<Sucursal> {
  return api.patch<Sucursal>(`/inventario/sucursales/${id}/`, input, token())
}

export function eliminarSucursal(id: number): Promise<void> {
  return api.del<void>(`/inventario/sucursales/${id}/`, token())
}

export function listarStock(): Promise<StockRow[]> {
  return api.get<StockRow[]>('/inventario/stock/', token())
}

export function ajustarStock(
  input: AjusteInput,
): Promise<{ stock: StockRow; movimiento: MovimientoStock | null }> {
  return api.post('/inventario/stock/ajustar/', input, token())
}

export function transferirStock(
  input: TransferenciaInput,
): Promise<{ origen: StockRow; destino: StockRow }> {
  return api.post('/inventario/stock/transferir/', input, token())
}

export type FormaPago = 'efectivo' | 'transferencia' | 'tarjeta' | 'otro'

export interface ItemVenta {
  producto: number
  nombre: string
  cantidad: number
  precio_unitario: number
  subtotal: number
}

/** Venta de mostrador: registrarla descuenta el stock (backend REAL). */
export interface Venta {
  id: number
  sucursal: number
  sucursal_nombre: string
  forma_pago: FormaPago
  nota: string
  total: number
  usuario: string | null
  items: ItemVenta[]
  creado: string // ISO
  /** Id del movimiento de caja generado (null si no había turno abierto). */
  movimiento_caja?: number | null
  /** Aviso del backend cuando la venta no entró en ningún arqueo. */
  aviso_caja?: string | null
}

export interface VentaInput {
  sucursal: number
  forma_pago: FormaPago
  nota?: string
  items: Array<{ producto: number; cantidad: number; precio_unitario: number }>
  /** Caja donde anotar la venta en el arqueo (opcional). */
  caja?: number
}

export function registrarVenta(input: VentaInput): Promise<Venta> {
  return api.post<Venta>('/inventario/ventas/', input, token())
}

export function listarVentas(params: { sucursal?: number; limite?: number } = {}): Promise<Venta[]> {
  const query = new URLSearchParams()
  if (params.sucursal) query.set('sucursal', String(params.sucursal))
  if (params.limite) query.set('limite', String(params.limite))
  const sufijo = query.toString() ? `?${query.toString()}` : ''
  return api.get<Venta[]>(`/inventario/ventas/${sufijo}`, token())
}

export function listarMovimientos(params: {
  producto?: number
  sucursal?: number
  limite?: number
}): Promise<MovimientoStock[]> {
  const query = new URLSearchParams()
  if (params.producto) query.set('producto', String(params.producto))
  if (params.sucursal) query.set('sucursal', String(params.sucursal))
  if (params.limite) query.set('limite', String(params.limite))
  const sufijo = query.toString() ? `?${query.toString()}` : ''
  return api.get<MovimientoStock[]>(`/inventario/movimientos/${sufijo}`, token())
}
