/**
 * Tipos del dominio de CelTuc.
 *
 * La app es solo frontend: estos tipos describen tanto los datos sembrados
 * (semilla en localStorage) como lo que devolverían los servicios cuando se
 * conecte un backend real, sin tocar los componentes.
 */

// ===== Sesión / Roles y permisos =====
/** Rol resumido tal como viaja dentro del usuario o de un empleado. */
export interface RolBreve {
  id: number
  nombre: string
  es_admin: boolean
}

/** Usuario autenticado, tal como lo devuelve el backend (`/api/auth/me`, login). */
export interface Usuario {
  id: number
  email: string
  username: string
  is_active?: boolean
  is_staff?: boolean
  is_superuser?: boolean
  date_joined?: string
  /** Acceso total (superusuario, staff o rol admin). Lo calcula el backend. */
  es_administrador?: boolean
  /** Códigos de los módulos que la cuenta puede ver (p. ej. `ver_inventario`). */
  permisos?: string[]
  /** Rol asignado a la cuenta, o null si no tiene. */
  rol?: RolBreve | null
  /** Sucursal del empleado vinculado (para preseleccionarla en documentos). */
  sucursal?: SucursalBreve | null
}

/** Permiso del catálogo (un módulo del panel). */
export interface Permiso {
  codigo: string
  nombre: string
  descripcion: string
  orden: number
}

/** Rol completo, tal como lo administra el panel de Empleados. */
export interface Rol {
  id: number
  nombre: string
  descripcion: string
  es_admin: boolean
  es_sistema: boolean
  /** Códigos de los permisos que concede el rol. */
  permisos: string[]
  cantidad_usuarios: number
  creado: string
}

// ===== Inventario =====
export type CategoriaProducto =
  | 'Celulares'
  | 'Accesorios'
  | 'Audio'
  | 'Repuestos'
  | 'Computación'
  | 'Otros'

export const CATEGORIAS: CategoriaProducto[] = [
  'Celulares',
  'Accesorios',
  'Audio',
  'Repuestos',
  'Computación',
  'Otros',
]

export interface Producto {
  id: string
  sku: string
  nombre: string
  categoria: CategoriaProducto
  marca: string
  costo: number // costo unitario (ARS)
  precio: number // precio de venta (ARS)
  stock: number // unidades disponibles
  stockMinimo: number // umbral de alerta de reposición
  creadoEn: string // ISO
  actualizadoEn: string // ISO
}

// ===== Facturación =====
export type CondicionFiscal =
  | 'responsable_inscripto'
  | 'monotributista'
  | 'consumidor_final'
  | 'exento'

/** Condición fiscal con la que una cuenta (emisor) puede facturar. */
export type CondicionEmisor = 'responsable_inscripto' | 'monotributista'

export interface Cuenta {
  id: string
  nombre: string // razón social / nombre de la cuenta
  condicion: CondicionEmisor
  cuit: string
  puntoVenta: number // 1..N (se muestra con 4 dígitos)
  creadoEn: string
}

export type TipoComprobante = 'A' | 'B' | 'C'

/** Estado persistido de la factura. "vencida" se deriva (ver estadoEfectivo). */
export type EstadoFactura = 'pendiente' | 'pagada'
export type EstadoEfectivo = 'pendiente' | 'pagada' | 'vencida'

export interface ItemFactura {
  id: string
  descripcion: string
  cantidad: number
  precioUnitario: number // precio NETO unitario (sin IVA)
  productoId?: string
}

export interface ClienteFactura {
  nombre: string
  docTipo: 'CUIT' | 'DNI'
  docNumero: string
  condicion: CondicionFiscal
}

export interface Factura {
  id: string
  cuentaId: string
  tipo: TipoComprobante
  numero: number // correlativo dentro de la cuenta + tipo
  fecha: string // ISO (emisión)
  vencimiento: string // ISO
  cliente: ClienteFactura
  items: ItemFactura[]
  estado: EstadoFactura
  observaciones?: string
  // Totales calculados y persistidos para listados rápidos.
  neto: number
  iva: number
  total: number
}

// ===== Facturación electrónica real (backend ARCA) =====
// Estos tipos reflejan la API real (snake_case, ids numéricos). Conviven con los
// tipos mock de arriba (Cuenta/Factura), que todavía alimentan el dashboard.

