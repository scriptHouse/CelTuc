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

// ===== Empleados (backend) =====
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
