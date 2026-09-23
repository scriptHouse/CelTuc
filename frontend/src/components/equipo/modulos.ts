import { FileText, LayoutGrid, ShoppingBag, Wrench } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Permiso, Rol } from '@/types'
import { navItems } from '@/components/navItems'
import type { NavItem } from '@/components/navItems'

/**
 * Las pantallas del sistema contadas para cualquiera: qué se hace en cada una.
 * Las usan el editor de roles, el selector de rol al dar un acceso y las
 * tarjetas del equipo, para que «qué puede ver» se entienda sin saber qué es
 * un permiso. La fuente de verdad de qué habilita cada código sigue siendo el
 * backend (`usuarios.Permiso`) y el menú (`navItems`).
 */

/** Qué se hace en cada pantalla, en palabras de todos los días. */
const QUE_SE_HACE: Record<string, string> = {
  ver_panel: 'El resumen del negocio: ventas del día, stock y avisos.',
  ver_dolar: 'La cotización del dólar que usa el negocio y la del blue.',
  ver_inventario:
    'El stock de cada sucursal: buscar, vender, ajustar cantidades y pasar mercadería de una sucursal a otra.',
  ver_facturacion: 'Hacer facturas y ver las que ya se hicieron. También abre la lista de Clientes.',
  ver_caja:
    'Cobrar, anotar entradas y salidas de plata, y abrir y cerrar la caja del día. Configurar la caja es de los administradores.',
  ver_empleados:
    'Ver quién es quién en el equipo. Solo mirar: cargar, cambiar o sacar gente es de los administradores.',
  ver_simulador: 'Calcular las cuotas con tarjeta para pasarle a un cliente.',
  ver_cotizaciones: 'Cotizar equipos usados que traen para vender o entregar como parte de pago.',
  ver_equipos: 'La ficha completa de un equipo (venta, toma y service), buscando por IMEI o modelo.',
  ver_precios_service: 'La lista de precios del service técnico.',
  ver_productos: 'El catálogo central de productos y precios.',
}

/** Pantallas que siguen existiendo pero hoy no están en el menú (ver navItems). */
const OCULTAS: Record<string, { titulo: string; icono: LucideIcon }> = {
  ver_precios_service: { titulo: 'Precios de service', icono: Wrench },
  ver_productos: { titulo: 'Productos', icono: ShoppingBag },
}

export interface ModuloInfo {
  codigo: string
  /** Como se llama en el menú (un permiso puede abrir varios ítems: «Facturación · Clientes»). */
  titulo: string
  /** Qué se hace ahí, para cualquiera. */
  que: string
  icono: LucideIcon
  /** false = la pantalla existe pero hoy no aparece en el menú. */
  enMenu: boolean
  /** Posición en el menú (las ocultas van al final). */
  orden: number
}

/** Ítems del menú que abre cada código de permiso. */
const itemsPorPermiso = new Map<string, NavItem[]>()
navItems.forEach((item) => {
  if (!item.permiso) return
  itemsPorPermiso.set(item.permiso, [...(itemsPorPermiso.get(item.permiso) ?? []), item])
})

export function infoModulo(codigo: string, permiso?: Permiso): ModuloInfo {
  const items = itemsPorPermiso.get(codigo) ?? []
  if (items.length) {
    return {
      codigo,
      titulo: items.map((it) => it.label).join(' · '),
      que: QUE_SE_HACE[codigo] ?? permiso?.descripcion ?? '',
      icono: items[0].icon,
      enMenu: true,
      orden: navItems.indexOf(items[0]),
    }
  }
  const oculta = OCULTAS[codigo]
  return {
    codigo,
    titulo: oculta?.titulo ?? permiso?.nombre?.replace(/^Ver /, '') ?? codigo,
    que: QUE_SE_HACE[codigo] ?? permiso?.descripcion ?? '',
    icono: oculta?.icono ?? LayoutGrid,
    enMenu: false,
    orden: 100 + (permiso?.orden ?? 0),
  }
}

/** El catálogo de permisos como pantallas, en el orden del menú. */
export function modulosDelCatalogo(permisos: Permiso[]): ModuloInfo[] {
  return permisos.map((p) => infoModulo(p.codigo, p)).sort((a, b) => a.orden - b.orden)
}

/** Las pantallas que abre una lista de códigos (en el orden del menú). */
export function modulosDeCodigos(codigos: string[]): ModuloInfo[] {
  return codigos.map((c) => infoModulo(c)).sort((a, b) => a.orden - b.orden)
}

/**
 * Cómo se vería el menú de una cuenta con estos permisos: los ítems que abren,
 * más los que ve todo el mundo (Documentos). Los de solo-admin no aparecen.
 */
export function menuConPermisos(codigos: Iterable<string>): NavItem[] {
  const tiene = new Set(codigos)
  return navItems.filter((item) => {
    if (item.soloAdmin || item.soloSuper) return false
    if (!item.permiso) return true
    return tiene.has(item.permiso)
  })
}

/** Pantallas que ve cualquier cuenta que entra, tenga el rol que tenga. */
export const SIEMPRE_VISIBLES = { titulo: 'Documentos', icono: FileText }

/** «Panel, Caja e Inventario»: la lista en una frase. */
export function listaEnPalabras(items: string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  const ultimo = items[items.length - 1]
  const conjuncion = /^[iI]|^[hH][iI]/.test(ultimo) ? 'e' : 'y'
  return `${items.slice(0, -1).join(', ')} ${conjuncion} ${ultimo}`
}

/** Lo que va a ver una cuenta con este rol, en una frase. */
export function queVeEnPalabras(rol: Pick<Rol, 'es_admin' | 'permisos'> | null | undefined): string {
  if (!rol) return `solo ${SIEMPRE_VISIBLES.titulo} (ninguna pantalla del menú)`
  if (rol.es_admin) return 'todas las pantallas, y además puede manejar el sistema'
  const titulos = modulosDeCodigos(rol.permisos)
    .filter((m) => m.enMenu)
    .map((m) => m.titulo)
  return listaEnPalabras([...titulos, SIEMPRE_VISIBLES.titulo])
}
