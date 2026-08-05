import { Boxes, Contact, CreditCard, DollarSign, FileText, History, LayoutDashboard, ReceiptText, ScanSearch, ShoppingBag, Smartphone, UserCog, Users, Wallet, Wrench } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Código del permiso de módulo que habilita este ítem (ver `Permiso`). */
  permiso?: string
  /** Si es true, solo se muestra a administradores (staff/superusuario/rol admin). */
  soloAdmin?: boolean
  /** Si es true, solo se muestra al superadministrador (dueño). */
  soloSuper?: boolean
}

export const navItems: NavItem[] = [
  { to: '/', label: 'Panel', icon: LayoutDashboard, permiso: 'ver_panel' },
  { to: '/dolar', label: 'Dólar', icon: DollarSign, permiso: 'ver_dolar' },
  { to: '/inventario', label: 'Inventario', icon: Boxes, permiso: 'ver_inventario' },
  { to: '/facturacion', label: 'Facturación', icon: ReceiptText, permiso: 'ver_facturacion' },
  { to: '/clientes', label: 'Clientes', icon: Contact, permiso: 'ver_facturacion' },
  { to: '/caja', label: 'Caja', icon: Wallet, permiso: 'ver_caja' },
  { to: '/empleados', label: 'Empleados', icon: Users, permiso: 'ver_empleados' },
  { to: '/simulador', label: 'Simulador', icon: CreditCard, permiso: 'ver_simulador' },
  { to: '/cotizaciones', label: 'Cotizaciones', icon: Smartphone, permiso: 'ver_cotizaciones' },
  { to: '/service', label: 'Service', icon: Wrench, permiso: 'ver_precios_service' },
  { to: '/productos', label: 'Productos', icon: ShoppingBag, permiso: 'ver_productos' },
  { to: '/equipos', label: 'Equipos', icon: ScanSearch, permiso: 'ver_equipos' },
  // Documentos queda visible a toda cuenta autenticada (no tiene permiso de
  // módulo propio). El backend acota lo sensible por su cuenta: en el historial
  // cada empleado ve solo los documentos que generó él y los administradores
  // ven los de todo el equipo. Si algún día hace falta cerrarlo del todo,
  // sumarle un permiso (p. ej. 'ver_documentos') acá y en la ruta de App.tsx.
  { to: '/documentos', label: 'Documentos', icon: FileText },
  { to: '/usuarios', label: 'Usuarios', icon: UserCog, soloAdmin: true },
  { to: '/auditoria', label: 'Auditoría', icon: History, soloSuper: true },
]
