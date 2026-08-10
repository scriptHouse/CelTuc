import type { FacturacionVenta, MedioPagoCaja, ProductoCatalogo } from '@/types'
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

// ===== Importar stock por sucursal =====

/**
 * Qué pasaría con una fila de la planilla si se aplicara la importación:
 * - `actualiza`: el producto está en el catálogo y la cantidad cambia.
 * - `igual`: ya tiene esa misma cantidad — no hay nada para hacer.
 * - `nueva`: no está en el catálogo (se puede dar de alta, solo admin).
 * - `revisar`: hay más de un producto con ese nombre; hay que elegir cuál.
 * - `sin_valor`: la planilla no informó cantidad — NO se toca el stock.
 * - `invalida`: la celda no tiene un conteo (un precio, un `#VALUE!`…).
 */
export type EstadoFilaImportacion =
  | 'actualiza'
  | 'igual'
  | 'nueva'
  | 'revisar'
  | 'sin_valor'
  | 'invalida'

/** Un candidato del catálogo para una fila que quedó en `revisar`. */
export interface CandidatoImportacion {
  id: number
  nombre: string
  detalle: string
  categoria: string
}

export interface FilaImportacion {
  /** Número de fila REAL en el Excel, para poder ir a buscarla. */
  fila: number
  seccion: string
  nombre_planilla: string
  estado: EstadoFilaImportacion
  /** Por qué quedó así (vacío cuando no hace falta explicar nada). */
  motivo: string
  /** Cómo se encontró el producto: exacta, aproximada (revisala) o ninguna. */
  confianza: 'exacta' | 'aproximada' | null
  producto: number | null
  producto_nombre: string
  producto_detalle: string
  categoria: string
  categoria_id: number | null
  /** Lo que hay hoy en la sucursal (null si el producto no está en el catálogo). */
  cantidad_actual: number | null
  /** Hoy figura como "(no informado)": el 0 no es un conteo. */
  sin_dato_actual: boolean
  /** Lo que dice la planilla (null si no informó nada). */
  cantidad_nueva: number | null
  minimo_actual: number | null
  minimo_nuevo: number | null
  lista_usd: string | null
  candidatos: CandidatoImportacion[]
  /**
   * Otras filas de la planilla que caen en el MISMO producto del catálogo (la
   * planilla puede ser más fina: "8" y "8+" son un solo producto "8 / 8+").
   * Solo se puede aplicar una: si no, una pisaría a la otra sin que se vea.
   */
  duplicada_con: number[]
  /** Viene marcada por defecto (solo lo que cambia algo y no necesita decisión). */
  sugerido: boolean
  /** Se puede dar de alta: es nueva y su sección tiene categoría. */
  puede_crear: boolean
}

export interface ResumenImportacion {
  filas: number
  actualiza: number
  sube: number
  baja: number
  /** Misma cantidad, pero deja de figurar "(no informado)". */
  confirma: number
  igual: number
  nueva: number
  revisar: number
  /** Filas que comparten producto con otra fila de la misma planilla. */
  duplicada: number
  sin_valor: number
  invalida: number
  unidades_antes: number
  unidades_despues: number
  /** Productos del catálogo que la planilla no menciona: quedan como están. */
  catalogo_sin_planilla: number
}

export interface AnalisisImportacion {
  sucursal: number
  sucursal_nombre: string
  archivo: string
  resumen: ResumenImportacion
  filas: FilaImportacion[]
}

export interface ItemImportacionInput {
  fila?: number
  /** Producto del catálogo al que se le fija la cantidad. */
  producto?: number
  /** O el alta de un producto que la planilla trae y no existe (solo admin). */
  crear?: { nombre: string; categoria: number; lista_usd?: string | null }
  cantidad: number
  /** null borra la alerta; omitido no la toca. */
  stock_minimo?: number | null
}

export interface ResultadoImportacion {
  sucursal: number
  /** Filas cuya cantidad cambió (las que dejaron movimiento en el kardex). */
  actualizados: number
  creados: number
  sin_cambio: number
  unidades_delta: number
  detalle: Array<{ producto: number; nombre: string; cantidad: number; delta: number }>
}

/**
 * Sube la planilla de una sucursal y devuelve el diff fila por fila. NO escribe
 * nada: es el paso de revisión previo a `aplicarImportacionStock`.
 */
export function analizarImportacionStock(input: {
  sucursal: number
  archivo: File
}): Promise<AnalisisImportacion> {
  const form = new FormData()
  form.append('sucursal', String(input.sucursal))
  form.append('archivo', input.archivo)
  return api.post<AnalisisImportacion>('/inventario/stock/importar/analizar/', form, token())
}

/** Aplica las filas confirmadas (todo o nada, con movimiento en el kardex). */
export function aplicarImportacionStock(input: {
  sucursal: number
  archivo?: string
  items: ItemImportacionInput[]
}): Promise<ResultadoImportacion> {
  return api.post<ResultadoImportacion>('/inventario/stock/importar/aplicar/', input, token())
}

/** El equipo usado de un contrato de compraventa, para darlo de alta. */
export interface IngresoCompraventaInput {
  marca?: string
  modelo?: string
  color?: string
  imei1?: string
  imei2?: string
  cupon?: string
  /** 0–100; null u omitido = sin dato. */
  bateria?: number | null
  sucursal: number
}

export interface IngresoCompraventaResultado {
  producto: ProductoCatalogo
  stock: StockRow
  movimiento: MovimientoStock | null
  /** El IMEI ya estaba en el catálogo: se sumó al producto existente. */
  reutilizado: boolean
}

/**
 * Alta de mostrador del equipo de un contrato de compraventa: crea el producto
 * (categoría "Equipos usados") y suma 1 unidad. Solo pide `ver_inventario`
 * (no admin); queda auditado en el backend (ModeloBase + app auditoría).
 */
export function ingresarCompraventa(
  input: IngresoCompraventaInput,
): Promise<IngresoCompraventaResultado> {
  return api.post('/inventario/compraventa/ingresar/', input, token())
}

/**
 * Con qué se cobró la venta. Es el MISMO juego de valores que los medios de la
 * caja (`MedioPagoCaja`): la venta de mostrador y el arqueo tienen que hablar
 * el mismo idioma, así que se reexporta en vez de repetir la lista.
 */
export type FormaPago = MedioPagoCaja

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
  /**
   * Cuenta (emisor) que emite esta parte. Cada parte facturada es una factura
   * aparte: dos partes pueden ir a nombre de dos cuentas distintas.
   */
  emisor?: number | null
  emisor_nombre?: string | null
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