/** Una cuenta que factura ante ARCA, con su punto de venta y credenciales. */
export interface Emisor {
  id: number
  nombre: string
  condicion: CondicionEmisor
  cuit: string
  punto_venta: number
  produccion: boolean
  activo: boolean
  /** True si tiene certificado + clave cargados (puede autenticar). */
  tiene_credenciales: boolean
  creado: string
  actualizado: string
}

export type EstadoCobro = 'pendiente' | 'pagada'
export type DocTipo = 'CUIT' | 'CUIL' | 'DNI' | 'CF'

export interface ItemComprobante {
  id?: number
  descripcion: string
  cantidad: number
  precio_unitario: number // NETO (sin IVA)
  subtotal?: number
}

/** Un comprobante emitido (Factura A, B o C) con su CAE. */
export interface Comprobante {
  id: number
  emisor: number
  emisor_nombre?: string
  emisor_cuit?: string
  emisor_condicion?: CondicionEmisor
  /** Solo en la respuesta de emisión: qué stock NO se pudo descontar. */
  avisos_stock?: string[]
  tipo: TipoComprobante
  concepto?: number
  punto_venta: number
  numero: number
  numero_formateado: string
  cliente_nombre: string
  cliente_doc_tipo?: DocTipo
  cliente_doc_numero?: string
  cliente_condicion: CondicionFiscal
  /** Teléfono/celular del cliente (dato interno, no fiscal). */
  cliente_telefono?: string
  fecha: string
  vencimiento: string | null
  alicuota_iva?: number
  neto?: number
  iva?: number
  total: number
  /** Código de Autorización Electrónico que devuelve ARCA. */
  cae?: string
  cae_vencimiento?: string | null
  qr_url?: string
  /** Imagen del QR como data URI (solo en el detalle). */
  qr?: string | null
  estado_cobro: EstadoCobro
  observaciones?: string
  items?: ItemComprobante[]
  creado?: string
}

/** Cliente de la base (se arma solo con los datos cargados en las facturas). */
export interface Cliente {
  id: number
  nombre: string
  doc_tipo: DocTipo
  doc_numero: string
  condicion: CondicionFiscal
  telefono: string
  creado?: string // ISO
  actualizado?: string // ISO
}

// ===== Empleados (backend) =====
/** Sucursal completa (local del negocio): nombre, código postal y estado. */
export interface Sucursal {
  id: number
  nombre: string
  codigo_postal: string
  activa: boolean
  creado?: string // ISO
  actualizado?: string // ISO
}

/** Vista mínima de la sucursal, tal como viaja anidada en el empleado/usuario. */
export interface SucursalBreve {
  id: number
  nombre: string
  codigo_postal?: string
}

/** Cuenta de login vinculada a un empleado (subconjunto del Usuario). */
export interface UsuarioBreve {
  id: number
  username: string
  email: string
  is_active: boolean
  /** Rol con el que esta cuenta entra al sistema, o null. */
  rol?: RolBreve | null
  /** Auditoría de presencia. */
  last_login?: string | null
  ultima_actividad?: string | null
  en_linea?: boolean
}

export interface Empleado {
  id: number
  nombre: string
  apellido: string
  nombre_completo: string
  /** Cuenta con la que el empleado inicia sesión, o null si no tiene acceso. */
  usuario: UsuarioBreve | null
  /** Sucursal (local) a la que pertenece, o null si no se asignó. */
  sucursal: SucursalBreve | null
  puede_loguear: boolean
  creado: string // ISO
}

// ===== Usuarios (gestión, solo admin) =====
/** Empleado vinculado a una cuenta (subconjunto del Empleado). */
export interface EmpleadoBreve {
  id: number
  nombre: string
  apellido: string
  nombre_completo: string
}

/** Cuenta de login, tal como la ve el panel de administración del front. */
export interface UsuarioAdmin {
  id: number
  username: string
  email: string
  is_active: boolean
  is_staff: boolean
  is_superuser: boolean
  /** Acceso de administrador (superusuario, staff o rol admin). Lo calcula el backend. */
  es_administrador?: boolean
  /** Tope de la jerarquía (el dueño). Solo lo es el superusuario. */
  es_superadministrador?: boolean
  date_joined: string
  empleado: EmpleadoBreve | null
  /** Auditoría de presencia. */
  last_login: string | null
  ultima_actividad: string | null
  en_linea: boolean
}

