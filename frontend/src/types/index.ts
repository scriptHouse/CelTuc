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

/**
 * Sesión prestada: el superadministrador entró como otra cuenta desde el admin
 * de Django. Guarda su propia sesión para poder volver de un clic.
 */
export interface Impersonacion {
  /** El superadministrador que está realmente detrás. */
  actor: { id: number; username: string }
  /** Momento (ISO) en que la impersonación caduca sí o sí. */
  expira: string
  /** Sesión propia a la que se vuelve al salir (null = habrá que loguearse). */
  sesionPrevia: { usuario: Usuario; access: string; refresh: string } | null
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

/**
 * Qué documento es: una factura o una nota de crédito. Va aparte de la LETRA
 * (`TipoComprobante`) porque una nota de crédito hereda la letra de la factura
 * que acredita: existen "Nota de crédito A/B/C" igual que "Factura A/B/C".
 */
export type ClaseComprobante = 'factura' | 'nota_credito'

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

/**
 * Un texto del banco de conceptos: lo que dice la factura en vez del detalle.
 *
 * Emitir «con concepto» junta TODOS los renglones en uno solo con este texto.
 * Los administradores arman el banco y marcan uno como `predeterminado` (el que
 * arranca elegido); quien factura elige entre los activos.
 */
export interface ConceptoFactura {
  id: number
  texto: string
  predeterminado: boolean
  orden: number
  activo: boolean
}

/** Una cuenta que factura ante ARCA, con su punto de venta y credenciales. */
export interface Emisor {
  id: number
  nombre: string
  condicion: CondicionEmisor
  cuit: string
  punto_venta: number
  produccion: boolean
  activo: boolean
  /** Marca interna (no fiscal): true = cuenta de Yerba Buena; false = Centro. */
  responsable_yb: boolean
  /** True si tiene certificado + clave cargados (puede autenticar). */
  tiene_credenciales: boolean
  creado: string
  actualizado: string
}

export type EstadoCobro = 'pendiente' | 'pagada'

/**
 * Medio con el que se cobró una factura. Es EL MISMO vocabulario que la venta
 * de mostrador (`MedioPagoCaja`), así el resumen mensual suma sin mapeos.
 * Cadena vacía = no se informó.
 */
export type MedioPagoComprobante =
  | 'efectivo'
  | 'transferencia'
  | 'transf_financiera'
  | 'tarjeta'
  | 'otro'
  | ''
export type DocTipo = 'CUIT' | 'CUIL' | 'DNI' | 'CF'

export interface ItemComprobante {
  id?: number
  descripcion: string
  cantidad: number
  precio_unitario: number // NETO (sin IVA)
  subtotal?: number
}

/** Un comprobante emitido (Factura A, B o C) con su CAE. */
/** Una nota de crédito colgada de una factura (en el detalle de la factura). */
export interface NotaCreditoDeFactura {
  id: number
  tipo: TipoComprobante
  numero_formateado: string
  fecha: string
  /** Importe en positivo (el signo lo da la clase). */
  total: number
  cae: string
  /** True si está oculta de la lista; su CAE (y su crédito) existen igual. */
  oculto: boolean
}

/** La factura que acredita una nota de crédito (en el detalle de la nota). */
export interface FacturaAcreditada {
  id: number
  clase: ClaseComprobante
  tipo: TipoComprobante
  numero_formateado: string
  fecha: string
  total: number
}

export interface Comprobante {
  id: number
  emisor: number
  emisor_nombre?: string
  emisor_cuit?: string
  emisor_condicion?: CondicionEmisor
  /** Solo en la respuesta de emisión: qué stock NO se pudo descontar. */
  avisos_stock?: string[]
  /** Factura o nota de crédito. Las viejas (sin el campo) son facturas. */
  clase: ClaseComprobante
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
  /** Email del cliente (dato interno: envío del PDF y base de clientes). */
  cliente_email?: string
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
  /**
   * Con qué se cobró la factura. Dato INTERNO (no viaja a ARCA): alimenta el
   * resumen mensual del exportador de Facturación. Vacío = no se informó.
   */
  medio_pago?: MedioPagoComprobante
  observaciones?: string
  items?: ItemComprobante[]
  creado?: string
  /** Id de la factura que acredita esta nota de crédito (null en las facturas). */
  comprobante_asociado?: number | null
  /** Esa misma factura, resumida (solo en el detalle de una nota de crédito). */
  asociado?: FacturaAcreditada | null
  /** Notas de crédito de esta factura (solo en el detalle de una factura). */
  notas_credito?: NotaCreditoDeFactura[]
  /** Cuánto de la factura ya se acreditó (solo en el detalle). */
  acreditado?: number
  /** Cuánto queda por acreditar de la factura (solo en el detalle). */
  saldo_acreditable?: number
}

/** Cliente de la base (se arma solo con lo que se carga al facturar y al vender). */
export interface Cliente {
  id: number
  nombre: string
  doc_tipo: DocTipo
  doc_numero: string
  condicion: CondicionFiscal
  telefono: string
  email: string
  creado?: string // ISO
  actualizado?: string // ISO
  /** Estadísticas: solo vienen cuando la lista se pide con `stats` (gestor). */
  cantidad_compras?: number | null
  total_gastado?: number | null
  ultima_compra?: string | null // ISO
}

/** De dónde salió la compra: una factura con CAE o una venta de mostrador. */
export type OrigenCompra = 'factura' | 'venta'

/**
 * Una compra del cliente, de cualquiera de los dos tipos que guarda el sistema.
 * El backend las normaliza a esta forma común para listarlas en una sola línea
 * de tiempo (`titulo` ya viene armado: "Factura C · 0001-00000012" / "Venta de
 * mostrador #34"; `detalle` es la cuenta emisora o la sucursal + forma de pago).
 */
export interface CompraCliente {
  id: number
  origen: OrigenCompra
  /**
   * Sólo en las compras con `origen: 'factura'`: si es una nota de crédito, su
   * `total` viene en NEGATIVO (le devolvió plata al cliente).
   */
  clase?: ClaseComprobante
  titulo: string
  detalle: string
  fecha: string // ISO
  total: number
  estado_cobro: EstadoCobro
  items: ItemComprobante[]
}

/** Resumen de compras del cliente (los dos tipos sumados). */
export interface ResumenCliente {
  cantidad: number
  total: number
  ultima: string | null // ISO
  /** Desglose por tipo, para mostrar de dónde viene cada operación. */
  facturas: number
  ventas: number
}

/** Cliente con su historial de compras (para el detalle del gestor). */
export interface ClienteDetalle extends Cliente {
  resumen: ResumenCliente
  compras: CompraCliente[]
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
  /**
   * En la factura esta fila NO figura por su nombre: se agrupa con los demás
   * marcados en un renglón con el mensaje configurado en Facturación.
   */
  concepto_generico_factura: boolean
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
  /**
   * En la factura este producto NO figura por su nombre: se agrupa con los
   * demás marcados en un renglón con el mensaje configurado en Facturación.
   */
  concepto_generico_factura: boolean
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
/**
 * Con qué se cobró. Cada uno se concilia por separado en el arqueo.
 *
 * Hay DOS transferencias porque no es la misma plata ni el mismo riel: la común
 * entra a la cuenta del Responsable Inscripto y se factura A/B; la FINANCIERA es
 * la del monotributo. En el mostrador se ofrece una u otra según cómo se factura
 * esa parte de la venta, nunca las dos (ver `FORMAS_POR_FACTURACION`).
 */
export type MedioPagoCaja =
  | 'efectivo'
  | 'transferencia'
  | 'transf_financiera'
  | 'tarjeta'
  | 'otro'

/** Catálogo de medios para selectores y desgloses (orden de la UI). */
export const MEDIOS_PAGO_CAJA: { value: MedioPagoCaja; label: string }[] = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'transf_financiera', label: 'Transferencia financiera' },
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

/**
 * Canal fiscal de una caja: qué ventas entran solas según cómo se facturan.
 * 'factura_ri' recibe lo facturado con Responsable Inscripto (Factura A/B);
 * 'general' recibe la Factura C de monotributo y lo que va sin factura;
 * '' es una caja común, fuera del enrutamiento (se elige a mano).
 */
export type CanalCaja = 'factura_ri' | 'general' | ''

/**
 * Cómo se factura una venta de mostrador. Es una etiqueta que queda guardada
 * en la venta y decide a qué caja entra la plata; la factura fiscal en sí se
 * emite desde el módulo Facturación, igual que siempre.
 */
export type FacturacionVenta = 'factura_ri' | 'factura_c' | 'sin_factura'

/** Una caja física del local ("Mostrador", "Service"...). */
export interface CajaRegistradora {
  id: string
  nombre: string
  canal: CanalCaja
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
  /** Cómo se facturó la venta que originó el movimiento (solo tipo venta). */
  facturacion?: FacturacionVenta
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

// ===== Auditoría (solo superadministrador) =====

export type AccionAuditoria =
  | 'crear'
  | 'editar'
  | 'eliminar'
  | 'restaurar'
  | 'ingreso'
  | 'impersonar'

/** El antes y el después de UN campo que cambió. */
export interface CambioAuditoria {
  antes: unknown
  despues: unknown
}

/** Una acción registrada en el historial del sistema. */
export interface RegistroAuditoria {
  id: number
  creado: string // ISO
  accion: AccionAuditoria
  accion_display: string
  /** La cuenta que hizo la acción (null si fue eliminada; queda la foto). */
  usuario: { id: number; username: string; nombre: string } | null
  /** Foto del username al momento de la acción (sobrevive a la cuenta). */
  usuario_username: string
  /** Si la acción se hizo impersonando: el superadmin real detrás. Vacío si no. */
  actor_username: string
  app: string
  /** Nombre visible del módulo ("Inventario", "Facturación"...). */
  modulo: string
  /** Qué tipo de cosa se tocó ("venta", "usuario", "producto"...). */
  modelo: string
  objeto_id: string
  /** Foto en texto del objeto al momento de la acción. */
  objeto: string
  /** Solo lo que cambió: campo → { antes, despues }. */
  cambios: Record<string, CambioAuditoria>
  ip: string | null
}

/** Una página del historial (paginación por offset). */
export interface PaginaAuditoria {
  total: number
  resultados: RegistroAuditoria[]
  /** Solo en la primera página. */
  resumen?: { hoy: number; semana: number; usuarios_hoy: number; total: number }
  /** Usernames que aparecen en el historial (para el filtro). Solo en la primera página. */
  usuarios?: string[]
}

// ===== Asistencia (solo superadministrador) =====

/** Un reloj Hikvision instalado en una sucursal. */
export interface RelojAsistencia {
  id: number
  sucursal: number
  sucursal_nombre: string
  nombre: string
  activo: boolean
  /** IP del reloj dentro de la LAN de la sucursal (la usa el agente). */
  host: string
  puerto: number
  usar_https: boolean
  usuario_isapi: string
  poll_seconds: number
  overlap_seconds: number
  timeout_seconds: number
  backfill_dias: number
  zona_horaria: string
  /** Identidad reportada por el propio reloj vía heartbeat. */
  modelo: string
  numero_serie: string
  firmware: string
  agentes_activos: number
  creado: string
}

export type RelojAsistenciaInput = Omit<
  RelojAsistencia,
  'id' | 'sucursal_nombre' | 'modelo' | 'numero_serie' | 'firmware' | 'agentes_activos' | 'creado'
>

/** El servicio que corre en la notebook de la sucursal. */
export interface AgenteAsistencia {
  id: number
  dispositivo: number
  dispositivo_nombre: string
  sucursal_nombre: string
  nombre: string
  activo: boolean
  /** Primeros caracteres del token (el token completo se muestra una sola vez). */
  token_prefijo: string
  sync_seconds: number
  batch_size: number
  heartbeat_seconds: number
  nivel_log: string
  version: string
  hostname: string
  ultimo_heartbeat: string | null
  iniciado_en: string | null
  reloj_alcanzable: boolean | null
  reloj_error: string
  eventos_pendientes: number
  eventos_error: number
  ultima_sync_reloj: string | null
  en_linea: boolean
  creado: string
}

export interface AgenteAsistenciaInput {
  dispositivo: number
  nombre: string
  activo?: boolean
  sync_seconds?: number
  batch_size?: number
  heartbeat_seconds?: number
  nivel_log?: string
}

/** Estados de asistencia que reporta el reloj (serie MinMoe). */
export type TipoFichada =
  | 'check_in'
  | 'check_out'
  | 'break_out'
  | 'break_in'
  | 'overtime_in'
  | 'overtime_out'
  | 'unknown'

export type MetodoFichada =
  | 'face'
  | 'card'
  | 'fingerprint'
  | 'password'
  | 'remote'
  /** El reloj informa los métodos habilitados en el lector, no el que se usó. */
  | 'multiple'
  | 'unknown'

export interface FichadaAsistencia {
  id: number
  dispositivo: { id: number; nombre: string }
  sucursal: { id: number; nombre: string }
  /** Número del empleado tal como está cargado en el reloj. */
  numero_reloj: string
  nombre_reloj: string
  empleado: { id: number; nombre: string } | null
  estado_mapeo: 'mapeada' | 'sin_mapear'
  ocurrida_en: string
  tipo: TipoFichada
  metodo: MetodoFichada
  origen_id: string
}

export interface FichadaDetalle extends FichadaAsistencia {
  recibida_en: string
  agente: string | null
  /** Payload ISAPI original, para diagnóstico. */
  raw_payload: Record<string, unknown>
}

export interface PaginaFichadas {
  total: number
  resultados: FichadaAsistencia[]
  /** Solo en la primera página. */
  resumen?: { hoy: number; sin_mapear: number }
  dispositivos?: { id: number; nombre: string; sucursal: string }[]
  sucursales?: { id: number; nombre: string }[]
}

/** Estado en vivo de un agente para el panel. */
export interface AgentePanelAsistencia {
  id: number
  nombre: string
  en_linea: boolean
  ultimo_heartbeat: string | null
  iniciado_en: string | null
  version: string
  hostname: string
  reloj_alcanzable: boolean | null
  reloj_error: string
  eventos_pendientes: number
  eventos_error: number
  ultima_sync_reloj: string | null
}

export interface RelojPanelAsistencia {
  id: number
  nombre: string
  activo: boolean
  modelo: string
  numero_serie: string
  firmware: string
  host: string
  sucursal: { id: number; nombre: string }
  agentes: AgentePanelAsistencia[]
  en_linea: boolean
  reloj_en_linea: boolean | null
  ultima_fichada: string | null
  fichadas_hoy: number
  sin_mapear: number
  /** Cuándo se pidió por última vez que el agente reintente la conexión. */
  reintento_pedido: string | null
  /** El reloj cerró el acceso por su propia protección antifuerza-bruta. */
  reloj_bloqueado: boolean
  /** Cuánto falta para que se libere solo. Cero si no está bloqueado. */
  segundos_de_bloqueo: number
}

export interface PanelAsistencia {
  generado_en: string
  dispositivos: RelojPanelAsistencia[]
  totales: {
    fichadas_hoy: number
    sin_mapear: number
    agentes_en_linea: number
    agentes_total: number
    eventos_pendientes: number
  }
}

/** Número del reloj → empleado del sistema. */
export interface MapeoAsistencia {
  id: number
  /** null = vale para todos los relojes. */
  dispositivo: number | null
  dispositivo_nombre: string | null
  numero_reloj: string
  empleado: number
  empleado_nombre: string
  creado: string
}

export interface NumeroSinMapear {
  dispositivo: { id: number; nombre: string }
  numero_reloj: string
  nombre_reloj: string
  cantidad: number
  ultima: string
}

// ===== Horarios, licencias y jornada calculada =====

/**
 * Un bloque horario del patrón. Varios con el mismo índice = jornada partida.
 */
export interface TramoTurno {
  id?: number
  /** Semanal: 0 = lunes … 6 = domingo. Rotativo: día del ciclo (0…N-1). */
  indice_dia: number
  /** `HH:MM` o `HH:MM:SS`. */
  hora_entrada: string
  hora_salida: string
}

export type TipoCicloTurno = 'semanal' | 'rotativo'

export interface TurnoAsistencia {
  id: number
  nombre: string
  activo: boolean
  /** `semanal` repite por día de semana; `rotativo` cada `dias_ciclo` días. */
  tipo_ciclo: TipoCicloTurno
  dias_ciclo: number
  /** Ancla del ciclo rotativo (`aaaa-mm-dd`), null si es semanal. */
  fecha_inicio_ciclo: string | null
  /** Minutos de gracia antes de marcar la llegada como tarde. */
  tolerancia_entrada: number
  tolerancia_salida: number
  /** Refichadas dentro de estos minutos cuentan una sola vez (doble lectura). */
  minutos_antirebote: number
  tramos: TramoTurno[]
  minutos_semanales: number
  empleados_asignados: number
  creado: string
}

export interface AsignacionTurno {
  id: number
  empleado: number
  empleado_nombre: string
  turno: number
  turno_nombre: string
  desde: string
  /** null = vigente. */
  hasta: string | null
  /** Solo rotativos: corre el patrón N días para esta persona (fases opuestas). */
  desfase_ciclo: number
  vigente: boolean
  creado: string
}

/**
 * En qué sucursal se espera a un empleado, y desde cuándo.
 *
 * Las filas se pueden superponer a propósito: gana la más específica (período
 * más corto; a igual período, la que limita días de la semana). Sin ninguna
 * fila vale la sucursal fija del empleado.
 */
export interface AsignacionSucursal {
  id: number
  empleado: number
  empleado_nombre: string
  sucursal: number
  sucursal_nombre: string
  desde: string
  /** null = sin fecha de fin. */
  hasta: string | null
  /** `[0, 1]` = lunes y martes. Vacío = todos los días del período. */
  dias_semana: number[]
  todos_los_dias: boolean
  vigente: boolean
  motivo: string
  creado: string
}

export type TipoLicencia =
  | 'vacaciones'
  | 'enfermedad'
  | 'especial'
  | 'franco'
  | 'suspension'
  | 'otro'

export interface LicenciaAsistencia {
  id: number
  empleado: number
  empleado_nombre: string
  tipo: TipoLicencia
  tipo_display: string
  desde: string
  hasta: string
  dias: number
  /** false = licencia por horas (media jornada, turno médico…). */
  jornada_completa: boolean
  /** `HH:MM`, solo si no es de día completo. */
  hora_desde: string | null
  hora_hasta: string | null
  observacion: string
  creado: string
}

export type TipoFeriado = 'nacional' | 'provincial' | 'puente' | 'propio'

/** Un día en el que no se espera que nadie trabaje. */
export interface FeriadoAsistencia {
  id: number
  fecha: string
  nombre: string
  tipo: TipoFeriado
  tipo_display: string
  /** null = aplica a todas las sucursales. */
  sucursal: number | null
  sucursal_nombre: string | null
  creado: string
}

export type EstadoJornada =
  | 'ok'
  | 'tarde'
  | 'salida_temprana'
  | 'incompleta'
  | 'ausente'
  | 'licencia'
  | 'feriado'
  | 'no_laborable'
  | 'sin_turno'
  | 'sin_reloj'

/** Un bloque continuo de presencia: entró y salió. */
export interface TramoJornada {
  entrada: string
  salida: string | null
  minutos: number
  /** Sin salida: se olvidó de fichar. */
  abierto: boolean
}

/** El hueco entre dos tramos: se fue y volvió el mismo día. */
export interface SalidaParcial {
  desde: string
  hasta: string
  minutos: number
}

/** El día de una persona, ya analizado por el backend. */
export interface JornadaAsistencia {
  fecha: string
  empleado: { id: number; nombre: string } | null
  nombre: string
  numero_reloj: string
  sin_mapear: boolean
  turno: string
  /** Ej: `09:00-13:00 / 17:00-21:00`. */
  horario_esperado: string
  estado: EstadoJornada
  estado_display: string
  tramos: TramoJornada[]
  salidas_parciales: SalidaParcial[]
  primera: string | null
  ultima: string | null
  minutos_trabajados: number
  minutos_esperados: number
  minutos_fuera: number
  llegada_tarde_minutos: number
  salida_temprana_minutos: number
  fichadas: number
  licencia: {
    tipo: TipoLicencia
    tipo_display: string
    desde: string
    hasta: string
    jornada_completa: boolean
    hora_desde: string | null
    hora_hasta: string | null
    observacion: string
  } | null
  feriado: { nombre: string; tipo: TipoFeriado; tipo_display: string } | null
  /** Feriado en el que igual se trabajó (dato para liquidar). */
  trabajo_en_feriado: boolean
  /** Dónde le tocaba estar ese día. */
  sucursal_esperada: { id: number; nombre: string } | null
  /** En qué locales fichó de verdad (lo sabe el reloj que la tomó). */
  sucursales_fichadas: { id: number; nombre: string }[]
  /** Fichó, pero en ningún reloj de la sucursal donde se lo esperaba. */
  fichada_en_otra_sucursal: boolean
  inconsistencias: InconsistenciaJornada[]
  /** Cuántas de esas siguen esperando una decisión. */
  pendientes: number
}

export interface RespuestaResumenAsistencia {
  desde: string
  hasta: string
  resultados: JornadaAsistencia[]
  resumen: {
    jornadas: number
    minutos_trabajados: number
    minutos_esperados: number
    con_salida_parcial: number
    en_otra_sucursal: number
    inconsistencias: number
    pendientes: number
    por_estado: Partial<Record<EstadoJornada, number>>
  }
}

// --- Inconsistencias ---------------------------------------------------------

export type TipoInconsistencia =
  | 'llegada_tarde'
  | 'salida_temprana'
  | 'falta_entrada'
  | 'falta_salida'
  | 'ausencia'
  | 'pausa_excesiva'
  | 'jornada_incompleta'
  | 'exceso_jornada'
  | 'sucursal_incorrecta'
  | 'trabajo_en_feriado'
  | 'dia_no_laborable'

export type SeveridadInconsistencia = 'leve' | 'moderada' | 'grave'

/** `pendiente` no se guarda: es simplemente que nadie la resolvió todavía. */
export type EstadoInconsistencia = 'pendiente' | 'justificada' | 'rechazada'

/**
 * Cuándo un día pasa a ser algo para revisar.
 *
 * Con `turno` vacío la regla vale para todos; una regla con turno le gana a la
 * global para ese turno. Apagarla no la borra: deja de reportar ese tipo.
 */
export interface ReglaInconsistencia {
  id: number
  tipo: TipoInconsistencia
  tipo_display: string
  /** null = vale para todos los turnos. */
  turno: number | null
  turno_nombre: string | null
  activa: boolean
  /** null en llegada tarde y salida temprana = usa la tolerancia del turno. */
  umbral_minutos: number | null
  usa_umbral: boolean
  etiqueta_umbral: string
  ayuda: string
  severidad: SeveridadInconsistencia
  severidad_display: string
  requiere_justificacion: boolean
  creado: string
}

/** Una inconsistencia dentro de una jornada del resumen. */
export interface InconsistenciaJornada {
  tipo: TipoInconsistencia
  tipo_display: string
  severidad: SeveridadInconsistencia
  severidad_display: string
  /** Magnitud: minutos de atraso, de exceso, de pausa… según el tipo. */
  minutos: number
  detalle: string
  requiere_justificacion: boolean
  estado: EstadoInconsistencia
  motivo: string
  resuelta_por: string
  /** `empleado|fecha|tipo`: la identifica entre recálculos. */
  clave: string
}

/** La misma inconsistencia, pero en la pantalla propia: trae de quién y cuándo. */
export interface FilaInconsistencia extends InconsistenciaJornada {
  fecha: string
  empleado: { id: number; nombre: string } | null
  nombre: string
  turno: string
  horario_esperado: string
  sucursal_esperada: { id: number; nombre: string } | null
  estado_jornada: EstadoJornada
  estado_jornada_display: string
}

export interface RespuestaInconsistencias {
  desde: string
  hasta: string
  resultados: FilaInconsistencia[]
  resumen: {
    total: number
    pendientes: number
    justificadas: number
    rechazadas: number
    graves: number
    por_tipo: Partial<Record<TipoInconsistencia, number>>
  }
}

// --- Calendario mensual -------------------------------------------------------

/**
 * El semaforo de un dia.
 *
 * Son estados de bien/mal, no categorias. La interfaz los acompania SIEMPRE con
 * un icono y una etiqueta: rojo y verde son justo el par que no distingue el
 * daltonismo mas comun, asi que el color no puede ser lo unico que lleva el dato.
 */
export type EstadoDiaCalendario =
  | 'verde'
  | 'amarillo'
  | 'rojo'
  | 'sin_actividad'
  | 'futuro'

export interface DiaCalendario {
  fecha: string
  estado: EstadoDiaCalendario
  /** Cuanta gente se esperaba: los que ficharon mas los ausentes. */
  esperados: number
  presentes: number
  ausentes: number
  /** Personas con al menos una inconsistencia sin justificar. */
  con_novedad: number
  licencias: number
  inconsistencias: number
  pendientes: number
  minutos_trabajados: number
  minutos_esperados: number
  feriado: { nombre: string; tipo: TipoFeriado; tipo_display: string } | null
  es_hoy: boolean
}

export interface RespuestaCalendario {
  /** `2026-08`. */
  mes: string
  desde: string
  hasta: string
  dias: DiaCalendario[]
  resumen: {
    perfectos: number
    con_novedades: number
    sin_marcaciones: number
    pendientes: number
    minutos_trabajados: number
  }
}

// --- Legajo de asistencia de un empleado --------------------------------------

/** Los números de un conjunto de jornadas: sirven igual para un mes o un año. */
export interface TotalesLegajo {
  jornadas: number
  dias_trabajados: number
  minutos_trabajados: number
  minutos_esperados: number
  /** Positivo: trabajó de más. Negativo: quedó debiendo. */
  saldo_minutos: number
  minutos_tarde: number
  dias_tarde: number
  minutos_salida_temprana: number
  ausencias: number
  dias_licencia: number
  salidas_parciales: number
  minutos_fuera: number
  inconsistencias: number
  pendientes: number
  por_estado: Partial<Record<EstadoJornada, number>>
}

export interface MesLegajo extends TotalesLegajo {
  /** `2026-08`. */
  mes: string
  etiqueta: string
  etiqueta_corta: string
}

/** Una línea por día: lo justo para pintar un calendario o un año entero. */
export interface DiaLegajo {
  fecha: string
  estado: EstadoJornada
  estado_display: string
  minutos_trabajados: number
  minutos_esperados: number
  llegada_tarde_minutos: number
  inconsistencias: number
  pendientes: number
  sucursal: string
}

export interface InconsistenciaLegajo extends InconsistenciaJornada {
  fecha: string
  turno: string
  horario_esperado: string
  estado_jornada: EstadoJornada
}

/**
 * Todo lo de asistencia de una persona, en tres niveles de zoom del mismo dato:
 * el agregado por mes, una línea por día y el detalle completo.
 *
 * `con_detalle` es false en períodos largos: un año de jornadas con tramos no
 * lo mira nadie y pesa de más, así que ahí se trabaja con `por_mes` y `dias`.
 */
export interface LegajoAsistencia {
  empleado: { id: number; nombre: string; sucursal: string; turno_vigente: string }
  desde: string
  hasta: string
  con_detalle: boolean
  resumen: TotalesLegajo
  por_mes: MesLegajo[]
  dias: DiaLegajo[]
  jornadas: JornadaAsistencia[]
  inconsistencias: InconsistenciaLegajo[]
  licencias: LicenciaAsistencia[]
}

/** Metadatos del backend: qué tipos existen y qué significa el umbral de cada uno. */
export interface CatalogoInconsistencias {
  tipos: {
    tipo: TipoInconsistencia
    tipo_display: string
    etiqueta_umbral: string
    usa_umbral: boolean
    umbral_defecto: number | null
    severidad_defecto: SeveridadInconsistencia
    ayuda: string
  }[]
  severidades: { value: SeveridadInconsistencia; label: string }[]
  estados: { value: EstadoInconsistencia; label: string }[]
  /** Sucursales sin reloj activo: esas jornadas no se evalúan. */
  sucursales_sin_reloj: { id: number; nombre: string }[]
}
