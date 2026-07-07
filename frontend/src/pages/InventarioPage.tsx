import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Boxes,
  Minus,
  Package,
  PackageSearch,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import { CATEGORIAS } from '@/types'
import type { CategoriaProducto, Producto } from '@/types'
import {
  actualizarProducto,
  ajustarStock,
  crearProducto,
  eliminarProducto,
  listarProductos,
  type ProductoInput,
} from '@/services/inventario'
import { money, num } from '@/lib/format'
import { ctStagger, coincideBusqueda } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { StockBadge } from '@/components/ui/StatusBadge'
import { useToast } from '@/components/ToastProvider'
import { useConfirm } from '@/components/ConfirmProvider'

const schema = z.object({
  sku: z.string().trim().min(1, 'Requerido'),
  nombre: z.string().trim().min(1, 'Requerido'),
  categoria: z.enum(CATEGORIAS as [CategoriaProducto, ...CategoriaProducto[]]),
  marca: z.string().trim().min(1, 'Requerido'),
  costo: z.coerce.number({ invalid_type_error: 'Número' }).min(0, 'Inválido'),
  precio: z.coerce.number({ invalid_type_error: 'Número' }).min(0, 'Inválido'),
  stock: z.coerce.number({ invalid_type_error: 'Número' }).int('Entero').min(0, 'Inválido'),
  stockMinimo: z.coerce.number({ invalid_type_error: 'Número' }).int('Entero').min(0, 'Inválido'),
})
type FormData = z.infer<typeof schema>

const catOptions = [
  { value: '', label: 'Todas las categorías' },
  ...CATEGORIAS.map((c) => ({ value: c, label: c })),
]

