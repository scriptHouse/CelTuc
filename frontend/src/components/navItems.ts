import { Boxes, LayoutDashboard, ReceiptText, UserCog, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Código del permiso de módulo que habilita este ítem (ver `Permiso`). */
  permiso?: string
  /** Si es true, solo se muestra a administradores (staff/superusuario/rol admin). */
  soloAdmin?: boolean
}

export const navItems: NavItem[] = [
  { to: '/', label: 'Panel', icon: LayoutDashboard, permiso: 'ver_panel' },
  { to: '/inventario', label: 'Inventario', icon: Boxes, permiso: 'ver_inventario' },
  { to: '/facturacion', label: 'Facturación', icon: ReceiptText, permiso: 'ver_facturacion' },
  { to: '/empleados', label: 'Empleados', icon: Users, permiso: 'ver_empleados' },
  { to: '/usuarios', label: 'Usuarios', icon: UserCog, soloAdmin: true },
]
