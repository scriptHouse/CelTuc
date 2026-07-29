import type { FacturacionVenta } from '@/types'
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
  /** CP del local; la misma tabla la usan Empleados y los documentos. */
  codigo_postal?: string
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

/**
 * Cómo se factura la venta: separa la plata por caja (lo del RI a su caja;
 * monotributo y sin factura a la general). Definido en `@/types` y
 * re-exportado acá junto al resto del contrato de ventas.
 */
export type { FacturacionVenta } from '@/types'

/**
 * Qué se cobra en un renglón de la venta:
 * - `producto`: mercadería del catálogo. Es la ÚNICA que descuenta stock.
 * - `service`: un trabajo del taller (puede venir de la lista de precios).
 * - `otro`: texto libre (mano de obra, un accesorio suelto, un ajuste).
 */
export type TipoItemVenta = 'producto' | 'service' | 'otro'

export interface ItemVenta {
  tipo: TipoItemVenta
  /** Solo en los renglones de producto. */
  producto: number | null
  /** Fila de la lista de precios del taller, si el service salió de ahí. */
  item_service?: number | null
  /** Lo vendido, en texto (foto al momento de la venta). */
  nombre: string
  descripcion?: string
  cantidad: number
  precio_unitario: number
  subtotal: number
}

/**
 * Una parte del cobro: medio + monto. Una venta puede cobrarse con varios
 * medios a la vez (parte efectivo, parte transferencia); con un solo medio hay
 * una sola parte. La suma de las partes es siempre el total de la venta.
 */
export interface PagoVenta {
  medio: FormaPago
  /**
   * Cómo se factura ESTA parte: decide a qué caja entra. Permite facturar una
   * parte de la venta y cobrar el resto sin factura.
   */
  facturacion: FacturacionVenta
  monto: number
}

/** Venta de mostrador: registrarla descuenta el stock (backend REAL). */
export interface Venta {
  id: number
  sucursal: number
  sucursal_nombre: string
  /** Medio PRINCIPAL (el de mayor monto). El detalle completo va en `pagos`. */
  forma_pago: FormaPago
  /** Cómo se cobró, parte por parte. */
  pagos: PagoVenta[]
  facturacion: FacturacionVenta
  nota: string
  total: number
  usuario: string | null
  items: ItemVenta[]
  creado: string // ISO
  /** Cliente al que se le vendió (opcional: el mostrador puede no saber quién es). */
  cliente?: number | null
  cliente_nombre?: string | null
  /** Factura que después se emitió por esta venta (para no contarla dos veces). */
  comprobante?: number | null
  /** Id del primer movimiento de caja generado (null si no había turno abierto). */
  movimiento_caja?: number | null
  /** Todos los movimientos de arqueo creados: uno por medio cobrado. */
  movimientos_caja?: number[]
  /** Nombre de la caja donde quedó anotada (el canal fiscal decide cuál). */
  caja_arqueo?: string | null
  /** Aviso del backend cuando la venta no entró en ningún arqueo. */
  aviso_caja?: string | null
}

/** Datos de un cliente nuevo cargados en la venta (lo da de alta el backend). */
export interface ClienteVentaInput {
  nombre?: string
  telefono?: string
  email?: string
  doc_tipo?: string
  doc_numero?: string
  condicion?: string
}

export interface VentaInput {
  sucursal: number
  forma_pago: FormaPago
  /**
   * Cobro dividido en varios medios (opcional). Tiene que sumar EXACTO el total
   * de la venta; sin esto, la venta entera va en `forma_pago`, como siempre.
   */
  pagos?: PagoVenta[]
  /** Cómo se factura: decide a qué caja entra la plata (default: sin factura). */
  facturacion?: FacturacionVenta
  nota?: string
  /**
   * Renglones de la venta. Sin `tipo` y con `producto` se comporta como
   * siempre (mercadería que descuenta stock); los services e ítems libres
   * mandan `tipo` + `descripcion` y no tocan el inventario.
   */
  items: Array<{
    tipo?: TipoItemVenta
    producto?: number
    item_service?: number
    descripcion?: string
    cantidad: number
    precio_unitario: number
  }>
  /** Cliente ya guardado al que se le vende (opcional). */
  cliente?: number
  /**
   * Cliente nuevo: sus datos se dan de alta con la misma lógica que los de una
   * factura (se reconoce por documento, teléfono o email). Sin ninguno de esos
   * tres datos no se registra nada y la venta se guarda igual, sin cliente.
   */
  cliente_datos?: ClienteVentaInput
  /** Caja donde anotar la venta si no hay cajas con canal fiscal (opcional). */
  caja?: number
  /** True = el vendedor confirmó vender con faltante: el stock queda negativo. */
  permitir_faltante?: boolean
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
