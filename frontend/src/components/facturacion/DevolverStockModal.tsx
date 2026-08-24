import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Info, PackagePlus } from 'lucide-react'
import type { Comprobante } from '@/types'
import { devolverStockNotaCredito } from '@/services/facturacion'
import { listarProductos } from '@/services/productos'
import { listarSucursales } from '@/services/inventario'
import { money } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAuth } from '@/store/auth'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ToastProvider'

/**
 * Después de acreditar: ¿volvió la mercadería al local?
 *
 * La nota de crédito NO toca el stock por su cuenta, a propósito. Acreditar y
 * recibir la mercadería son dos cosas distintas: se acredita por un error de
 * facturación, por un descuento, por una devolución que todavía no llegó… Por
 * eso el sistema pregunta y decide la persona que atiende.
 *
 * Qué producto vuelve tampoco se puede adivinar: los renglones del comprobante
 * son texto libre (y si se facturó con concepto genérico, es UNO solo que dice
 * "Servicio técnico"). Así que se proponen ya emparejados por nombre con el
 * catálogo y la persona confirma, corrige o destilda.
 *
 * Si la cuenta no tiene acceso a Inventario, el modal directamente no se abre
 * (lo decide quien lo monta): no tendría con qué contestar.
 */

interface Fila {
  key: string
  /** Lo que dice el renglón del comprobante. */
  descripcion: string
  /** Producto del catálogo al que se le suma (vacío = no vuelve). */
  productoId: string
  cantidad: number
  incluida: boolean
  /** El emparejamiento lo propuso el sistema (no lo eligió la persona). */
  sugerido: boolean
}

/** Nombre con el que un producto del catálogo aparece en una factura. */
function nombreDeCatalogo(p: { nombre: string; calidad: string }): string {
  return [p.nombre, p.calidad].filter(Boolean).join(' · ')
}