// ===== Simulador de tarjetas =====
/** Categoría de producto: el recargo difiere entre accesorios y equipos. */
export type CategoriaTarjeta = 'accesorios' | 'equipos'

/** Catálogo de categorías para los selectores (orden y textos de la UI). */
export const CATEGORIAS_TARJETA: { value: CategoriaTarjeta; label: string; hint: string }[] = [
  { value: 'accesorios', label: 'Accesorios', hint: 'Accesorios y service técnico' },
  { value: 'equipos', label: 'Equipos', hint: 'iPhone, Samsung y productos Apple' },
]

/** Un plan de cuotas dentro de una tarjeta (cuántas cuotas y qué recargo). */
export interface PlanCuota {
  id: number
  etiqueta: string
  cuotas: number
  /** Porcentaje de recargo sobre el monto (35 = 35 %). */
  interes: number
  orden: number
  activo: boolean
}

/** Medio de pago configurable: agrupa una tabla de planes con sus recargos. */
export interface Tarjeta {
  id: number
  nombre: string
  categoria: CategoriaTarjeta
  descripcion: string
  orden: number
  activa: boolean
  planes: PlanCuota[]
  creado: string // ISO
  actualizado: string // ISO
}

// ===== Cotizaciones (toma de equipos usados y service) =====
/** Rango de toma (en USD) de un modelo para una capacidad de almacenamiento. */
export interface CotizacionCapacidad {
  id: number
  /** Capacidad en GB: 128, 256, 512, 1024 (= 1 TB)... */
  capacidad_gb: number
  /** Etiqueta lista para mostrar ("128 GB", "1 TB"); la arma el backend. */
  capacidad_label: string
  precio_min: number
  precio_max: number
}

/** Precio (USD) de un tipo de service para un modelo concreto. */
export interface PrecioServicioEquipo {
  id: number
  /** Id del TipoServicio. */
  tipo: number
  tipo_nombre: string
  precio: number
}

/** Un modelo cotizable con sus rangos de toma y precios de service. */
export interface ModeloEquipo {
  id: number
  marca: string
  nombre: string
  /** "iPhone 13 Pro" (marca + nombre); lo arma el backend. */
  nombre_completo: string
  /** Puente al catálogo único de equipos (DispositivoService), o null. */
  dispositivo: number | null
  orden: number
  activo: boolean
  cotizaciones: CotizacionCapacidad[]
  servicios: PrecioServicioEquipo[]
  creado: string // ISO
  actualizado: string // ISO
}

/** Tipo de service cotizable (cambio de batería, de módulo, de tapa...). */
export interface TipoServicio {
  id: number
  nombre: string
  orden: number
  activo: boolean
}

// ===== Precios de service (lista de precios del taller) =====
/** Parámetros globales: de acá se derivan los precios que no tienen override. */
export interface ConfiguracionPreciosService {
  /** Cotización para pasar la lista USD a pesos. */
  dolar: number
  /** Descuento por pago cash (20 = 20 %). */
  descuento_cash_pct: number
  /** Los pesos se redondean PARA ARRIBA a este múltiplo. */
  redondeo_ars: number
  actualizado: string // ISO
}

/** Calidad/columna de una sección (LCD, OLED, Apple Original...). */
export interface VarianteSeccionService {
  id: number
  nombre: string
  orden: number
}

/** Un equipo reparable del taller (alimenta el selector de la página Service). */
export interface DispositivoService {
  id: number
  nombre: string
  /** Agrupa para el filtro por línea: "11" junta a 11, 11 Pro y 11 Pro Max. */
  linea: string
  orden: number
  activo: boolean
}

/** Los 4 precios ya resueltos (override si hay, fórmula si no). */
export interface PrecioEfectivoService {
  lista_usd: number | null
  cash_usd: number | null
  lista_ars: number | null
  cash_ars: number | null
}

/** Precios crudos de una fila × variante. NULL = se deriva con la fórmula. */
export interface PrecioItemService {
  id: number
  /** Id de la VarianteSeccionService. */
  variante: number
  precio_lista_usd: number | null
  precio_cash_usd: number | null
  precio_lista_ars: number | null
  precio_cash_ars: number | null
  efectivo: PrecioEfectivoService
}

