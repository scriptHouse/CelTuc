import type { Producto } from '@/types'
import { getDB, persist, uid, wait } from '@/lib/db'

export type ProductoInput = Omit<Producto, 'id' | 'creadoEn' | 'actualizadoEn'>

export async function listarProductos(): Promise<Producto[]> {
  await wait()
  // Copia para que React Query maneje su propia referencia inmutable.
  return getDB().productos.map((p) => ({ ...p }))
}

export async function crearProducto(input: ProductoInput): Promise<Producto> {
  await wait()
  const db = getDB()
  const ahora = new Date().toISOString()
  const producto: Producto = { ...input, id: uid('prod'), creadoEn: ahora, actualizadoEn: ahora }
  db.productos.unshift(producto)
  persist()
  return { ...producto }
}

export async function actualizarProducto(
  id: string,
  patch: Partial<ProductoInput>,
): Promise<Producto> {
  await wait()
  const db = getDB()
  const producto = db.productos.find((p) => p.id === id)
  if (!producto) throw new Error('Producto no encontrado')
  Object.assign(producto, patch, { actualizadoEn: new Date().toISOString() })
  persist()
  return { ...producto }
}

export async function eliminarProducto(id: string): Promise<void> {
  await wait()
  const db = getDB()
  db.productos = db.productos.filter((p) => p.id !== id)
  persist()
}

/** Suma/resta unidades de stock (no baja de 0). */
export async function ajustarStock(id: string, delta: number): Promise<Producto> {
  await wait(90)
  const db = getDB()
  const producto = db.productos.find((p) => p.id === id)
  if (!producto) throw new Error('Producto no encontrado')
  producto.stock = Math.max(0, producto.stock + delta)
  producto.actualizadoEn = new Date().toISOString()
  persist()
  return { ...producto }
}