/** Normaliza para comparar: sin tildes, sin dobles espacios, en minúsculas. */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function DevolverStockModal({
  nota,
  onCerrar,
}: {
  /** La nota de crédito recién emitida; `null` mantiene el modal cerrado. */
  nota: Comprobante | null
  onCerrar: () => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const usuario = useAuth((s) => s.usuario)

  const { data: sucursales = [], isLoading: cargandoSucursales } = useQuery({
    queryKey: ['inv-sucursales'],
    queryFn: listarSucursales,
    enabled: nota != null,
    retry: false,
  })
  const { data: catalogo = [] } = useQuery({
    queryKey: ['productos-items'],
    queryFn: listarProductos,
    enabled: nota != null,
    retry: false,
  })

  const activas = useMemo(
    () => sucursales.filter((s) => s.activa).sort((a, b) => a.orden - b.orden || a.id - b.id),
    [sucursales],
  )
  const productos = useMemo(
    () =>
      catalogo
        .filter((p) => p.activo)
        .map((p) => ({ id: String(p.id), etiqueta: nombreDeCatalogo(p), nombre: p.nombre })),
    [catalogo],
  )

  const [sucursalSel, setSucursalSel] = useState('')
  const [filas, setFilas] = useState<Fila[]>([])

  // Sucursal por defecto: la del empleado logueado y, si no tiene (admins), la
  // primera activa. Es la misma regla que usa el descuento al facturar.
  useEffect(() => {
    if (nota == null || sucursalSel !== '' || activas.length === 0) return
    const propia = activas.find((s) => s.id === usuario?.sucursal?.id)
    setSucursalSel(String((propia ?? activas[0]).id))
  }, [nota, activas, sucursalSel, usuario])

  /**
   * Los renglones de la nota, ya emparejados con el catálogo cuando se puede:
   * primero por el nombre exacto tal cual sale impreso, y si no, por el nombre
   * del producto solo. Lo que no empareja arranca destildado, para que nadie
   * sume stock sin querer.
   */
  useEffect(() => {
    if (nota == null) return
    setFilas(
      (nota.items ?? []).map((it, i) => {
        const buscado = normalizar(it.descripcion)
        const match =
          productos.find((p) => normalizar(p.etiqueta) === buscado) ??
          productos.find((p) => normalizar(p.nombre) === buscado)
        const cantidad = Math.max(1, Math.round(Number(it.cantidad) || 1))
        return {
          key: `dev-${it.id ?? i}`,
          descripcion: it.descripcion,
          productoId: match?.id ?? '',
          cantidad,
          incluida: Boolean(match),
          sugerido: Boolean(match),
        }
      }),
    )
    // `productos` cambia de identidad en cada render de la query; con la nota alcanza.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nota, catalogo])

  const opcionesSucursal = activas.map((s) => ({ value: String(s.id), label: s.nombre }))
  const opcionesProducto = [
    { value: '', label: 'No vuelve al stock' },
    ...productos.map((p) => ({ value: p.id, label: p.etiqueta })),
  ]

  const aDevolver = filas.filter((f) => f.incluida && f.productoId && f.cantidad > 0)
  const unidades = aDevolver.reduce((a, f) => a + f.cantidad, 0)
  // Sin sucursales no hay dónde poner la mercadería: o la cuenta no ve
  // Inventario (403) o no hay ninguna activa. Se espera a que la consulta
  // termine para no decirlo mientras carga.
  const sinAcceso = !cargandoSucursales && activas.length === 0

  const devolver = useMutation({
    mutationFn: () =>
      devolverStockNotaCredito(nota!.id, {
        sucursal: Number(sucursalSel),
        items: aDevolver.map((f) => ({ producto: Number(f.productoId), cantidad: f.cantidad })),
      }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['inv-stock'] })
      queryClient.invalidateQueries({ queryKey: ['inv-movimientos'] })
      queryClient.invalidateQueries({ queryKey: ['productos-items'] })
      if (r.avisos.length) toast.info('Stock devuelto con avisos', r.avisos.join(' '))
      else toast.success('Mercadería de vuelta en el stock', r.detail)
      onCerrar()
    },
    onError: (e: Error) => toast.error('No se pudo sumar al stock', e.message),
  })

  function actualizar(key: string, patch: Partial<Fila>) {
    setFilas((list) => list.map((f) => (f.key === key ? { ...f, ...patch } : f)))
  }

  return (
    <Modal open={nota != null} onClose={onCerrar} size="lg" labelledBy="devolver-stock-titulo">
      {nota && (
        <>
          <div className="border-b border-line px-5 py-4">
            <h2
              id="devolver-stock-titulo"
              className="flex items-center gap-2 text-lg font-semibold text-ink-950"
            >
              <PackagePlus className="h-5 w-5 text-ink-400" aria-hidden />
              ¿Volvió la mercadería?
            </h2>
            <p className="mt-0.5 text-xs text-ink-400">
              Nota de crédito {nota.tipo} {nota.numero_formateado} · {money(nota.total)} — ya
              emitida con CAE.
            </p>
          </div>

          <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-5">
            {cargandoSucursales ? (
              <div className="space-y-2.5">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-11 w-full sm:w-72" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : sinAcceso ? (
              <p className="rounded-xl border border-line bg-ink-50 px-3.5 py-3 text-sm leading-relaxed text-ink-600">
                Tu cuenta no tiene acceso al módulo de <b>Inventario</b>, así que desde acá no se
                puede tocar el stock. Si la mercadería volvió, pedile a un administrador que la
                cargue.
              </p>
            ) : (
              <>
                <p className="text-sm leading-relaxed text-ink-600">
                  La nota de crédito ya salió. Si el producto <b>volvió al local</b>, sumalo al
                  stock ahora; si fue un error de facturación o un descuento, no hace falta.
                </p>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-ink-500">
                    Vuelve a la sucursal
                  </label>
                  <Select
                    options={opcionesSucursal}
                    value={sucursalSel}
                    onChange={setSucursalSel}
                    className="sm:w-72"
                  />
                </div>

                <div className="space-y-2.5">
                  {filas.map((f) => (
                    <div
                      key={f.key}
                      className={cn(
                        'rounded-xl border p-3 transition-colors',
                        f.incluida ? 'border-line-strong bg-surface' : 'border-line bg-ink-50/60',
                      )}
                    >
                      <label className="flex cursor-pointer items-start gap-2.5">
                        <input
                          type="checkbox"
                          checked={f.incluida}
                          onChange={(e) => actualizar(f.key, { incluida: e.target.checked })}
                          className="mt-0.5 h-4 w-4 shrink-0 rounded border-line-strong accent-ink-950"
                        />
                        <span
                          className={cn(
                            'min-w-0 flex-1 text-sm font-medium',
                            f.incluida ? 'text-ink-900' : 'text-ink-400',
                          )}
                        >
                          {f.descripcion}
                        </span>
                      </label>
                      {f.incluida && (
                        <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-6">
                          <Select
                            options={opcionesProducto}
                            value={f.productoId}
                            onChange={(v) => actualizar(f.key, { productoId: v, sugerido: false })}
                            searchable
                            placeholder="Elegí el producto del catálogo…"
                            className="min-w-[12rem] flex-1"
                          />
                          <label className="flex items-center gap-1.5 text-xs text-ink-400">
                            Cant.
                            <Input
                              type="number"
                              min={1}
                              step="1"
                              value={f.cantidad}
                              onChange={(e) =>
                                actualizar(f.key, {
                                  cantidad: Math.max(1, Math.round(Number(e.target.value) || 1)),
                                })
                              }
                              className="h-9 w-20 px-2 text-center"
                            />
                          </label>
                        </div>
                      )}
                      {f.incluida && !f.productoId && (
                        <p className="mt-1.5 pl-6 text-xs text-ink-500">
                          Este renglón no está en el catálogo: elegí a qué producto sumarle las
                          unidades, o destildalo.
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                <p className="flex items-start gap-2.5 rounded-xl border border-line bg-ink-50 px-4 py-3 text-xs leading-relaxed text-ink-600">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-500" aria-hidden />
                  <span>
                    El movimiento queda firmado como{' '}
                    <b>«Nota de crédito {nota.tipo} {nota.numero_formateado}»</b> en Inventario, y
                    se puede hacer una sola vez. Contestar que no acá no cambia nada del
                    comprobante.
                  </span>
                </p>
              </>
            )}
          </div>

          <div className="flex flex-col-reverse gap-2.5 border-t border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="tnum text-xs text-ink-400">
              {sinAcceso || cargandoSucursales
                ? ''
                : unidades > 0
                  ? `${unidades} unidad${unidades === 1 ? '' : 'es'} vuelven al stock`
                  : 'Nada seleccionado'}
            </p>
            <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={onCerrar}>
                {sinAcceso ? 'Cerrar' : 'No volvió nada'}
              </Button>
              {!sinAcceso && !cargandoSucursales && (
                <Button
                  onClick={() => devolver.mutate()}
                  disabled={unidades === 0 || sucursalSel === '' || devolver.isPending}
                >
                  <PackagePlus className="h-4 w-4" />
                  {devolver.isPending ? 'Sumando…' : 'Sumar al stock'}
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </Modal>
  )
}