export function InventarioPage() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()

  const { data: productos = [], isLoading } = useQuery({
    queryKey: ['productos'],
    queryFn: listarProductos,
  })

  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Producto | null>(null)

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ['productos'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const crear = useMutation({
    mutationFn: (input: ProductoInput) => crearProducto(input),
    onSuccess: () => {
      invalidar()
      toast.success('Producto agregado')
    },
  })
  const actualizar = useMutation({
    mutationFn: ({ id, input }: { id: string; input: ProductoInput }) => actualizarProducto(id, input),
    onSuccess: () => {
      invalidar()
      toast.success('Producto actualizado')
    },
  })
  const ajustar = useMutation({
    mutationFn: ({ id, delta }: { id: string; delta: number }) => ajustarStock(id, delta),
    onSuccess: () => invalidar(),
  })
  const borrar = useMutation({
    mutationFn: (id: string) => eliminarProducto(id),
    onSuccess: () => {
      invalidar()
      toast.success('Producto eliminado')
    },
  })

  const filtrados = useMemo(() => {
    const term = q.trim()
    return productos.filter((p) => {
      const matchTerm = !term || coincideBusqueda(`${p.nombre} ${p.sku} ${p.marca}`, term)
      const matchCat = !cat || p.categoria === cat
      return matchTerm && matchCat
    })
  }, [productos, q, cat])

  const stats = useMemo(() => {
    const unidades = productos.reduce((a, p) => a + p.stock, 0)
    const valor = productos.reduce((a, p) => a + p.stock * p.precio, 0)
    const bajo = productos.filter((p) => p.stock <= p.stockMinimo).length
    return { total: productos.length, unidades, valor, bajo }
  }, [productos])

  function abrirNuevo() {
    setEditando(null)
    setModalOpen(true)
  }
  function abrirEditar(p: Producto) {
    setEditando(p)
    setModalOpen(true)
  }

  async function handleEliminar(p: Producto) {
    const ok = await confirm({
      title: `¿Eliminar "${p.nombre}"?`,
      description: 'Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar',
      tone: 'danger',
    })
    if (ok) borrar.mutate(p.id)
  }

  async function handleSubmit(values: FormData) {
    if (editando) {
      await actualizar.mutateAsync({ id: editando.id, input: values })
    } else {
      await crear.mutateAsync(values)
    }
    setModalOpen(false)
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        icon={Boxes}
        eyebrow="Stock"
        title="Inventario"
        subtitle="Productos, precios y niveles de stock."
        className="ct-rise"
        actions={
          <Button onClick={abrirNuevo}>
            <Plus className="h-4 w-4" />
            Nuevo producto
          </Button>
        }
      />

      {/* Resumen */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard className="ct-stagger-item" style={ctStagger(0)} label="Productos" value={num(stats.total)} icon={Package} />
        <StatCard className="ct-stagger-item" style={ctStagger(1)} label="Unidades" value={num(stats.unidades)} icon={Boxes} />
        <StatCard className="ct-stagger-item" style={ctStagger(2)} label="Valor (venta)" value={money(stats.valor)} icon={PackageSearch} />
        <StatCard className="ct-stagger-item" style={ctStagger(3)} label="Reposición" value={num(stats.bajo)} hint="bajo el mínimo" icon={Package} />
      </div>

      {/* Filtros */}
      <div className="ct-rise mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, SKU o marca"
            className="pl-10"
          />
        </div>
        <Select
          options={catOptions}
          value={cat}
          onChange={setCat}
          placeholder="Categoría"
          className="sm:w-56"
        />
      </div>

      {isLoading ? (
        <TablaSkeleton />
      ) : filtrados.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title={productos.length === 0 ? 'Todavía no hay productos' : 'Sin resultados'}
          description={
            productos.length === 0
              ? 'Cargá tu primer producto para empezar a controlar el stock.'
              : 'Probá con otra búsqueda o cambiá la categoría.'
          }
          action={
            productos.length === 0 ? (
              <Button onClick={abrirNuevo}>
                <Plus className="h-4 w-4" />
                Nuevo producto
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Tabla (md+) */}
          <Card className="ct-rise hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-400">
                    <th className="px-4 py-3 font-semibold">Producto</th>
                    <th className="px-4 py-3 font-semibold">Categoría</th>
                    <th className="px-4 py-3 text-right font-semibold">Precio</th>
                    <th className="px-4 py-3 text-center font-semibold">Stock</th>
                    <th className="px-4 py-3 text-right font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {filtrados.map((p, i) => (
                    <tr key={p.id} className="ct-stagger-fade group hover:bg-ink-50" style={ctStagger(i)}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-ink-900">{p.nombre}</p>
                        <p className="tnum text-xs text-ink-400">
                          {p.sku} · {p.marca}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-ink-600">{p.categoria}</td>
                      <td className="tnum px-4 py-3 text-right font-semibold text-ink-900">{money(p.precio)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <StockAdjust
                            stock={p.stock}
                            onMinus={() => ajustar.mutate({ id: p.id, delta: -1 })}
                            onPlus={() => ajustar.mutate({ id: p.id, delta: 1 })}
                          />
                          <div className="w-[88px] text-center">
                            <StockBadge stock={p.stock} stockMinimo={p.stockMinimo} />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <IconButton label="Editar" onClick={() => abrirEditar(p)}>
                            <Pencil className="h-4 w-4" />
                          </IconButton>
                          <IconButton label="Eliminar" onClick={() => handleEliminar(p)}>
                            <Trash2 className="h-4 w-4" />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Cards (móvil) */}
          <div className="space-y-3 md:hidden">
            {filtrados.map((p, i) => (
              <Card key={p.id} className="ct-stagger-item p-4" style={ctStagger(i)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink-900">{p.nombre}</p>
                    <p className="tnum text-xs text-ink-400">
                      {p.sku} · {p.marca} · {p.categoria}
                    </p>
                  </div>
                  <span className="tnum shrink-0 font-semibold text-ink-900">{money(p.precio)}</span>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <StockAdjust
                      stock={p.stock}
                      onMinus={() => ajustar.mutate({ id: p.id, delta: -1 })}
                      onPlus={() => ajustar.mutate({ id: p.id, delta: 1 })}
                    />
                    <StockBadge stock={p.stock} stockMinimo={p.stockMinimo} />
                  </div>
                  <div className="flex items-center gap-1">
                    <IconButton label="Editar" onClick={() => abrirEditar(p)}>
                      <Pencil className="h-4 w-4" />
                    </IconButton>
                    <IconButton label="Eliminar" onClick={() => handleEliminar(p)}>
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      <ProductoFormModal
        open={modalOpen}
        producto={editando}
        saving={crear.isPending || actualizar.isPending}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmit}
      />
    </div>
  )
}

// ===== Subcomponentes =====

function StockAdjust({
  stock,
  onMinus,
  onPlus,
}: {
  stock: number
  onMinus: () => void
  onPlus: () => void
}) {
  return (
    <div className="inline-flex items-center rounded-xl border border-line-strong">
      <button
        type="button"
        onClick={onMinus}
        disabled={stock <= 0}
        aria-label="Restar una unidad"
        className="grid h-8 w-8 place-items-center rounded-l-xl text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 disabled:opacity-30"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="tnum w-9 text-center text-sm font-semibold text-ink-900">{num(stock)}</span>
      <button
        type="button"
        onClick={onPlus}
        aria-label="Sumar una unidad"
        className="grid h-8 w-8 place-items-center rounded-r-xl text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function IconButton({
  children,
  label,
  onClick,
}: {
  children: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-9 w-9 place-items-center rounded-xl text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-900"
    >
      {children}
    </button>
  )
}

function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: ReactNode
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-ink-500">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-ink-700">{error}</p>}
    </div>
  )
}

function ProductoFormModal({
  open,
  producto,
  saving,
  onClose,
  onSubmit,
}: {
  open: boolean
  producto: Producto | null
  saving: boolean
  onClose: () => void
  onSubmit: (values: FormData) => Promise<void>
}) {
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      sku: '',
      nombre: '',
      categoria: 'Celulares',
      marca: '',
      costo: 0,
      precio: 0,
      stock: 0,
      stockMinimo: 0,
    },
  })

  useEffect(() => {
    if (!open) return
    if (producto) {
      reset({
        sku: producto.sku,
        nombre: producto.nombre,
        categoria: producto.categoria,
        marca: producto.marca,
        costo: producto.costo,
        precio: producto.precio,
        stock: producto.stock,
        stockMinimo: producto.stockMinimo,
      })
    } else {
      reset({
        sku: '',
        nombre: '',
        categoria: 'Celulares',
        marca: '',
        costo: 0,
        precio: 0,
        stock: 0,
        stockMinimo: 0,
      })
    }
  }, [open, producto, reset])

  const categoria = watch('categoria')

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 className="text-lg font-semibold text-ink-950">
          {producto ? 'Editar producto' : 'Nuevo producto'}
        </h2>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-4 overflow-y-auto px-5 py-5"
        noValidate
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre" error={errors.nombre?.message}>
            <Input placeholder="iPhone 15 128GB" {...register('nombre')} />
          </Field>
          <Field label="SKU / código" error={errors.sku?.message}>
            <Input placeholder="CEL-IP15-128" {...register('sku')} />
          </Field>
          <Field label="Categoría" error={errors.categoria?.message}>
            <Select
              options={CATEGORIAS.map((c) => ({ value: c, label: c }))}
              value={categoria}
              onChange={(v) => setValue('categoria', v as CategoriaProducto, { shouldValidate: true })}
            />
          </Field>
          <Field label="Marca" error={errors.marca?.message}>
            <Input placeholder="Apple" {...register('marca')} />
          </Field>
          <Field label="Costo (ARS)" error={errors.costo?.message}>
            <Input type="number" inputMode="numeric" min={0} step="0.01" {...register('costo')} />
          </Field>
          <Field label="Precio de venta (ARS)" error={errors.precio?.message}>
            <Input type="number" inputMode="numeric" min={0} step="0.01" {...register('precio')} />
          </Field>
          <Field label="Stock actual" error={errors.stock?.message}>
            <Input type="number" inputMode="numeric" min={0} {...register('stock')} />
          </Field>
          <Field label="Stock mínimo" error={errors.stockMinimo?.message}>
            <Input type="number" inputMode="numeric" min={0} {...register('stockMinimo')} />
          </Field>
        </div>

        <div className="flex flex-col-reverse gap-2.5 pt-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Guardando…' : producto ? 'Guardar cambios' : 'Agregar producto'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function TablaSkeleton() {
  return (
    <Card className="overflow-hidden">
      <div className="divide-y divide-line">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-4">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3 w-1/4" />
            </div>
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-8 w-28" />
          </div>
        ))}
      </div>
    </Card>
  )
}
