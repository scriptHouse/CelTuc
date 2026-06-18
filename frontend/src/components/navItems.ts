import { Boxes, LayoutDashboard, ReceiptText, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

export const navItems: NavItem[] = [
  { to: '/', label: 'Panel', icon: LayoutDashboard },
  { to: '/inventario', label: 'Inventario', icon: Boxes },
  { to: '/facturacion', label: 'Facturación', icon: ReceiptText },
  { to: '/empleados', label: 'Empleados', icon: Users },
]
