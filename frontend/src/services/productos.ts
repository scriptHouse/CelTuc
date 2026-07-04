import type { CategoriaCatalogo, ConfiguracionCatalogo, ProductoCatalogo } from '@/types'
import { api } from '@/lib/api'
import { useAuth } from '@/store/auth'

/**
 * Productos: el catálogo central de todo lo que se vende (hoja "Accesorios" +
 * lo que se cargue: iPhones, etc.). Los precios sin override se derivan del
 * dólar del negocio (compartido con Precios de Service). Leer requiere
 * `ver_productos` (o `ver_equipos`, para la Ficha); escribir es solo admin.
 */

const token = () => useAuth.getState().access

export interface ConfiguracionCatalogoInput {
  /** Editarlo también recalcula la lista de Service (dólar compartido). */
  dolar?: number
  descuento_cash_pct?: number
  redondeo_lista_ars?: number
  redondeo_cash_ars?: number
}

export interface CategoriaCatalogoInput {
  nombre: string
  padre?: number | null
  nota?: string
  descuento_cash_pct?: number | null
  redondeo_ars?: number | null
  muestra_cash?: boolean
  tarifa_cuotas?: 'accesorios' | 'equipos'
  es_equipo?: boolean
  orden?: number
  activo?: boolean
}

export interface ProductoCatalogoInput {
  categoria: number
  nombre: string
  marca?: string
  calidad?: string
  nota?: string
  a_pedido?: boolean
  nuevo?: boolean
  dispositivos?: number[]
  precio_lista_usd?: number | null
  precio_cash_usd?: number | null
  precio_lista_ars?: number | null
  precio_cash_ars?: number | null
  orden?: number
  activo?: boolean
}

export function obtenerConfiguracionCatalogo(): Promise<ConfiguracionCatalogo> {
  return api.get<ConfiguracionCatalogo>('/productos/configuracion/', token())
}

export function actualizarConfiguracionCatalogo(
  input: ConfiguracionCatalogoInput,
): Promise<ConfiguracionCatalogo> {
  return api.patch<ConfiguracionCatalogo>('/productos/configuracion/', input, token())
}

export function listarCategorias(): Promise<CategoriaCatalogo[]> {
  return api.get<CategoriaCatalogo[]>('/productos/categorias/', token())
}

export function crearCategoria(input: CategoriaCatalogoInput): Promise<CategoriaCatalogo> {
  return api.post<CategoriaCatalogo>('/productos/categorias/', input, token())
}

export function actualizarCategoria(
  id: number,
  input: Partial<CategoriaCatalogoInput>,
): Promise<CategoriaCatalogo> {
  return api.patch<CategoriaCatalogo>(`/productos/categorias/${id}/`, input, token())
}

export function eliminarCategoria(id: number): Promise<void> {
  return api.del<void>(`/productos/categorias/${id}/`, token())
}

export function listarProductos(): Promise<ProductoCatalogo[]> {
  return api.get<ProductoCatalogo[]>('/productos/items/', token())
}

export function crearProducto(input: ProductoCatalogoInput): Promise<ProductoCatalogo> {
  return api.post<ProductoCatalogo>('/productos/items/', input, token())
}

export function actualizarProducto(
  id: number,
  input: Partial<ProductoCatalogoInput>,
): Promise<ProductoCatalogo> {
  return api.patch<ProductoCatalogo>(`/productos/items/${id}/`, input, token())
}

export function eliminarProducto(id: number): Promise<void> {
  return api.del<void>(`/productos/items/${id}/`, token())
}