/** Una fila de la lista (modelo, grupo, línea o servicio suelto). */
export interface ItemPrecioService {
  id: number
  /** Id de la sección a la que pertenece. */
  seccion: number
  etiqueta: string
  nota: string
  /** Ids de los DispositivoService a los que aplica esta fila. */
  dispositivos: number[]
  orden: number
  activo: boolean
  precios: PrecioItemService[]
}

// ===== Productos (catálogo central de venta) =====
/** Parámetros del catálogo. El dólar es el MISMO del negocio que usa Service. */
export interface ConfiguracionCatalogo {
  dolar: number
  descuento_cash_pct: number
  redondeo_lista_ars: number
  redondeo_cash_ars: number
  actualizado: string // ISO
}

/** Una categoría del catálogo; con `padre` es un subgrupo (máx. 2 niveles). */
export interface CategoriaCatalogo {
  id: number
  padre: number | null
  nombre: string
  nota: string
  /** Descuento cash propio (auriculares/smartwatch 30); null = global. */
  descuento_cash_pct: number | null
  /** Redondeo propio de la lista $ (Samsung/Apple $1.000); null = global. */
  redondeo_ars: number | null
  /** Samsung/Apple no tienen precio cash. */
  muestra_cash: boolean
  /** Qué tabla del simulador de cuotas aplica. */
  tarifa_cuotas: 'accesorios' | 'equipos'
  /** En la Ficha de equipo sus productos salen como VENTA, no como accesorio. */
  es_equipo: boolean
  orden: number
  activo: boolean
  creado: string // ISO
  actualizado: string // ISO
}

/** Un producto vendible del catálogo central. */
export interface ProductoCatalogo {
  id: number
  categoria: number
  nombre: string
  marca: string
  calidad: string
  nota: string
  a_pedido: boolean
  nuevo: boolean
  /** Equipos vinculados (para la Ficha): el que ES o con los que es compatible. */
  dispositivos: number[]
  /** Costo de reposición (USD). El backend solo se lo manda a administradores. */
  costo_usd?: number | null
  precio_lista_usd: number | null
  precio_cash_usd: number | null
  precio_lista_ars: number | null
  precio_cash_ars: number | null
  /** Los 4 precios resueltos (override si hay, fórmula si no). */
  efectivo: PrecioEfectivoService
  orden: number
  activo: boolean
}

/** Un bloque de la lista de precios (Baterías, Módulos, ...). */
export interface SeccionPreciosService {
  id: number
  nombre: string
  nota: string
  /** Descuento cash propio (promos); null = usa el global. */
  descuento_cash_pct: number | null
  orden: number
  activo: boolean
  variantes: VarianteSeccionService[]
  items: ItemPrecioService[]
  creado: string // ISO
  actualizado: string // ISO
}

// ===== Caja (turnos, arqueo y cierre) =====
// Modelo tomado de los POS de referencia (Square, Shopify, Lightspeed, Toast,
// Odoo, Fudo): la SESIÓN de caja es la entidad central; el cierre es su último
// evento y queda inmutable como comprobante Z numerado.

/** Medio de pago con el que entra plata a la caja.
 *  Es EL MISMO vocabulario que la venta de mostrador (`FormaPago` de
 *  inventario): así una venta cae en el arqueo sin mapeos. */
export type MedioPagoCaja = 'efectivo' | 'transferencia' | 'tarjeta' | 'otro'

/** Catálogo de medios para selectores y desgloses (orden de la UI). */
export const MEDIOS_PAGO_CAJA: { value: MedioPagoCaja; label: string }[] = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'otro', label: 'Otro' },
]

/** Los medios que se concilian contra el cierre de lote de la terminal. */
export const MEDIOS_CON_LOTE: MedioPagoCaja[] = ['tarjeta']

export type TipoMovimientoCaja = 'venta' | 'ingreso' | 'egreso' | 'retiro'

/** Desglose de billetes: denominación (en pesos) -> cantidad contada. */
export type ConteoBilletes = Record<number, number>

/** Billetes ARS en circulación (BCRA); la config elige cuáles mostrar. */
export const DENOMINACIONES_ARS = [20000, 10000, 2000, 1000, 500, 200, 100, 50, 20, 10]

