import type { Empleado, Pago } from '@/types'
import { getDB, persist, uid, wait } from '@/lib/db'
import { periodoDe } from '@/lib/format'

export type EmpleadoInput = Omit<Empleado, 'id'>

/** Horas promedio mensuales para estimar el costo de un empleado por hora. */
const HORAS_MES = 160

export async function listarEmpleados(): Promise<Empleado[]> {
  await wait()
  return getDB().empleados.map((e) => ({ ...e }))
}

export async function crearEmpleado(input: EmpleadoInput): Promise<Empleado> {
  await wait()
  const db = getDB()
  const empleado: Empleado = { ...input, id: uid('emp') }
  db.empleados.unshift(empleado)
  persist()
  return { ...empleado }
}

export async function actualizarEmpleado(
  id: string,
  patch: Partial<EmpleadoInput>,
): Promise<Empleado> {
  await wait()
  const db = getDB()
  const empleado = db.empleados.find((e) => e.id === id)
  if (!empleado) throw new Error('Empleado no encontrado')
  Object.assign(empleado, patch)
  persist()
  return { ...empleado }
}

export async function eliminarEmpleado(id: string): Promise<void> {
  await wait()
  const db = getDB()
  db.empleados = db.empleados.filter((e) => e.id !== id)
  db.pagos = db.pagos.filter((p) => p.empleadoId !== id)
  persist()
}

// ===== Pagos / honorarios =====

export async function listarPagos(empleadoId?: string): Promise<Pago[]> {
  await wait()
  const pagos = getDB().pagos
  const filtrados = empleadoId ? pagos.filter((p) => p.empleadoId === empleadoId) : pagos
  return filtrados
    .map((p) => ({ ...p }))
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
}

export interface PagoInput {
  empleadoId: string
  monto: number
  fecha?: string
  nota?: string
}

export async function registrarPago(input: PagoInput): Promise<Pago> {
  await wait()
  const db = getDB()
  const fecha = input.fecha ?? new Date().toISOString()
  const pago: Pago = {
    id: uid('pago'),
    empleadoId: input.empleadoId,
    monto: input.monto,
    fecha,
    periodo: periodoDe(new Date(fecha)),
    nota: input.nota,
  }
  db.pagos.unshift(pago)
  persist()
  return { ...pago }
}

/**
 * Costo mensual estimado de un empleado:
 *  - mensual  -> el honorario tal cual.
 *  - por_hora -> honorario × horas promedio del mes.
 *  - comision -> 0 (es variable: depende de las ventas).
 */
export function costoMensualEstimado(empleado: Empleado): number {
  switch (empleado.modalidad) {
    case 'mensual':
      return empleado.honorario
    case 'por_hora':
      return empleado.honorario * HORAS_MES
    case 'comision':
      return 0
  }
}
