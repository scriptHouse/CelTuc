/**
 * Tipos del dominio de CelTuc.
 *
 * La app es solo frontend: estos tipos describen tanto los datos sembrados
 * (semilla en localStorage) como lo que devolverían los servicios cuando se
 * conecte un backend real, sin tocar los componentes.
 */

// ===== Sesión =====
/** Usuario autenticado, tal como lo devuelve el backend (`/api/auth/me`, login). */
export interface Usuario {
  id: number
  email: string
  username: string
  is_active?: boolean
  is_staff?: boolean
  is_superuser?: boolean
  date_joined?: string
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

// ===== Empleados =====
export type ModalidadHonorario = 'mensual' | 'por_hora' | 'comision'

export interface Empleado {
  id: string
  nombre: string
  apellido: string
  puesto: string
  email: string
  telefono: string
  modalidad: ModalidadHonorario
  honorario: number // mensual / valor hora / % de comisión según modalidad
  activo: boolean
  ingreso: string // ISO
}

export interface Pago {
  id: string
  empleadoId: string
  monto: number
  fecha: string // ISO
  periodo: string // "2026-06"
  nota?: string
}