/** Preferencias del módulo: cada función pro se puede prender o apagar. */
export interface CajaConfig {
  /** Ocultar el esperado del efectivo durante el conteo (se revela al confirmar). */
  cierreCiego: boolean
  /** Exigir motivo + nota cuando la diferencia supera la tolerancia. */
  toleranciaActiva: boolean
  /** Tolerancia de diferencia en pesos (solo si `toleranciaActiva`). */
  toleranciaMonto: number
  /** Habilita el movimiento "retiro a bóveda" durante el turno. */
  retirosHabilitados: boolean
  /** Varias cajas nombradas, cada una con su propio turno. */
  multiCaja: boolean
  /** El pre-cierre pide confirmar el cierre de lote de tarjetas. */
  exigirLote: boolean
  /** Fondo que se sugiere al abrir y como "dejar en caja" al cerrar. */
  fondoSugerido: number
  /** Billetes que muestra la grilla de arqueo (subconjunto de DENOMINACIONES_ARS). */
  denominaciones: number[]
}

/** Una caja física del local ("Mostrador", "Service"...). */
export interface CajaRegistradora {
  id: string
  nombre: string
  activa: boolean
  creadaEn: string // ISO
}

/** Todo lo que mueve plata durante un turno (las ventas también son movimientos). */
export interface MovimientoCaja {
  id: string
  cajaId: string
  sesionId: string
  tipo: TipoMovimientoCaja
  /** Ingresos/egresos/retiros son siempre en efectivo; las ventas llevan su medio. */
  medio: MedioPagoCaja
  /** Siempre positivo: el signo lo da el tipo. */
  monto: number
  motivo: string
  detalle?: string
  usuario: string
  fecha: string // ISO
}

/** Un turno de caja: se abre con fondo declarado y se cierra con arqueo. */
export interface SesionCaja {
  id: string
  cajaId: string
  numero: number // correlativo global de turnos
  estado: 'abierta' | 'cerrada'
  abiertaPor: string
  abiertaEn: string // ISO
  fondoInicial: number
  /** Desglose de billetes del fondo, si se contó al abrir. */
  conteoApertura?: ConteoBilletes
  notaApertura?: string
}

/** Comprobante Z: el cierre inmutable de un turno, con todo el detalle. */
export interface CierreCaja {
  id: string
  /** Correlativo global del comprobante (se muestra "Z-0142"). */
  numero: number
  cajaId: string
  /** Nombre de la caja al momento del cierre (sobrevive renombres). */
  cajaNombre: string
  sesionId: string
  sesionNumero: number
  abiertaEn: string // ISO
  cerradaEn: string // ISO
  abiertaPor: string
  cerradoPor: string
  fondoInicial: number
  ventasPorMedio: Record<MedioPagoCaja, number>
  operacionesPorMedio: Record<MedioPagoCaja, number>
  ingresos: number
  egresos: number
  retiros: number
  esperadoPorMedio: Record<MedioPagoCaja, number>
  contadoPorMedio: Record<MedioPagoCaja, number>
  /** Desglose de billetes del arqueo, si se contó con la grilla. */
  conteoCierre?: ConteoBilletes
  diferenciaPorMedio: Record<MedioPagoCaja, number>
  /** Positivo = sobrante, negativo = faltante. */
  diferenciaTotal: number
  motivoDiferencia?: string
  notaDiferencia?: string
  /** Si el arqueo se hizo sin ver el esperado. */
  cierreCiego: boolean
  /** Efectivo que quedó como fondo del próximo turno. */
  fondoSiguiente: number
  /** Efectivo retirado a bóveda/depósito al cerrar. */
  retiroFinal: number
  /** Snapshot de los movimientos del turno (el Z es autocontenido). */
  movimientos: MovimientoCaja[]
}

/** Motivos predefinidos cuando la diferencia supera la tolerancia (patrón Fudo). */
export const MOTIVOS_DIFERENCIA_CAJA = [
  'Faltante de efectivo',
  'Sobrante de efectivo',
  'Divergencia de terminal de tarjeta',
  'Error de carga de movimientos',
  'Vuelto mal dado',
  'Otro',
]

/** Motivos sugeridos por tipo de movimiento manual. */
export const MOTIVOS_MOVIMIENTO_CAJA: Record<'ingreso' | 'egreso' | 'retiro', string[]> = {
  ingreso: ['Aporte de cambio', 'Cobro de deuda', 'Ajuste de fondo', 'Otro'],
  egreso: ['Pago a proveedor', 'Gasto del local', 'Envíos / viáticos', 'Adelanto a empleado', 'Otro'],
  retiro: ['Retiro a bóveda', 'Depósito bancario', 'Retiro del dueño'],
}
